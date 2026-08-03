-- ═══════════════════════════════════════════════════════════
-- Firovia — Rate limiting Edge Functions
-- ═══════════════════════════════════════════════════════════
-- Défense en profondeur contre :
--   • Spam / bruteforce sur les Edge Functions post-auth
--   • Abus d'API (envoi massif d'emails, création checkout sessions)
--   • Comptes compromis qui tenteraient de submerger le système
--
-- Turnstile couvre déjà signup/login/forgot-password (unauthenticated).
-- Ici on protège les endpoints qui exigent un JWT valide.
--
-- Approche : table rate_limits avec index sur (bucket, occurred_at).
-- Fenêtre glissante d'1 min. Nettoyage périodique automatique.

create table if not exists public.rate_limits (
  id bigserial primary key,
  bucket text not null,                    -- identifiant unique du seau (ex: "stripe-checkout:user:UUID")
  occurred_at timestamptz not null default now()
);

create index if not exists idx_rate_limits_bucket_time
  on public.rate_limits (bucket, occurred_at desc);


-- ─────────────────────────────────────────────────────────────
-- Fonction : check_and_increment_rate_limit
-- ─────────────────────────────────────────────────────────────
-- Vérifie si le seau a dépassé la limite dans la fenêtre donnée.
-- Si NON → incrémente le compteur et retourne { ok: true, remaining }.
-- Si OUI → retourne { ok: false, retry_after } sans incrémenter.
--
-- Params :
--   p_bucket   : ex "stripe-checkout:user:abc123"
--   p_limit    : nb max de requêtes dans la fenêtre
--   p_window_s : durée de la fenêtre en secondes

create or replace function public.check_rate_limit(
  p_bucket text,
  p_limit int,
  p_window_s int
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  count_in_window int;
  oldest_in_window timestamptz;
  window_start timestamptz := now() - (p_window_s || ' seconds')::interval;
begin
  -- Compte les requêtes dans la fenêtre glissante
  select count(*), min(occurred_at)
    into count_in_window, oldest_in_window
    from public.rate_limits
   where bucket = p_bucket
     and occurred_at > window_start;

  if count_in_window >= p_limit then
    -- Bloqué. Calcule combien de temps attendre.
    return jsonb_build_object(
      'ok', false,
      'limit', p_limit,
      'remaining', 0,
      'retry_after_s', extract(epoch from (oldest_in_window + (p_window_s || ' seconds')::interval - now()))::int
    );
  end if;

  -- OK : incrémente
  insert into public.rate_limits (bucket) values (p_bucket);

  return jsonb_build_object(
    'ok', true,
    'limit', p_limit,
    'remaining', p_limit - count_in_window - 1
  );
end;
$$;

grant execute on function public.check_rate_limit(text, int, int) to service_role;


-- ─────────────────────────────────────────────────────────────
-- Cleanup automatique des vieilles entrées (> 1h)
-- ─────────────────────────────────────────────────────────────
-- Appelé opportunistement par le check (1 chance sur 100 par appel).
-- Évite de faire grossir la table indéfiniment sans avoir besoin
-- d'un cron. Sur 100k req/jour, le cleanup tourne ~1000 fois/jour.

create or replace function public.rate_limits_maybe_cleanup()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if random() < 0.01 then
    delete from public.rate_limits where occurred_at < now() - interval '1 hour';
  end if;
end;
$$;

grant execute on function public.rate_limits_maybe_cleanup() to service_role;


-- ─────────────────────────────────────────────────────────────
-- RLS : personne ne peut lire cette table côté client.
-- Seul le service_role (Edge Functions) y accède.
-- ─────────────────────────────────────────────────────────────
alter table public.rate_limits enable row level security;

-- Pas de policy pour authenticated/anon => aucune lecture/écriture possible.

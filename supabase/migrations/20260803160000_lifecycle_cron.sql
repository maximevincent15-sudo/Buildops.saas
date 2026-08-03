-- ═══════════════════════════════════════════════════════════
-- Firovia — Cron quotidien : trials expirant / expirés
-- ═══════════════════════════════════════════════════════════
-- Complète le stripe-webhook (qui couvre les events Stripe live) avec
-- une détection quotidienne des trials qui n'ont jamais été payés :
--   - Trial J-3  → email "il te reste 3 jours pour closer"
--   - Trial J    → email "trial expiré, dernière chance"
--
-- Idempotence : on marque les orgs déjà notifiées via une colonne
-- lifecycle_notified_at pour éviter d'envoyer 10x le même email.

create extension if not exists pg_cron;

-- ─────────────────────────────────────────────────────────────
-- 1. Colonne pour tracer les notifs déjà envoyées
-- ─────────────────────────────────────────────────────────────
alter table public.subscriptions
  add column if not exists lifecycle_notified_trial_ending_at timestamptz,
  add column if not exists lifecycle_notified_trial_expired_at timestamptz;


-- ─────────────────────────────────────────────────────────────
-- 2. Fonction : appelle notify-lifecycle pour un event donné
-- ─────────────────────────────────────────────────────────────
create or replace function public.notify_lifecycle_via_http(
  p_kind text,
  p_organization_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  webhook_url text := 'https://omqroiivaedafmwfeygt.supabase.co/functions/v1/notify-lifecycle';
  service_key text;
begin
  -- On récupère la service_role key depuis les settings Postgres (Vault ou env)
  -- Sinon, appel sans auth (l'Edge Function elle-même est --no-verify-jwt).
  service_key := coalesce(
    current_setting('app.settings.service_role_key', true),
    ''
  );

  perform net.http_post(
    url := webhook_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json'
    ),
    body := jsonb_build_object(
      'kind', p_kind,
      'organization_id', p_organization_id
    )
  );
exception when others then
  raise warning 'notify_lifecycle_via_http failed: %', sqlerrm;
end;
$$;


-- ─────────────────────────────────────────────────────────────
-- 3. Fonction cron : détecte les trials à notifier
-- ─────────────────────────────────────────────────────────────
create or replace function public.check_trials_lifecycle()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
begin
  -- Trial J-3 : encore 2 à 3 jours restants + jamais notifié
  for r in
    select organization_id
      from public.subscriptions
     where status = 'trialing'
       and trial_ends_at is not null
       and trial_ends_at > now()
       and trial_ends_at <= now() + interval '3 days'
       and lifecycle_notified_trial_ending_at is null
  loop
    perform public.notify_lifecycle_via_http('trial_ending_soon', r.organization_id);
    update public.subscriptions
       set lifecycle_notified_trial_ending_at = now()
     where organization_id = r.organization_id;
  end loop;

  -- Trial expiré aujourd'hui : trial_ends_at < now() + jamais notifié
  for r in
    select organization_id
      from public.subscriptions
     where status = 'trialing'
       and trial_ends_at is not null
       and trial_ends_at < now()
       and lifecycle_notified_trial_expired_at is null
  loop
    perform public.notify_lifecycle_via_http('trial_expired', r.organization_id);
    update public.subscriptions
       set lifecycle_notified_trial_expired_at = now()
     where organization_id = r.organization_id;
  end loop;
end;
$$;


-- ─────────────────────────────────────────────────────────────
-- 4. Cron quotidien à 9h (heure UTC = 11h Paris été / 10h hiver)
-- ─────────────────────────────────────────────────────────────
-- L'utilisateur reçoit sa notif le matin, ce qui laisse la journée
-- pour réagir. On unschedule d'abord au cas où on rejoue la migration.
select cron.unschedule('firovia-trials-lifecycle')
  where exists (select 1 from cron.job where jobname = 'firovia-trials-lifecycle');

select cron.schedule(
  'firovia-trials-lifecycle',
  '0 9 * * *',
  $$ select public.check_trials_lifecycle(); $$
);

-- ═══════════════════════════════════════════════════════════════════════
-- Formule Entreprise + limite de techniciens par formule
--
-- 1. subscriptions.plan accepte désormais 'enterprise'
-- 2. Limite de techniciens ACTIFS appliquée en base (trigger) :
--      essai (trialing) → illimité (essai complet, y compris prospects Entreprise)
--      starter          → 5
--      pro              → 20
--      enterprise       → illimité
--      pas d'abonnement / formule inconnue → pas de limite (fail open)
--    Le trigger couvre la création manuelle ET l'import Excel/CSV.
--    Les organisations déjà au-delà ne perdent rien : seuls les ajouts
--    (ou réactivations) sont bloqués.
--
-- Idempotent : peut être rejouée sans erreur.
-- ═══════════════════════════════════════════════════════════════════════

-- ─── 1. Plan 'enterprise' ────────────────────────────────────────────
do $$
declare
  c record;
begin
  for c in
    select conname
      from pg_constraint
     where conrelid = 'public.subscriptions'::regclass
       and contype = 'c'
       and pg_get_constraintdef(oid) ilike '%plan%starter%'
  loop
    execute format('alter table public.subscriptions drop constraint %I', c.conname);
  end loop;
end $$;

alter table public.subscriptions
  add constraint subscriptions_plan_check
  check (plan is null or plan in ('starter', 'pro', 'enterprise'));

-- ─── 2. Limite de techniciens ────────────────────────────────────────
create or replace function public.technician_limit_for_org(p_org uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select case
    when s.status = 'trialing' then null
    when s.plan = 'starter'    then 5
    when s.plan = 'pro'        then 20
    else null
  end
  from public.subscriptions s
  where s.organization_id = p_org
$$;

create or replace function public.enforce_technician_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_limit integer;
  v_count integer;
begin
  -- Seuls les techniciens actifs comptent
  if not new.active then
    return new;
  end if;
  -- Mise à jour d'un technicien déjà actif : rien ne change dans le décompte
  if tg_op = 'UPDATE' and old.active then
    return new;
  end if;

  v_limit := public.technician_limit_for_org(new.organization_id);
  if v_limit is null then
    return new;
  end if;

  select count(*) into v_count
    from public.technicians
   where organization_id = new.organization_id
     and active
     and id <> new.id;

  if v_count >= v_limit then
    raise exception 'technician_limit_reached:%', v_limit
      using errcode = 'P0001',
            hint = 'Passez à la formule supérieure depuis la page Abonnement.';
  end if;

  return new;
end;
$$;

drop trigger if exists technicians_enforce_limit on public.technicians;
create trigger technicians_enforce_limit
  before insert or update of active on public.technicians
  for each row execute function public.enforce_technician_limit();

-- Fonctions internes : pas d'appel direct depuis l'API
revoke execute on function public.technician_limit_for_org(uuid) from public, anon, authenticated;
revoke execute on function public.enforce_technician_limit() from public, anon, authenticated;

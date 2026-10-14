-- ═══════════════════════════════════════════════════════════
-- Formule Essentiel (TPE, 1 à 2 techniciens) — 149 € HT/mois
--
-- 1. subscriptions.plan accepte 'essentiel'
-- 2. Limite de techniciens actifs : essentiel → 2
--    (starter 5, pro 20, enterprise et essai illimités : inchangés)
-- Idempotent.
-- ═══════════════════════════════════════════════════════════

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
  check (plan is null or plan in ('essentiel', 'starter', 'pro', 'enterprise'));

create or replace function public.technician_limit_for_org(p_org uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select case
    when s.status = 'trialing'  then null
    when s.plan = 'essentiel'   then 2
    when s.plan = 'starter'     then 5
    when s.plan = 'pro'         then 20
    else null
  end
  from public.subscriptions s
  where s.organization_id = p_org
$$;

revoke execute on function public.technician_limit_for_org(uuid) from public, anon, authenticated;

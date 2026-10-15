-- ═══════════════════════════════════════════════════════════
-- Charges fixes mensuelles (salaires, loyer, véhicules…)
--
-- Saisies une fois par le gérant dans Paramètres ; le tableau de bord
-- en déduit un résultat estimé chaque mois :
--   CA encaissé HT − notes de frais − achats − charges fixes
-- Données sensibles (salaires) : lecture ET écriture réservées aux
-- administrateurs de l'organisation.
-- Idempotent.
-- ═══════════════════════════════════════════════════════════

create or replace function public.current_user_is_org_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select user_role = 'admin' from public.profiles where id = auth.uid()), false)
$$;

revoke all on function public.current_user_is_org_admin() from public, anon;
grant execute on function public.current_user_is_org_admin() to authenticated;

create table if not exists public.organization_fixed_costs (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete cascade,
  label            text not null check (length(trim(label)) > 0),
  monthly_amount   numeric(12, 2) not null default 0 check (monthly_amount >= 0),
  position         integer not null default 0,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists idx_fixed_costs_org on public.organization_fixed_costs (organization_id, position);

alter table public.organization_fixed_costs enable row level security;

drop policy if exists "fixed_costs_select_admin" on public.organization_fixed_costs;
create policy "fixed_costs_select_admin"
  on public.organization_fixed_costs for select
  to authenticated
  using (organization_id = public.current_user_organization_id() and public.current_user_is_org_admin());

drop policy if exists "fixed_costs_insert_admin" on public.organization_fixed_costs;
create policy "fixed_costs_insert_admin"
  on public.organization_fixed_costs for insert
  to authenticated
  with check (organization_id = public.current_user_organization_id() and public.current_user_is_org_admin());

drop policy if exists "fixed_costs_update_admin" on public.organization_fixed_costs;
create policy "fixed_costs_update_admin"
  on public.organization_fixed_costs for update
  to authenticated
  using (organization_id = public.current_user_organization_id() and public.current_user_is_org_admin())
  with check (organization_id = public.current_user_organization_id() and public.current_user_is_org_admin());

drop policy if exists "fixed_costs_delete_admin" on public.organization_fixed_costs;
create policy "fixed_costs_delete_admin"
  on public.organization_fixed_costs for delete
  to authenticated
  using (organization_id = public.current_user_organization_id() and public.current_user_is_org_admin());

create or replace function public.fixed_costs_set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists fixed_costs_set_updated_at on public.organization_fixed_costs;
create trigger fixed_costs_set_updated_at
  before update on public.organization_fixed_costs
  for each row execute function public.fixed_costs_set_updated_at();

revoke all on public.organization_fixed_costs from anon;
revoke all on public.organization_fixed_costs from authenticated;
grant select, insert, update, delete on public.organization_fixed_costs to authenticated;
revoke execute on function public.fixed_costs_set_updated_at() from public, anon, authenticated;

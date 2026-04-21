-- ═══════════════════════════════════════════════════════════
-- BuildOps — Migration 008 : planning_blocks (créneaux libres)
-- ═══════════════════════════════════════════════════════════
-- Permet aux utilisateurs d'ajouter des blocs texte libre
-- sur le planning (déjeuner, RDV perso, réunion, congés…)
-- Script idempotent.


drop table if exists public.planning_blocks cascade;

create table public.planning_blocks (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete cascade,
  date             date not null,
  label            text not null,
  color            text not null default 'neutral' check (color in ('neutral', 'acc', 'grn', 'org', 'red')),
  created_at       timestamptz not null default now(),
  created_by       uuid references auth.users(id) on delete set null
);

create index idx_planning_blocks_org_date on public.planning_blocks (organization_id, date);

alter table public.planning_blocks enable row level security;

create policy "blocks_select_org"
  on public.planning_blocks for select
  to authenticated
  using (organization_id = public.current_user_organization_id());

create policy "blocks_insert_org"
  on public.planning_blocks for insert
  to authenticated
  with check (organization_id = public.current_user_organization_id());

create policy "blocks_update_org"
  on public.planning_blocks for update
  to authenticated
  using (organization_id = public.current_user_organization_id())
  with check (organization_id = public.current_user_organization_id());

create policy "blocks_delete_org"
  on public.planning_blocks for delete
  to authenticated
  using (organization_id = public.current_user_organization_id());

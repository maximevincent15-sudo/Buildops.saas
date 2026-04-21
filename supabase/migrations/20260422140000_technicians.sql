-- ═══════════════════════════════════════════════════════════
-- BuildOps — Migration 010 : table technicians + FK intervention
-- ═══════════════════════════════════════════════════════════
-- Gestion des techniciens comme entités distinctes (pas juste
-- texte libre sur intervention). RLS multi-tenant standard.
-- Ajoute technician_id (FK, nullable, on delete set null) sur
-- interventions. Le champ technician_name reste pour rétro-compat.

drop table if exists public.technicians cascade;

create table public.technicians (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete cascade,
  first_name       text not null,
  last_name        text not null,
  email            text,
  phone            text,
  role             text,
  notes            text,
  active           boolean not null default true,
  created_at       timestamptz not null default now(),
  created_by       uuid references auth.users(id) on delete set null
);

create index idx_technicians_org_active on public.technicians (organization_id, active);
create index idx_technicians_org_name   on public.technicians (organization_id, last_name, first_name);

alter table public.technicians enable row level security;

create policy "tech_select_org"
  on public.technicians for select
  to authenticated
  using (organization_id = public.current_user_organization_id());

create policy "tech_insert_org"
  on public.technicians for insert
  to authenticated
  with check (organization_id = public.current_user_organization_id());

create policy "tech_update_org"
  on public.technicians for update
  to authenticated
  using (organization_id = public.current_user_organization_id())
  with check (organization_id = public.current_user_organization_id());

create policy "tech_delete_org"
  on public.technicians for delete
  to authenticated
  using (organization_id = public.current_user_organization_id());

-- FK optionnelle sur interventions
alter table public.interventions
  add column if not exists technician_id uuid references public.technicians(id) on delete set null;

create index if not exists idx_interventions_technician
  on public.interventions (technician_id);

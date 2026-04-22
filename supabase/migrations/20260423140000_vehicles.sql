-- ═══════════════════════════════════════════════════════════
-- BuildOps — Migration 014 : parc véhicules
-- ═══════════════════════════════════════════════════════════
-- Véhicules de fonction / utilitaires avec dates clés à surveiller
-- (contrôle technique, assurance, vidange). Alertes automatiques
-- quand une échéance approche.

drop table if exists public.vehicles cascade;

create table public.vehicles (
  id                    uuid primary key default gen_random_uuid(),
  organization_id       uuid not null references public.organizations(id) on delete cascade,
  technician_id         uuid references public.technicians(id) on delete set null,
  license_plate         text not null,
  brand                 text,
  model                 text,
  year                  int,
  mileage               int,
  next_mot_date         date,    -- contrôle technique
  next_insurance_date   date,    -- échéance assurance
  next_service_date     date,    -- prochaine vidange / entretien
  notes                 text,
  created_at            timestamptz not null default now(),
  created_by            uuid references auth.users(id) on delete set null
);

-- Plaque unique par organisation (pas globalement car même plaque possible dans autre orga)
create unique index idx_vehicles_plate_org on public.vehicles (organization_id, lower(license_plate));
create index idx_vehicles_org on public.vehicles (organization_id);
create index idx_vehicles_tech on public.vehicles (technician_id);

alter table public.vehicles enable row level security;

create policy "vehicles_select_org"
  on public.vehicles for select
  to authenticated
  using (organization_id = public.current_user_organization_id());

create policy "vehicles_insert_org"
  on public.vehicles for insert
  to authenticated
  with check (organization_id = public.current_user_organization_id());

create policy "vehicles_update_org"
  on public.vehicles for update
  to authenticated
  using (organization_id = public.current_user_organization_id())
  with check (organization_id = public.current_user_organization_id());

create policy "vehicles_delete_org"
  on public.vehicles for delete
  to authenticated
  using (organization_id = public.current_user_organization_id());

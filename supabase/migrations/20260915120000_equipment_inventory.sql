-- ═══════════════════════════════════════════════════════════
-- Firovia — Migration : inventaire nominatif (registre APSAD)
-- ═══════════════════════════════════════════════════════════
-- Tables : sites, zones, equipment_units, family_templates
-- + seed template R (Extincteurs — APSAD R4)
-- Script idempotent : peut être rejoué sans erreur.


-- Cleanup safe (idempotent)
drop table if exists public.equipment_units cascade;
drop table if exists public.zones cascade;
drop table if exists public.sites cascade;
drop table if exists public.family_templates cascade;


-- ─── SITES ──────────────────────────────────────────────────
create table public.sites (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references public.organizations(id) on delete cascade,
  client_id         uuid not null references public.clients(id) on delete cascade,
  name              text not null,
  address           text,
  postal_code       text,
  city              text,
  contact_name      text,
  contact_phone     text,
  access_notes      text,
  notes             text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  created_by        uuid references auth.users(id) on delete set null
);

create index idx_sites_org_client on public.sites (organization_id, client_id);

alter table public.sites enable row level security;

create policy "sites_select_org"
  on public.sites for select
  to authenticated
  using (organization_id = public.current_user_organization_id());

create policy "sites_insert_org"
  on public.sites for insert
  to authenticated
  with check (organization_id = public.current_user_organization_id());

create policy "sites_update_org"
  on public.sites for update
  to authenticated
  using (organization_id = public.current_user_organization_id())
  with check (organization_id = public.current_user_organization_id());

create policy "sites_delete_org"
  on public.sites for delete
  to authenticated
  using (organization_id = public.current_user_organization_id());

create or replace function public.sites_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists sites_updated_at on public.sites;
create trigger sites_updated_at
  before update on public.sites
  for each row execute procedure public.sites_set_updated_at();


-- ─── ZONES ──────────────────────────────────────────────────
create table public.zones (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references public.organizations(id) on delete cascade,
  site_id           uuid not null references public.sites(id) on delete cascade,
  name              text not null,
  parent_zone       text,
  display_order     int not null default 0,
  created_at        timestamptz not null default now()
);

create index idx_zones_org_site on public.zones (organization_id, site_id, display_order);

alter table public.zones enable row level security;

create policy "zones_select_org"
  on public.zones for select
  to authenticated
  using (organization_id = public.current_user_organization_id());

create policy "zones_insert_org"
  on public.zones for insert
  to authenticated
  with check (organization_id = public.current_user_organization_id());

create policy "zones_update_org"
  on public.zones for update
  to authenticated
  using (organization_id = public.current_user_organization_id())
  with check (organization_id = public.current_user_organization_id());

create policy "zones_delete_org"
  on public.zones for delete
  to authenticated
  using (organization_id = public.current_user_organization_id());


-- ─── EQUIPMENT UNITS (le cœur — registre APSAD nominatif) ──
create table public.equipment_units (
  id                     uuid primary key default gen_random_uuid(),
  organization_id        uuid not null references public.organizations(id) on delete cascade,
  client_id              uuid not null references public.clients(id) on delete restrict,
  site_id                uuid not null references public.sites(id) on delete restrict,
  zone_id                uuid references public.zones(id) on delete set null,
  family                 text not null check (family in (
    'extincteurs', 'ria', 'baes', 'portes_cf',
    'desenfumage', 'detection', 'colonnes_seches'
  )),
  subtype                text,
  serial_number          text not null,
  implantation           text,
  brand                  text,
  model                  text,
  install_year           int,
  next_replacement_year  int,
  qr_code                text,
  status                 text not null default 'active' check (status in (
    'active', 'to_watch', 'to_replace', 'replaced', 'removed'
  )),
  last_check_date        date,
  next_check_date        date,
  notes                  text,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  created_by             uuid references auth.users(id) on delete set null,
  unique (site_id, family, serial_number)
);

create index idx_equipment_units_org_site on public.equipment_units (organization_id, site_id);
create index idx_equipment_units_family on public.equipment_units (organization_id, family);
create index idx_equipment_units_status on public.equipment_units (organization_id, status)
  where status <> 'removed';

alter table public.equipment_units enable row level security;

create policy "equipment_units_select_org"
  on public.equipment_units for select
  to authenticated
  using (organization_id = public.current_user_organization_id());

create policy "equipment_units_insert_org"
  on public.equipment_units for insert
  to authenticated
  with check (organization_id = public.current_user_organization_id());

create policy "equipment_units_update_org"
  on public.equipment_units for update
  to authenticated
  using (organization_id = public.current_user_organization_id())
  with check (organization_id = public.current_user_organization_id());

create policy "equipment_units_delete_org"
  on public.equipment_units for delete
  to authenticated
  using (organization_id = public.current_user_organization_id());

create or replace function public.equipment_units_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists equipment_units_updated_at on public.equipment_units;
create trigger equipment_units_updated_at
  before update on public.equipment_units
  for each row execute procedure public.equipment_units_set_updated_at();


-- ─── FAMILY TEMPLATES (globaux, partagés entre orgs) ────────
create table public.family_templates (
  id                  uuid primary key default gen_random_uuid(),
  family              text not null,
  version             int not null default 1,
  name                text not null,
  reference_code      text,
  standard_ref        text,
  checklist           jsonb not null,
  observation_types   jsonb not null default '[]'::jsonb,
  active              boolean not null default true,
  created_at          timestamptz not null default now(),
  unique (family, version)
);

create index idx_family_templates_family on public.family_templates (family) where active;

alter table public.family_templates enable row level security;

-- Lecture publique authentifiée. Écriture : admin only (pas de policy → refusée par défaut).
create policy "family_templates_select_authenticated"
  on public.family_templates for select
  to authenticated
  using (active = true);


-- ─── SEED : Template R (Extincteurs — APSAD R4) ─────────────
-- Issu du "Guide pour la maintenance des extincteurs mobiles"
-- (référentiel technique Bernard Vincent Entreprises)
insert into public.family_templates (
  family, name, reference_code, standard_ref, checklist, observation_types
) values (
  'extincteurs',
  'Entretien extincteur mobile',
  'APSAD R4',
  'NF EN 3',
  '[
    {"id":"guide","label":"Entretien conformément au « Guide pour la maintenance des extincteurs mobiles »"},
    {"id":"supports","label":"Bon état des supports et de leurs fixations"},
    {"id":"emplacement","label":"Bon emplacement de l''appareil"},
    {"id":"plombage","label":"Plombage en état"},
    {"id":"mouillant","label":"Contrôle du mouillant additif"},
    {"id":"goupille","label":"Goupille présente et libre"},
    {"id":"collier","label":"Contrôle collier et tube plongeur"},
    {"id":"joint","label":"État du joint de cuve et joint de bouchon"},
    {"id":"etiquette","label":"Pose de l''étiquette portant le nom du prestataire et la date de contrôle"},
    {"id":"plombages_check","label":"Remplacement des plombages · vérification bon fonctionnement général"}
  ]'::jsonb,
  '["Néant","Instance technique — réforme 2027","À remplacer > 10 ans","Mouillant remplacé","Goupille manquante","Support à repositionner","Plombage refait"]'::jsonb
);


-- ═══════════════════════════════════════════════════════════
-- FIN — Migration inventaire nominatif
-- ═══════════════════════════════════════════════════════════

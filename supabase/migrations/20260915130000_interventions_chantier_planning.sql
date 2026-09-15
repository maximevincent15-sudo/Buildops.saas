-- ═══════════════════════════════════════════════════════════
-- Firovia — Migration : étendre interventions (chantier + planning)
-- ═══════════════════════════════════════════════════════════
-- Ajoute la localisation chantier (parfois ≠ site), le créneau
-- horaire détaillé et les consignes d'accès / matériel.
-- Non-destructif : tous les nouveaux champs sont nullables,
-- les interventions existantes gardent leurs valeurs actuelles.


alter table public.interventions
  add column if not exists site_id uuid references public.sites(id) on delete set null,
  -- Localisation chantier (parfois ≠ adresse siège du client)
  add column if not exists chantier_address text,
  add column if not exists chantier_postal_code text,
  add column if not exists chantier_city text,
  add column if not exists chantier_contact_name text,
  add column if not exists chantier_contact_phone text,
  -- Modalités d'accès (utile au technicien avant d'arriver)
  add column if not exists chantier_access_parking text,
  add column if not exists chantier_access_digicode text,
  add column if not exists chantier_access_building text,
  add column if not exists chantier_access_hours text,
  -- Planning détaillé
  add column if not exists slot text check (slot in ('morning','afternoon','fullday','multiday')),
  add column if not exists start_time time,
  add column if not exists duration_minutes int check (duration_minutes is null or duration_minutes >= 30),
  -- Zones concernées (par le contrôle de cette intervention)
  add column if not exists zone_ids uuid[],
  -- Matériel & consignes techniques
  add column if not exists material_needed jsonb not null default '[]'::jsonb,
  add column if not exists recommendations text;


-- Index pour retrouver rapidement les interventions d'un site
create index if not exists idx_interventions_site
  on public.interventions(organization_id, site_id)
  where site_id is not null;


-- ═══════════════════════════════════════════════════════════
-- FIN — Migration chantier + planning
-- ═══════════════════════════════════════════════════════════

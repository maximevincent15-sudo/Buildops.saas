-- ═══════════════════════════════════════════════════════════
-- N° de dossier par visite
--
-- Le N° de dossier vaut pour une année : l'année suivante, le même chantier
-- reçoit un nouveau numéro. Chaque visite garde donc le sien (rapport, devis
-- et factures de la visite le reprennent), et le site ne porte plus que le
-- numéro en cours. Les visites existantes reprennent le numéro actuel de
-- leur site, pour que les dossiers restent tels qu'ils sont. Idempotent.
-- ═══════════════════════════════════════════════════════════

alter table public.interventions add column if not exists dossier_number text;

create index if not exists idx_interventions_org_dossier
  on public.interventions (organization_id, dossier_number) where dossier_number is not null;

update public.interventions i
set dossier_number = s.dossier_number
from public.sites s
where i.site_id = s.id
  and i.dossier_number is null
  and s.dossier_number is not null;

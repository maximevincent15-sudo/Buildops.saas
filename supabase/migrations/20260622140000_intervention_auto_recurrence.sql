-- ═══════════════════════════════════════════════════════════
-- Firovia — Maintenance préventive automatique
-- ═══════════════════════════════════════════════════════════
-- Ajoute la traçabilité parent → enfant pour les interventions
-- générées automatiquement lors de la clôture d'un rapport.
--
-- Cas d'usage :
-- - Quand un technicien clôture le rapport d'une visite annuelle
--   (status → 'terminee'), une nouvelle intervention est créée
--   automatiquement à la date + 365j (ou 183j pour RIA).
-- - Le lien parent_intervention_id permet de tracer la lignée
--   des visites récurrentes pour un même client/site/équipement.
-- - Le flag auto_generated permet d'afficher un badge "Auto" dans
--   le planning pour distinguer les visites créées automatiquement
--   de celles saisies manuellement.

alter table public.interventions
  add column if not exists parent_intervention_id uuid
    references public.interventions(id) on delete set null;

alter table public.interventions
  add column if not exists auto_generated boolean not null default false;

-- Index pour retrouver rapidement les "filles" d'une intervention donnée
create index if not exists idx_interventions_parent
  on public.interventions (parent_intervention_id)
  where parent_intervention_id is not null;

-- Index partiel pour lister rapidement les interventions auto par org
create index if not exists idx_interventions_auto_generated
  on public.interventions (organization_id, scheduled_date)
  where auto_generated = true;

comment on column public.interventions.parent_intervention_id is
  'Référence vers l''intervention dont celle-ci est la suite automatique (visite récurrente).';

comment on column public.interventions.auto_generated is
  'true si l''intervention a été créée automatiquement par le système de maintenance préventive.';

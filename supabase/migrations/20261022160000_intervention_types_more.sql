-- ============================================================================
-- Firovia — Nouveaux types d'intervention : BAES, portes coupe-feu, colonnes sèches
-- ============================================================================
-- Ces familles existent dans le parc d'équipements mais ne pouvaient pas être
-- choisies au planning : un chantier « BAES » ou « portes coupe-feu » n'était
-- pas planifiable précisément. La colonne historique equipment_type (premier
-- type de la liste) accepte maintenant ces valeurs.
-- ============================================================================

alter table public.interventions
  drop constraint if exists interventions_equipment_type_check;
alter table public.interventions
  add constraint interventions_equipment_type_check
  check (equipment_type = any (array[
    'extincteurs', 'ria', 'desenfumage', 'ssi', 'extinction_auto',
    'baes', 'portes_cf', 'colonnes_seches'
  ]::text[]));

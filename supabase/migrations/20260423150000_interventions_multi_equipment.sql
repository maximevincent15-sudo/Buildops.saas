-- ═══════════════════════════════════════════════════════════
-- BuildOps — Migration 015 : multi-sélection équipements
-- ═══════════════════════════════════════════════════════════
-- Une intervention peut désormais concerner PLUSIEURS types
-- d'équipements (ex: visite annuelle = extincteurs + RIA + désenfumage).
-- On convertit la colonne `equipment_type TEXT` en `equipment_types TEXT[]`
-- sans perdre les données existantes.

-- 1. Ajouter la nouvelle colonne array
alter table public.interventions
  add column if not exists equipment_types text[];

-- 2. Remplir avec l'ancienne valeur (une intervention = un équipement pour l'historique)
update public.interventions
   set equipment_types = array[equipment_type]
 where equipment_types is null
   and equipment_type is not null;

-- 3. Rendre la colonne NOT NULL avec default [] pour les futures insertions sans valeur
alter table public.interventions
  alter column equipment_types set default '{}'::text[];

-- 4. On garde `equipment_type` (ancienne colonne) pour compatibilité, mais on
--    la rend nullable pour permettre aux nouveaux inserts de ne pas la remplir.
--    Elle sera supprimée dans une migration ultérieure quand tout le code
--    lira/écrira exclusivement sur `equipment_types`.
alter table public.interventions
  alter column equipment_type drop not null;

-- 5. Sur reports : une intervention multi-équipements peut avoir plusieurs rapports
--    (1 par type d'équipement). On stocke le type contrôlé dans chaque rapport.
alter table public.reports
  add column if not exists equipment_type text;

-- Vérification visuelle (commenté) :
-- select reference, equipment_type, equipment_types from public.interventions limit 10;

-- ═══════════════════════════════════════════════════════════
-- BuildOps — Migration 009 : heure sur planning_blocks
-- ═══════════════════════════════════════════════════════════
-- Ajoute start_time et end_time (type time) optionnels sur les
-- blocks pour afficher "Déjeuner 12h–13h".

alter table public.planning_blocks
  add column if not exists start_time time,
  add column if not exists end_time   time;

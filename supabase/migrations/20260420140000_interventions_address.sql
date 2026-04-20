-- ═══════════════════════════════════════════════════════════
-- BuildOps — Migration 003 : adresse sur les interventions
-- ═══════════════════════════════════════════════════════════

alter table public.interventions
  add column if not exists address text;

-- ═══════════════════════════════════════════════════════════
-- Modèle du rapport PDF d'intervention
--
-- « standard » : le rapport Firovia actuel ; « classic » : compte rendu de
-- vérification classique (conclusion générale, équipements secteur par
-- secteur, annexes observations et non-conformités). Choisi par
-- l'entreprise dans Paramètres. Idempotent.
-- ═══════════════════════════════════════════════════════════

alter table public.organization_invoicing_settings
  add column if not exists report_template text not null default 'standard';

alter table public.organization_invoicing_settings
  drop constraint if exists organization_invoicing_settings_report_template_check;
alter table public.organization_invoicing_settings
  add constraint organization_invoicing_settings_report_template_check
  check (report_template in ('standard', 'classic'));

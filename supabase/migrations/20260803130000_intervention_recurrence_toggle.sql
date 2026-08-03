-- ═══════════════════════════════════════════════════════════
-- Firovia — Toggle "récurrence auto" par intervention
-- ═══════════════════════════════════════════════════════════
-- Contexte (identifié le 17/07/2026 - task #93) :
--
-- Depuis la migration 20260622140000, la clôture d'un rapport crée
-- AUTO la prochaine intervention. Bien pour les contrats de
-- maintenance, mais problématique pour :
--   • Dépannage ponctuel (one-shot)
--   • Contrat client résilié
--   • Intervention exceptionnelle
--
-- Fix : flag `recurrence_active` sur chaque intervention.
--   - Par défaut TRUE (comportement inchangé pour les existantes)
--   - L'utilisateur peut le passer à FALSE dans le formulaire
--   - createNextScheduledIntervention() respecte le flag
--   - Les interventions AUTO générées héritent du flag du parent

alter table public.interventions
  add column if not exists recurrence_active boolean not null default true;

comment on column public.interventions.recurrence_active is
  'Si true, la clôture du rapport de cette intervention crée automatiquement la prochaine visite. Passer à false pour un one-shot ou une résiliation.';

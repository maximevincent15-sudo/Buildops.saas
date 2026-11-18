-- ═══════════════════════════════════════════════════════════
-- Référentiels propres à chaque entreprise
--
-- Liste proposée sur le bon d'intervention et le procès-verbal de
-- réception (ex. « Installation NF S 61-932 », « Ouvrants CE EN 12101-2
-- et 3 »). Vide = liste par défaut (normes publiques du métier).
-- Colonne ajoutée à une table existante : ses droits et règles d'accès
-- actuels la couvrent. Idempotent.
-- ═══════════════════════════════════════════════════════════

alter table public.organization_invoicing_settings
  add column if not exists standards_list text[];

comment on column public.organization_invoicing_settings.standards_list is
  'Référentiels proposés sur le bon d''intervention et le PV (vide = liste par défaut)';

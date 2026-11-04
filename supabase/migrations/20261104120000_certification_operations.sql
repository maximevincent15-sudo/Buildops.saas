-- ═══════════════════════════════════════════════════════════
-- Certification de l'entreprise et opérations réalisées par appareil
--
-- organization_invoicing_settings.certification_rules / certification_number :
--   certification de l'entreprise vérificatrice (ex. « APSAD R4 », n° de
--   certificat), saisie par l'entreprise dans Paramètres et imprimée sur ses
--   comptes rendus. Firovia n'atteste rien : c'est la déclaration de
--   l'entreprise.
-- equipment_checks.operations : opérations réalisées sur l'appareil pendant
--   la visite (vérification, recharge, maintenance additionnelle,
--   remplacement…), clés définies dans src/features/equipment/operations.ts.
--
-- Colonnes ajoutées à des tables existantes : RLS et droits inchangés.
-- Idempotent.
-- ═══════════════════════════════════════════════════════════

alter table public.organization_invoicing_settings
  add column if not exists certification_rules text,
  add column if not exists certification_number text;

alter table public.equipment_checks
  add column if not exists operations text[] not null default '{}';

comment on column public.organization_invoicing_settings.certification_rules is
  'Certification déclarée par l''entreprise (ex. APSAD R4), imprimée sur les comptes rendus';
comment on column public.organization_invoicing_settings.certification_number is
  'N° de certificat déclaré par l''entreprise';
comment on column public.equipment_checks.operations is
  'Opérations réalisées pendant la visite (verification, recharge, maintenance_additionnelle, remplacement…)';

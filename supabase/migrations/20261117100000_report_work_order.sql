-- ═══════════════════════════════════════════════════════════
-- Bon d'intervention
--
-- Une page signée par le client à la fin de la visite : heures d'arrivée
-- et de départ, domaines, nature (maintenance, travaux, dépannage),
-- description, sécurité sur place, référentiels, travaux finis ou restants.
-- La plupart des informations viennent du rapport et de l'intervention ;
-- ce qui est saisi en plus est gardé ici, pour refaire le PDF à l'identique.
-- Colonne ajoutée à une table existante : les droits actuels
-- (authenticated, service_role) la couvrent. Idempotent.
-- ═══════════════════════════════════════════════════════════

alter table public.reports add column if not exists work_order jsonb;

comment on column public.reports.work_order is
  'Bon d''intervention : nature, description, sécurité, référentiels, travaux restants, signature et PDF';

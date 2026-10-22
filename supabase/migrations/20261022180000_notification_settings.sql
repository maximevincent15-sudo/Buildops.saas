-- ============================================================================
-- Firovia — Notifications par mail (réglages de l'organisation)
-- ============================================================================
--   notify_technicians    : le technicien reçoit un mail quand on lui attribue
--                           ou déplace une intervention (par défaut : oui)
--   notify_admins_reports : les administrateurs reçoivent un mail quand un
--                           rapport est terminé (par défaut : oui)
--   auto_send_reports     : le rapport part automatiquement au client à la
--                           finalisation (par défaut : non)
-- Colonnes ajoutées à une table existante : pas de nouveau GRANT nécessaire.
-- ============================================================================

alter table public.organizations
  add column if not exists notify_technicians boolean not null default true,
  add column if not exists notify_admins_reports boolean not null default true,
  add column if not exists auto_send_reports boolean not null default false;

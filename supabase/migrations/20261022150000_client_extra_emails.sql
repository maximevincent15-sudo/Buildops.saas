-- ============================================================================
-- Firovia — Plusieurs destinataires par client, selon le type de document
-- ============================================================================
-- Retour Mont-Blanc Prévention : un client a souvent plusieurs interlocuteurs
-- (syndic, gardien, comptabilité). L'email principal (contact_email) reçoit
-- tout ; les destinataires supplémentaires choisissent rapports, devis et/ou
-- factures. Ex. : [{"email": "compta@x.fr", "name": "Comptabilité",
-- "reports": false, "quotes": false, "invoices": true}]
-- Colonne ajoutée à une table existante : pas de nouveau GRANT nécessaire.
-- ============================================================================

alter table public.clients
  add column if not exists extra_emails jsonb not null default '[]'::jsonb;

alter table public.clients
  drop constraint if exists clients_extra_emails_array;
alter table public.clients
  add constraint clients_extra_emails_array check (jsonb_typeof(extra_emails) = 'array');

comment on column public.clients.extra_emails is
  'Destinataires supplémentaires : [{email, name, reports, quotes, invoices}] ; contact_email reçoit tous les documents';

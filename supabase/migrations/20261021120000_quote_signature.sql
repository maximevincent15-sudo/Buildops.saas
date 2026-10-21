-- Devis signé sur place : signature du client sur le téléphone ou la tablette.
-- Colonnes ajoutées à une table existante : ses droits d'accès (GRANT) restent valables.
alter table public.quotes
  add column if not exists signed_by_name text,
  add column if not exists signature_data_url text,
  add column if not exists signed_at timestamptz;

comment on column public.quotes.signed_by_name is 'Nom du signataire côté client (devis signé sur place)';
comment on column public.quotes.signature_data_url is 'Signature manuscrite du client (PNG en data URL)';
comment on column public.quotes.signed_at is 'Date et heure de la signature sur place';

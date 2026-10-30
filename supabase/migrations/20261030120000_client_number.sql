-- ═══════════════════════════════════════════════════════════
-- N° client
--
-- Code client propre à chaque entreprise (ex. C0001), proposé
-- automatiquement par l'app et modifiable pour reprendre une
-- numérotation papier. Imprimé sur les devis, factures, rapports
-- et contrats.
-- ═══════════════════════════════════════════════════════════

alter table public.clients
  add column if not exists client_number text;

-- Unique par organisation, sans tenir compte des majuscules
create unique index if not exists clients_org_client_number_key
  on public.clients (organization_id, lower(client_number))
  where client_number is not null and client_number <> '';

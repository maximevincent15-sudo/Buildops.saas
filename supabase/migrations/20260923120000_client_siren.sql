-- ═══════════════════════════════════════════════════════════════════════
-- SIREN / SIRET sur la fiche client + report sur devis et factures
--
-- • clients.siren (9 chiffres) et clients.siret (14 chiffres, optionnel)
--   → saisis depuis la fiche client, avec pré-remplissage via l'annuaire
--     recherche-entreprises.api.gouv.fr
-- • quotes.client_siren / invoices.client_siren : copie figée au moment de
--   l'émission (comme client_name / client_address). Le SIREN du client
--   devient une mention obligatoire des factures avec la réforme de la
--   facturation électronique.
--
-- Idempotent : peut être rejouée sans erreur.
-- ═══════════════════════════════════════════════════════════════════════

alter table public.clients add column if not exists siren text;
alter table public.clients add column if not exists siret text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'clients_siren_format') then
    alter table public.clients
      add constraint clients_siren_format check (siren is null or siren ~ '^[0-9]{9}$');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'clients_siret_format') then
    alter table public.clients
      add constraint clients_siret_format check (siret is null or siret ~ '^[0-9]{14}$');
  end if;
end $$;

create index if not exists clients_org_siren_idx
  on public.clients (organization_id, siren)
  where siren is not null;

comment on column public.clients.siren is 'SIREN du client (9 chiffres). Déduit du SIRET si saisi.';
comment on column public.clients.siret is 'SIRET de l''établissement client (14 chiffres), optionnel.';

alter table public.quotes add column if not exists client_siren text;
alter table public.invoices add column if not exists client_siren text;

comment on column public.quotes.client_siren is 'SIREN du client figé à l''émission du devis.';
comment on column public.invoices.client_siren is 'SIREN du client figé à l''émission de la facture (mention obligatoire réforme e-facturation).';

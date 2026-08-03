-- ═══════════════════════════════════════════════════════════
-- Firovia — Documents "historiques" importés depuis PDF externes
-- ═══════════════════════════════════════════════════════════
-- Permet aux nouveaux clients d'importer leur historique de rapports,
-- devis et factures faits AVANT Firovia (souvent des PDF Word ou Excel).
--
-- Ces documents apparaissent dans la page Archivage à côté des documents
-- natifs Firovia, avec un badge "Importé" pour distinguer les 2.
--
-- Champs minimaux : type (rapport/devis/facture), client, date, PDF url.
-- Pas de lien vers intervention/devis/facture native (c'est du pur legacy).

create table if not exists public.legacy_documents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  kind text not null check (kind in ('report', 'quote', 'invoice')),
  reference text not null,           -- Ex: "RAP-2024-001" ou libre
  document_date date not null,       -- Date d'émission du doc historique
  client_name text not null,         -- Nom du client (libre, pas de FK)
  site_name text,                    -- Site si applicable
  pdf_url text not null,             -- URL Supabase Storage du PDF
  pdf_filename text,                 -- Nom original du fichier (pour affichage)
  amount_ttc numeric,                -- Optionnel pour devis/factures
  notes text,                        -- Notes libres
  imported_at timestamptz not null default now(),
  imported_by uuid references auth.users(id) on delete set null
);

create index if not exists idx_legacy_documents_org
  on public.legacy_documents (organization_id, document_date desc);
create index if not exists idx_legacy_documents_kind
  on public.legacy_documents (organization_id, kind);

alter table public.legacy_documents enable row level security;

-- Multi-tenant strict : chaque org voit uniquement ses propres imports
create policy "legacy_docs_select_own"
  on public.legacy_documents for select
  to authenticated
  using (organization_id = public.current_user_organization_id());

create policy "legacy_docs_insert_own"
  on public.legacy_documents for insert
  to authenticated
  with check (organization_id = public.current_user_organization_id());

create policy "legacy_docs_update_own"
  on public.legacy_documents for update
  to authenticated
  using (organization_id = public.current_user_organization_id());

create policy "legacy_docs_delete_own"
  on public.legacy_documents for delete
  to authenticated
  using (organization_id = public.current_user_organization_id());

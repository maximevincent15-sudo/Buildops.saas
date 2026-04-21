-- ═══════════════════════════════════════════════════════════
-- BuildOps — Migration 005 : lien intervention → client
-- ═══════════════════════════════════════════════════════════
-- Ajoute une FK client_id (nullable) pour lier optionnellement
-- une intervention à une fiche client.
-- client_name reste conservé (snapshot historique pour les
-- interventions passées ou le texte libre).

alter table public.interventions
  add column if not exists client_id uuid references public.clients(id) on delete set null;

create index if not exists idx_interventions_client
  on public.interventions (client_id);

-- ═══════════════════════════════════════════════════════════════════════
-- Secteur géographique des techniciens (vue Planning « Équipe »)
-- Texte libre, ex : « Yvelines (78) », « Paris Sud ». Sert à l'affichage
-- sous le nom du technicien et au filtre par secteur.
-- Idempotent.
-- ═══════════════════════════════════════════════════════════════════════

alter table public.technicians add column if not exists sector text;

comment on column public.technicians.sector is 'Secteur géographique (texte libre) — filtre et affichage du planning Équipe.';

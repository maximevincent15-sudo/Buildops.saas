-- ═══════════════════════════════════════════════════════════
-- Mise en forme des lignes de devis et de facture
--
-- Gras, italique, souligné, taille et couleur de la désignation et de la
-- précision dessous, imprimés sur le PDF. null = style normal. Les lignes
-- d'une facture émise restent verrouillées (trigger
-- invoice_lines_protect_issued). Colonnes ajoutées à des tables existantes :
-- pas de nouveau GRANT nécessaire. Idempotent.
-- ═══════════════════════════════════════════════════════════

alter table public.quote_lines add column if not exists format jsonb;
alter table public.invoice_lines add column if not exists format jsonb;

comment on column public.quote_lines.format is 'Mise en forme de la ligne : { main, detail } (bold, italic, underline, size sm|lg, color)';
comment on column public.invoice_lines.format is 'Mise en forme de la ligne : { main, detail } (bold, italic, underline, size sm|lg, color)';

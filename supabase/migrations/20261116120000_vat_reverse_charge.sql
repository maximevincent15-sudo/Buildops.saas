-- ═══════════════════════════════════════════════════════════
-- Autoliquidation de la TVA (sous-traitance du bâtiment)
--
-- Un devis ou une facture en autoliquidation a toutes ses lignes à 0 %
-- de TVA et porte la mention « Autoliquidation : TVA due par le preneur
-- assujetti (article 283-2 nonies du CGI) ». La fiche client donne la
-- valeur par défaut des nouveaux documents. Les droits existants sur les
-- tables (authenticated, service_role) couvrent ces colonnes. Idempotent.
-- ═══════════════════════════════════════════════════════════

alter table public.quotes   add column if not exists vat_reverse_charge boolean not null default false;
alter table public.invoices add column if not exists vat_reverse_charge boolean not null default false;
alter table public.clients  add column if not exists vat_reverse_charge boolean not null default false;

comment on column public.quotes.vat_reverse_charge   is 'Autoliquidation de la TVA (sous-traitance) : lignes à 0 % et mention légale sur le PDF';
comment on column public.invoices.vat_reverse_charge is 'Autoliquidation de la TVA (sous-traitance) : lignes à 0 % et mention légale sur le PDF';
comment on column public.clients.vat_reverse_charge  is 'Client en autoliquidation : valeur par défaut des nouveaux devis et factures';

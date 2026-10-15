-- ═══════════════════════════════════════════════════════════
-- Contrats de maintenance — étape B : « Facturer le mois »
--
-- invoices.contract_id             facture issue d'un contrat
-- invoices.contract_period_start   contrat facturé d'avance : début de la
--                                  période facturée (une seule facture
--                                  active par période)
-- interventions.contract_invoice_id  contrat facturé après visite : facture
--                                  qui a couvert la visite (supprimer le
--                                  brouillon rend la visite à nouveau
--                                  facturable)
-- Idempotent. RLS : inchangée (colonnes de tables déjà protégées).
-- ═══════════════════════════════════════════════════════════

alter table public.invoices
  add column if not exists contract_id uuid references public.contracts(id) on delete set null,
  add column if not exists contract_period_start date;

create index if not exists idx_invoices_contract on public.invoices (contract_id);

-- Une échéance d'avance ne peut être facturée qu'une fois (hors facture annulée)
create unique index if not exists idx_invoices_contract_period
  on public.invoices (contract_id, contract_period_start)
  where contract_period_start is not null and status <> 'cancelled';

alter table public.interventions
  add column if not exists contract_invoice_id uuid references public.invoices(id) on delete set null;

create index if not exists idx_interventions_contract_invoice on public.interventions (contract_invoice_id);

-- ═══════════════════════════════════════════════════════════
-- BuildOps — Migration 020 : préfixes customisables
-- ═══════════════════════════════════════════════════════════
-- Permet à chaque organisation de personnaliser ses préfixes :
-- - Devis : DEV par défaut → DV, DEVIS, EST, etc.
-- - Factures : FAC par défaut → INV, FACT, etc.
-- Le préfixe des interventions reste figé (INT) pour l'instant car
-- c'est la table racine et on ne touche pas le système legacy.

alter table public.organization_invoicing_settings
  add column if not exists quote_prefix   text default 'DEV',
  add column if not exists invoice_prefix text default 'FAC';

-- Mise à jour du trigger devis pour lire le préfixe depuis settings
create or replace function public.set_quote_reference()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  current_year int := extract(year from coalesce(new.issue_date, current_date));
  new_counter  bigint;
  prefix       text;
begin
  -- Récupère le préfixe configuré (fallback 'DEV')
  select coalesce(quote_prefix, 'DEV') into prefix
    from public.organization_invoicing_settings
   where organization_id = new.organization_id;
  if prefix is null then prefix := 'DEV'; end if;

  insert into public.organization_year_counters (organization_id, year, quotes_counter)
  values (new.organization_id, current_year, 1)
  on conflict (organization_id, year)
  do update set quotes_counter = organization_year_counters.quotes_counter + 1
  returning quotes_counter into new_counter;

  new.reference := prefix || '-' || current_year::text || '-' || lpad(new_counter::text, 4, '0');
  return new;
end;
$$;

-- Mise à jour du trigger factures
create or replace function public.set_invoice_reference()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  current_year int := extract(year from coalesce(new.issue_date, current_date));
  new_counter  bigint;
  prefix       text;
begin
  select coalesce(invoice_prefix, 'FAC') into prefix
    from public.organization_invoicing_settings
   where organization_id = new.organization_id;
  if prefix is null then prefix := 'FAC'; end if;

  insert into public.organization_year_counters (organization_id, year, invoices_counter)
  values (new.organization_id, current_year, 1)
  on conflict (organization_id, year)
  do update set invoices_counter = organization_year_counters.invoices_counter + 1
  returning invoices_counter into new_counter;

  new.reference := prefix || '-' || current_year::text || '-' || lpad(new_counter::text, 4, '0');
  return new;
end;
$$;

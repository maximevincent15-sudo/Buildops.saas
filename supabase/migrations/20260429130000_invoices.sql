-- ═══════════════════════════════════════════════════════════
-- BuildOps — Migration 019 : Factures (Phase 6.B)
-- ═══════════════════════════════════════════════════════════
-- - Table invoices : header avec workflow paiement + lien vers
--   le devis source (optionnel)
-- - Table invoice_lines : lignes détaillées (même structure que quote_lines)
-- - Trigger numérotation auto FAC-{YEAR}-{COUNTER}
--   ⚠️ Numérotation continue OBLIGATOIRE en fiscalité FR : aucun trou.
--   On utilise organization_year_counters.invoices_counter (déjà créé en mig. 018)

drop table if exists public.invoice_lines cascade;
drop table if exists public.invoices cascade;

create table public.invoices (
  id                 uuid primary key default gen_random_uuid(),
  organization_id    uuid not null references public.organizations(id) on delete cascade,
  reference          text not null,
  -- Lien optionnel vers le devis source
  quote_id           uuid references public.quotes(id) on delete set null,
  -- Client
  client_id          uuid references public.clients(id) on delete set null,
  client_name        text not null,
  client_contact_name text,
  client_address     text,
  client_email       text,
  -- Lien intervention source (optionnel)
  intervention_id    uuid references public.interventions(id) on delete set null,
  -- Site / chantier
  site_name          text,
  site_address       text,
  -- Dates clés
  issue_date         date not null default current_date,
  due_date           date,                     -- échéance de paiement
  sent_at            timestamptz,
  paid_at            timestamptz,              -- date du règlement final
  -- Workflow
  status             text not null default 'draft'
    check (status in ('draft', 'sent', 'paid', 'partially_paid', 'overdue', 'cancelled')),
  -- Totaux dénormalisés
  total_ht           numeric(12, 2) not null default 0,
  total_vat          numeric(12, 2) not null default 0,
  total_ttc          numeric(12, 2) not null default 0,
  -- Suivi paiement
  amount_paid        numeric(12, 2) not null default 0,    -- cumul des règlements
  payment_method     text,                                  -- virement, chèque, CB, espèces…
  payment_reference  text,                                  -- n° chèque, libellé virement…
  -- Texte libre
  notes              text,
  pdf_url            text,
  sent_to_email      text,
  cancelled_at       timestamptz,
  cancelled_reason   text,
  created_at         timestamptz not null default now(),
  created_by         uuid references auth.users(id) on delete set null,
  updated_at         timestamptz not null default now()
);

create index idx_invoices_org_created  on public.invoices (organization_id, created_at desc);
create index idx_invoices_org_status   on public.invoices (organization_id, status);
create index idx_invoices_client       on public.invoices (client_id);
create index idx_invoices_quote        on public.invoices (quote_id);
create unique index idx_invoices_org_ref on public.invoices (organization_id, reference);

alter table public.invoices enable row level security;

create policy "invoices_select_org"
  on public.invoices for select
  to authenticated
  using (organization_id = public.current_user_organization_id());

create policy "invoices_insert_org"
  on public.invoices for insert
  to authenticated
  with check (organization_id = public.current_user_organization_id());

create policy "invoices_update_org"
  on public.invoices for update
  to authenticated
  using (organization_id = public.current_user_organization_id())
  with check (organization_id = public.current_user_organization_id());

create policy "invoices_delete_org"
  on public.invoices for delete
  to authenticated
  using (organization_id = public.current_user_organization_id());


-- ═══════════════════════════════════════════════════════════
-- Lignes de facture
-- ═══════════════════════════════════════════════════════════

create table public.invoice_lines (
  id              uuid primary key default gen_random_uuid(),
  invoice_id      uuid not null references public.invoices(id) on delete cascade,
  position        int  not null default 0,
  description     text not null,
  quantity        numeric(10, 3) not null default 1,
  unit_price_ht   numeric(12, 2) not null default 0,
  vat_rate        numeric(4, 2) not null default 20.00
    check (vat_rate >= 0 and vat_rate <= 100),
  line_total_ht   numeric(12, 2) generated always as (quantity * unit_price_ht) stored,
  created_at      timestamptz not null default now()
);

create index idx_invoice_lines_invoice on public.invoice_lines (invoice_id, position);

alter table public.invoice_lines enable row level security;

create policy "invoice_lines_select_org"
  on public.invoice_lines for select
  to authenticated
  using (
    exists (
      select 1 from public.invoices i
      where i.id = invoice_lines.invoice_id
        and i.organization_id = public.current_user_organization_id()
    )
  );

create policy "invoice_lines_insert_org"
  on public.invoice_lines for insert
  to authenticated
  with check (
    exists (
      select 1 from public.invoices i
      where i.id = invoice_lines.invoice_id
        and i.organization_id = public.current_user_organization_id()
    )
  );

create policy "invoice_lines_update_org"
  on public.invoice_lines for update
  to authenticated
  using (
    exists (
      select 1 from public.invoices i
      where i.id = invoice_lines.invoice_id
        and i.organization_id = public.current_user_organization_id()
    )
  );

create policy "invoice_lines_delete_org"
  on public.invoice_lines for delete
  to authenticated
  using (
    exists (
      select 1 from public.invoices i
      where i.id = invoice_lines.invoice_id
        and i.organization_id = public.current_user_organization_id()
    )
  );


-- ═══════════════════════════════════════════════════════════
-- Trigger numérotation auto FAC-YYYY-XXXX (continue, sans trou)
-- ═══════════════════════════════════════════════════════════

create or replace function public.set_invoice_reference()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  current_year int := extract(year from coalesce(new.issue_date, current_date));
  new_counter  bigint;
begin
  insert into public.organization_year_counters (organization_id, year, invoices_counter)
  values (new.organization_id, current_year, 1)
  on conflict (organization_id, year)
  do update set invoices_counter = organization_year_counters.invoices_counter + 1
  returning invoices_counter into new_counter;

  new.reference := 'FAC-' || current_year::text || '-' || lpad(new_counter::text, 4, '0');
  return new;
end;
$$;

drop trigger if exists invoices_set_reference on public.invoices;
create trigger invoices_set_reference
  before insert on public.invoices
  for each row
  when (new.reference is null or new.reference = '')
  execute function public.set_invoice_reference();

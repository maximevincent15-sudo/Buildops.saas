-- ═══════════════════════════════════════════════════════════
-- BuildOps — Migration 018 : Devis (Phase 6.A)
-- ═══════════════════════════════════════════════════════════
-- - Table organization_invoicing_settings : SIRET, TVA, mentions légales,
--   logo… reprises sur chaque devis/facture (1 ligne par orga)
-- - Table quotes : header devis avec totaux dénormalisés (perf)
-- - Table quote_lines : lignes détaillées
-- - Trigger numérotation auto DEV-{YEAR}-{COUNTER} reset au 1er janvier
-- - RLS sur tout

-- ═══════════════════════════════════════════════════════════
-- 1. Paramètres de facturation par organisation
-- ═══════════════════════════════════════════════════════════

create table if not exists public.organization_invoicing_settings (
  organization_id    uuid primary key references public.organizations(id) on delete cascade,
  legal_form         text,                -- SARL, SAS, EI, EURL...
  siret              text,
  ape_code           text,                -- ex: 4321A
  vat_number         text,                -- ex: FR 12 345678901
  capital            text,                -- ex: 10 000 €
  legal_address      text,                -- adresse du siège
  legal_city         text,
  legal_postal_code  text,
  legal_phone        text,
  legal_email        text,
  iban               text,
  bic                text,
  bank_name          text,
  -- Mentions par défaut (réutilisées sur chaque devis/facture)
  payment_terms      text default 'Paiement à 30 jours fin de mois',
  late_penalty_text  text default 'Tout retard de paiement entraîne des pénalités au taux annuel de 3 fois le taux légal (loi LME 2008), ainsi qu''une indemnité forfaitaire pour frais de recouvrement de 40 €.',
  no_discount_text   text default 'Pas d''escompte pour paiement anticipé.',
  -- Logo (URL Supabase Storage si dispo)
  logo_url           text,
  updated_at         timestamptz not null default now()
);

alter table public.organization_invoicing_settings enable row level security;

drop policy if exists "invoicing_settings_select_org" on public.organization_invoicing_settings;
drop policy if exists "invoicing_settings_insert_org" on public.organization_invoicing_settings;
drop policy if exists "invoicing_settings_update_org" on public.organization_invoicing_settings;

create policy "invoicing_settings_select_org"
  on public.organization_invoicing_settings for select
  to authenticated
  using (organization_id = public.current_user_organization_id());

create policy "invoicing_settings_insert_org"
  on public.organization_invoicing_settings for insert
  to authenticated
  with check (organization_id = public.current_user_organization_id());

create policy "invoicing_settings_update_org"
  on public.organization_invoicing_settings for update
  to authenticated
  using (organization_id = public.current_user_organization_id())
  with check (organization_id = public.current_user_organization_id());


-- ═══════════════════════════════════════════════════════════
-- 2. Compteur de devis par orga ET par année
-- ═══════════════════════════════════════════════════════════

create table if not exists public.organization_year_counters (
  organization_id  uuid not null references public.organizations(id) on delete cascade,
  year             int  not null,
  quotes_counter   bigint not null default 0,
  invoices_counter bigint not null default 0,
  primary key (organization_id, year)
);

alter table public.organization_year_counters enable row level security;

drop policy if exists "year_counters_select_org" on public.organization_year_counters;
create policy "year_counters_select_org"
  on public.organization_year_counters for select
  to authenticated
  using (organization_id = public.current_user_organization_id());

-- Pas de policies insert/update : géré uniquement par triggers (security definer)


-- ═══════════════════════════════════════════════════════════
-- 3. Table quotes
-- ═══════════════════════════════════════════════════════════

drop table if exists public.quote_lines cascade;
drop table if exists public.quotes cascade;

create table public.quotes (
  id                 uuid primary key default gen_random_uuid(),
  organization_id    uuid not null references public.organizations(id) on delete cascade,
  reference          text not null,
  -- Lien client (peut être nullable si client supprimé)
  client_id          uuid references public.clients(id) on delete set null,
  client_name        text not null,            -- snapshot pour conserver le devis même si client supprimé
  client_contact_name text,
  client_address     text,
  client_email       text,
  -- Lien intervention source (optionnel : devis correctif)
  intervention_id    uuid references public.interventions(id) on delete set null,
  -- Site / chantier
  site_name          text,
  site_address       text,
  -- Dates clés
  issue_date         date not null default current_date,
  validity_date      date,                     -- date de validité du devis
  sent_at            timestamptz,
  accepted_at        timestamptz,
  refused_at         timestamptz,
  refused_reason     text,
  -- Workflow
  status             text not null default 'draft'
    check (status in ('draft', 'sent', 'accepted', 'refused', 'expired')),
  -- Totaux dénormalisés (recalculés à chaque save)
  total_ht           numeric(12, 2) not null default 0,
  total_vat          numeric(12, 2) not null default 0,
  total_ttc          numeric(12, 2) not null default 0,
  -- Mentions / texte libre
  notes              text,
  pdf_url            text,
  sent_to_email      text,
  created_at         timestamptz not null default now(),
  created_by         uuid references auth.users(id) on delete set null,
  updated_at         timestamptz not null default now()
);

create index idx_quotes_org_created on public.quotes (organization_id, created_at desc);
create index idx_quotes_org_status on public.quotes (organization_id, status);
create index idx_quotes_client on public.quotes (client_id);
create unique index idx_quotes_org_ref on public.quotes (organization_id, reference);

alter table public.quotes enable row level security;

create policy "quotes_select_org"
  on public.quotes for select
  to authenticated
  using (organization_id = public.current_user_organization_id());

create policy "quotes_insert_org"
  on public.quotes for insert
  to authenticated
  with check (organization_id = public.current_user_organization_id());

create policy "quotes_update_org"
  on public.quotes for update
  to authenticated
  using (organization_id = public.current_user_organization_id())
  with check (organization_id = public.current_user_organization_id());

create policy "quotes_delete_org"
  on public.quotes for delete
  to authenticated
  using (organization_id = public.current_user_organization_id());


-- ═══════════════════════════════════════════════════════════
-- 4. Table quote_lines
-- ═══════════════════════════════════════════════════════════

create table public.quote_lines (
  id              uuid primary key default gen_random_uuid(),
  quote_id        uuid not null references public.quotes(id) on delete cascade,
  position        int  not null default 0,        -- ordre d'affichage
  description     text not null,
  quantity        numeric(10, 3) not null default 1,
  unit_price_ht   numeric(12, 2) not null default 0,
  vat_rate        numeric(4, 2) not null default 20.00
    check (vat_rate >= 0 and vat_rate <= 100),
  -- Total HT de la ligne (calculé) : quantity * unit_price_ht
  line_total_ht   numeric(12, 2) generated always as (quantity * unit_price_ht) stored,
  created_at      timestamptz not null default now()
);

create index idx_quote_lines_quote on public.quote_lines (quote_id, position);

alter table public.quote_lines enable row level security;

create policy "quote_lines_select_org"
  on public.quote_lines for select
  to authenticated
  using (
    exists (
      select 1 from public.quotes q
      where q.id = quote_lines.quote_id
        and q.organization_id = public.current_user_organization_id()
    )
  );

create policy "quote_lines_insert_org"
  on public.quote_lines for insert
  to authenticated
  with check (
    exists (
      select 1 from public.quotes q
      where q.id = quote_lines.quote_id
        and q.organization_id = public.current_user_organization_id()
    )
  );

create policy "quote_lines_update_org"
  on public.quote_lines for update
  to authenticated
  using (
    exists (
      select 1 from public.quotes q
      where q.id = quote_lines.quote_id
        and q.organization_id = public.current_user_organization_id()
    )
  );

create policy "quote_lines_delete_org"
  on public.quote_lines for delete
  to authenticated
  using (
    exists (
      select 1 from public.quotes q
      where q.id = quote_lines.quote_id
        and q.organization_id = public.current_user_organization_id()
    )
  );


-- ═══════════════════════════════════════════════════════════
-- 5. Trigger numérotation auto DEV-YYYY-XXXX
-- ═══════════════════════════════════════════════════════════

create or replace function public.set_quote_reference()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  current_year int := extract(year from coalesce(new.issue_date, current_date));
  new_counter  bigint;
begin
  -- Insère ou met à jour atomiquement le compteur (year, org)
  insert into public.organization_year_counters (organization_id, year, quotes_counter)
  values (new.organization_id, current_year, 1)
  on conflict (organization_id, year)
  do update set quotes_counter = organization_year_counters.quotes_counter + 1
  returning quotes_counter into new_counter;

  new.reference := 'DEV-' || current_year::text || '-' || lpad(new_counter::text, 4, '0');
  return new;
end;
$$;

drop trigger if exists quotes_set_reference on public.quotes;
create trigger quotes_set_reference
  before insert on public.quotes
  for each row
  when (new.reference is null or new.reference = '')
  execute function public.set_quote_reference();

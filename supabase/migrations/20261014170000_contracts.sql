-- ═══════════════════════════════════════════════════════════
-- Contrats de maintenance — étape A
--
-- contracts       : un contrat par client (durée, reconduction,
--                   facturation, révision annuelle en %)
-- contract_sites  : sites couverts par le contrat
-- contract_lines  : prestations (quantité × prix par visite, fréquence) ;
--                   un forfait = une seule ligne
-- interventions.contract_id : visites rattachées au contrat
--
-- Référence automatique CTR-AAAA-NNNN (compteur annuel par organisation).
-- RLS par organisation et droits explicites (cf. grant_hardening).
-- Idempotent.
-- ═══════════════════════════════════════════════════════════

-- ─── Compteur de numérotation ────────────────────────────────
alter table public.organization_year_counters
  add column if not exists contracts_counter bigint not null default 0;

-- ─── Contrats ────────────────────────────────────────────────
create table if not exists public.contracts (
  id                 uuid primary key default gen_random_uuid(),
  organization_id    uuid not null references public.organizations(id) on delete cascade,
  reference          text,
  client_id          uuid references public.clients(id) on delete set null,
  client_name        text not null,
  title              text,
  status             text not null default 'active'
                       check (status in ('draft', 'active', 'suspended', 'terminated', 'expired')),
  start_date         date not null default current_date,
  initial_months     integer not null default 12 check (initial_months between 1 and 120),
  tacit_renewal      boolean not null default true,
  notice_months      integer not null default 3 check (notice_months between 0 and 24),
  billing_mode       text not null default 'per_visit' check (billing_mode in ('per_visit', 'advance')),
  billing_frequency  text not null default 'annual' check (billing_frequency in ('annual', 'semiannual', 'quarterly')),
  revision_rate      numeric(5, 2) check (revision_rate is null or revision_rate between -50 and 50),
  terminated_on      date,
  termination_reason text,
  signed_document_url text,
  notes              text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  created_by         uuid references auth.users(id) on delete set null
);

create index if not exists idx_contracts_org_client on public.contracts (organization_id, client_id);
create unique index if not exists idx_contracts_org_reference on public.contracts (organization_id, reference);

create table if not exists public.contract_sites (
  contract_id      uuid not null references public.contracts(id) on delete cascade,
  site_id          uuid not null references public.sites(id) on delete cascade,
  organization_id  uuid not null references public.organizations(id) on delete cascade,
  primary key (contract_id, site_id)
);

create index if not exists idx_contract_sites_site on public.contract_sites (site_id);

create table if not exists public.contract_lines (
  id               uuid primary key default gen_random_uuid(),
  contract_id      uuid not null references public.contracts(id) on delete cascade,
  organization_id  uuid not null references public.organizations(id) on delete cascade,
  position         integer not null default 0,
  site_id          uuid references public.sites(id) on delete set null,
  catalog_item_id  uuid references public.catalog_items(id) on delete set null,
  equipment_family text,
  description      text not null check (length(trim(description)) > 0),
  quantity         numeric(10, 2) not null default 1 check (quantity >= 0),
  unit_price_ht    numeric(12, 2) not null default 0 check (unit_price_ht >= 0),
  vat_rate         numeric(4, 2) not null default 20 check (vat_rate in (0, 5.5, 10, 20)),
  frequency        text not null default 'annual' check (frequency in ('annual', 'semiannual', 'quarterly')),
  created_at       timestamptz not null default now()
);

create index if not exists idx_contract_lines_contract on public.contract_lines (contract_id, position);

-- ─── Visites rattachées ──────────────────────────────────────
alter table public.interventions
  add column if not exists contract_id uuid references public.contracts(id) on delete set null;

create index if not exists idx_interventions_contract on public.interventions (contract_id);

-- ─── Référence automatique CTR-AAAA-NNNN ─────────────────────
create or replace function public.set_contract_reference()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  current_year int := extract(year from coalesce(new.start_date, current_date));
  new_counter  bigint;
begin
  insert into public.organization_year_counters (organization_id, year, contracts_counter)
  values (new.organization_id, current_year, 1)
  on conflict (organization_id, year)
  do update set contracts_counter = organization_year_counters.contracts_counter + 1
  returning contracts_counter into new_counter;

  new.reference := 'CTR-' || current_year::text || '-' || lpad(new_counter::text, 4, '0');
  return new;
end;
$$;

drop trigger if exists contracts_set_reference on public.contracts;
create trigger contracts_set_reference
  before insert on public.contracts
  for each row
  when (new.reference is null or new.reference = '')
  execute function public.set_contract_reference();

create or replace function public.contracts_set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists contracts_set_updated_at on public.contracts;
create trigger contracts_set_updated_at
  before update on public.contracts
  for each row execute function public.contracts_set_updated_at();

-- ─── RLS ─────────────────────────────────────────────────────
alter table public.contracts enable row level security;
alter table public.contract_sites enable row level security;
alter table public.contract_lines enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array['contracts', 'contract_sites', 'contract_lines'] loop
    execute format('drop policy if exists "%1$s_select_org" on public.%1$I', t);
    execute format('create policy "%1$s_select_org" on public.%1$I for select to authenticated using (organization_id = public.current_user_organization_id())', t);
    execute format('drop policy if exists "%1$s_insert_org" on public.%1$I', t);
    execute format('create policy "%1$s_insert_org" on public.%1$I for insert to authenticated with check (organization_id = public.current_user_organization_id())', t);
    execute format('drop policy if exists "%1$s_update_org" on public.%1$I', t);
    execute format('create policy "%1$s_update_org" on public.%1$I for update to authenticated using (organization_id = public.current_user_organization_id()) with check (organization_id = public.current_user_organization_id())', t);
    execute format('drop policy if exists "%1$s_delete_org" on public.%1$I', t);
    execute format('create policy "%1$s_delete_org" on public.%1$I for delete to authenticated using (organization_id = public.current_user_organization_id())', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('revoke all on public.%I from authenticated', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end $$;

revoke execute on function public.set_contract_reference() from public, anon, authenticated;
revoke execute on function public.contracts_set_updated_at() from public, anon, authenticated;

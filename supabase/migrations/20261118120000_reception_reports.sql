-- ═══════════════════════════════════════════════════════════
-- Procès-verbaux de réception (PV)
--
-- Document à part, fait après une installation à partir d'un devis
-- accepté : adressé au client (à l'attention de…), affaire (adresse du
-- chantier), descriptif des travaux, référentiels cochés, date de
-- livraison. Numérotation propre : PV-AAAA-NNN (compteur annuel), avec
-- reprise possible de la série d'un ancien outil (Paramètres → prochain
-- numéro de PV).
--
-- Droits : comme les devis et les bons de livraison, réservés aux
-- administrateurs. Idempotent.
-- ═══════════════════════════════════════════════════════════

alter table public.organization_year_counters
  add column if not exists reception_reports_counter bigint not null default 0;

create table if not exists public.reception_reports (
  id                  uuid primary key default gen_random_uuid(),
  organization_id     uuid not null references public.organizations(id) on delete cascade,
  quote_id            uuid references public.quotes(id) on delete set null,
  reference           text not null default '',
  issue_date          date not null default current_date,
  -- Ville imprimée devant la date (« Poissy, le … »)
  issue_city          text,
  quote_reference     text,
  order_reference     text,
  client_name         text not null,
  client_contact_name text,
  client_address      text,
  site_name           text,
  site_address        text,
  dossier_number      text,
  description         text,
  -- Référentiels cochés (normes publiques et ceux de l'entreprise)
  standards           text[] not null default '{}',
  other_standards     text,
  -- Précision libre sous les référentiels (ex. énergie de déclenchement)
  standards_note      text,
  delivery_date       date,
  -- Personne qui signe pour l'entreprise
  signatory_name      text,
  pdf_url             text,
  sent_at             timestamptz,
  created_at          timestamptz not null default now(),
  created_by          uuid references auth.users(id) on delete set null,
  updated_at          timestamptz not null default now()
);

create unique index if not exists uq_reception_reports_org_ref
  on public.reception_reports (organization_id, reference) where reference <> '';
create index if not exists idx_reception_reports_quote on public.reception_reports (quote_id);
create index if not exists idx_reception_reports_org_created on public.reception_reports (organization_id, created_at desc);

-- Numéro PV-AAAA-NNN attribué à la création (année du PV)
create or replace function public.set_reception_report_reference()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  current_year int := extract(year from coalesce(new.issue_date, current_date));
  new_counter  bigint;
begin
  if coalesce(new.reference, '') <> '' then
    return new;
  end if;
  insert into public.organization_year_counters (organization_id, year, reception_reports_counter)
  values (new.organization_id, current_year, 1)
  on conflict (organization_id, year)
  do update set reception_reports_counter = organization_year_counters.reception_reports_counter + 1
  returning reception_reports_counter into new_counter;
  -- 3 chiffres minimum (PV-2026-007), sans jamais tronquer au-delà de 999
  new.reference := 'PV-' || current_year::text || '-'
    || case when new_counter < 1000 then lpad(new_counter::text, 3, '0') else new_counter::text end;
  return new;
end;
$$;

drop trigger if exists reception_reports_set_reference on public.reception_reports;
create trigger reception_reports_set_reference
  before insert on public.reception_reports
  for each row execute function public.set_reception_report_reference();

create or replace function public.reception_reports_set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists reception_reports_updated_at on public.reception_reports;
create trigger reception_reports_updated_at
  before update on public.reception_reports
  for each row execute function public.reception_reports_set_updated_at();

revoke execute on function public.set_reception_report_reference() from public, anon, authenticated;
revoke execute on function public.reception_reports_set_updated_at() from public, anon, authenticated;

-- ─── Règles d'accès : administrateurs de l'entreprise ──────
alter table public.reception_reports enable row level security;

drop policy if exists reception_reports_select_admin on public.reception_reports;
drop policy if exists reception_reports_insert_admin on public.reception_reports;
drop policy if exists reception_reports_update_admin on public.reception_reports;
drop policy if exists reception_reports_delete_admin on public.reception_reports;
create policy reception_reports_select_admin on public.reception_reports for select to authenticated
  using (organization_id = public.current_user_organization_id() and public.current_user_is_org_admin());
create policy reception_reports_insert_admin on public.reception_reports for insert to authenticated
  with check (organization_id = public.current_user_organization_id() and public.current_user_is_org_admin());
create policy reception_reports_update_admin on public.reception_reports for update to authenticated
  using (organization_id = public.current_user_organization_id() and public.current_user_is_org_admin())
  with check (organization_id = public.current_user_organization_id() and public.current_user_is_org_admin());
create policy reception_reports_delete_admin on public.reception_reports for delete to authenticated
  using (organization_id = public.current_user_organization_id() and public.current_user_is_org_admin());

-- Droits explicites (les nouvelles tables n'en ont plus par défaut)
revoke all on public.reception_reports from public, anon, authenticated;
grant select, insert, update, delete on public.reception_reports to authenticated;
grant all on public.reception_reports to service_role;

-- ─── Prochain numéro : devis, facture et maintenant PV ─────
create or replace function public.set_next_document_number(p_kind text, p_next integer)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_org  uuid;
  caller_role text;
  yr          int := extract(year from current_date)::int;
  cur         bigint;
begin
  select organization_id, user_role into caller_org, caller_role
    from public.profiles
   where id = auth.uid();

  if caller_org is null then
    return jsonb_build_object('error', 'not_authenticated');
  end if;
  if coalesce(caller_role, 'admin') <> 'admin' then
    return jsonb_build_object('error', 'not_admin');
  end if;
  if p_kind not in ('quote', 'invoice', 'reception') then
    return jsonb_build_object('error', 'bad_kind');
  end if;
  if p_next is null or p_next < 1 or p_next > 999999 then
    return jsonb_build_object('error', 'bad_number');
  end if;

  insert into public.organization_year_counters (organization_id, year)
  values (caller_org, yr)
  on conflict (organization_id, year) do nothing;

  if p_kind = 'quote' then
    select quotes_counter into cur
      from public.organization_year_counters
     where organization_id = caller_org and year = yr
     for update;
    if p_next <= cur then
      return jsonb_build_object('error', 'would_reuse', 'current', cur);
    end if;
    update public.organization_year_counters
       set quotes_counter = p_next - 1
     where organization_id = caller_org and year = yr;
  elsif p_kind = 'reception' then
    select reception_reports_counter into cur
      from public.organization_year_counters
     where organization_id = caller_org and year = yr
     for update;
    if p_next <= cur then
      return jsonb_build_object('error', 'would_reuse', 'current', cur);
    end if;
    update public.organization_year_counters
       set reception_reports_counter = p_next - 1
     where organization_id = caller_org and year = yr;
  else
    if exists (
      select 1 from public.invoices
       where organization_id = caller_org
         and kind = 'invoice'
         and reference not like 'BROUILLON-%'
         and extract(year from issue_date)::int = yr
    ) then
      return jsonb_build_object('error', 'invoices_already_issued');
    end if;
    update public.organization_year_counters
       set invoices_counter = p_next - 1
     where organization_id = caller_org and year = yr;
  end if;

  return jsonb_build_object('ok', true, 'year', yr, 'next', p_next);
end;
$$;

revoke execute on function public.set_next_document_number(text, integer) from public, anon;
grant execute on function public.set_next_document_number(text, integer) to authenticated, service_role;

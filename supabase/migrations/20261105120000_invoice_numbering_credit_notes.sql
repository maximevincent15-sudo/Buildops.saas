-- ═══════════════════════════════════════════════════════════
-- Factures : numéro attribué à l'envoi + avoirs
--
-- 1. Un brouillon n'a plus de numéro : il reçoit une référence provisoire
--    « BROUILLON-… ». Le numéro (FAC-2026-0007) est attribué quand la
--    facture quitte le brouillon (envoi) ; la date de la facture devient
--    alors la date du jour et l'échéance est décalée d'autant. Les numéros
--    suivent ainsi l'ordre des dates, sans trou : un brouillon supprimé ne
--    consomme aucun numéro. Les brouillons existants gardent leur numéro.
--    Une facture créée directement émise est elle aussi datée du jour.
--    Une facture numérotée ne repasse plus jamais en brouillon.
-- 2. Avoirs : une ligne de invoices de kind = 'credit_note', rattachée à
--    une facture émise de la même entreprise (credited_invoice_id), créée
--    en brouillon puis numérotée dans sa propre série (AV-2026-0001) à
--    l'émission. Montants stockés en positif ; un avoir ne dépasse jamais
--    le reste créditable de sa facture. À l'émission, la facture cumule
--    credited_ht / credited_ttc : entièrement créditée, elle passe
--    « annulée » ; si les règlements couvrent le reste, elle passe « payée ».
--    Un avoir émis ne s'annule pas et ne se modifie plus.
-- 3. Le verrouillage des factures émises couvre aussi kind,
--    credited_invoice_id et les montants crédités (posés par la base seule).
-- 4. « Prochain numéro de facture » (Paramètres) : seules les factures déjà
--    numérotées de l'année bloquent le changement, pas les brouillons.
-- 5. Portail client : les avoirs y figurent comme avoirs (type, facture
--    d'origine) et le reste dû des factures tient compte des avoirs.
--
-- Colonnes ajoutées à des tables existantes : RLS et droits de table
-- inchangés. Fonctions de déclencheur : jamais appelées directement.
-- Idempotent.
-- ═══════════════════════════════════════════════════════════

-- ─── 1. Colonnes ─────────────────────────────────────────────

alter table public.invoices
  add column if not exists kind text not null default 'invoice',
  add column if not exists credited_invoice_id uuid references public.invoices(id) on delete restrict,
  add column if not exists credited_ht numeric(12,2) not null default 0,
  add column if not exists credited_ttc numeric(12,2) not null default 0;

alter table public.invoices drop constraint if exists invoices_kind_check;
alter table public.invoices
  add constraint invoices_kind_check check (
    (kind = 'invoice' and credited_invoice_id is null)
    or (kind = 'credit_note' and credited_invoice_id is not null)
  );

create index if not exists idx_invoices_credited on public.invoices (credited_invoice_id) where credited_invoice_id is not null;

alter table public.organization_year_counters
  add column if not exists credit_notes_counter bigint not null default 0;

comment on column public.invoices.kind is 'invoice : facture ; credit_note : avoir (montants positifs, rattaché à credited_invoice_id)';
comment on column public.invoices.credited_ttc is 'Total TTC des avoirs émis sur cette facture (reste dû = total_ttc - credited_ttc - amount_paid), posé par la base';

-- ─── 2. Numérotation ─────────────────────────────────────────

-- Prochain numéro de la série (factures ou avoirs) pour l'année donnée
create or replace function public.next_invoice_number(p_org uuid, p_kind text, p_year int)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  prefix  text;
  counter bigint;
begin
  if p_kind = 'credit_note' then
    prefix := 'AV';
    insert into public.organization_year_counters (organization_id, year, credit_notes_counter)
    values (p_org, p_year, 1)
    on conflict (organization_id, year) do update set credit_notes_counter = organization_year_counters.credit_notes_counter + 1
    returning credit_notes_counter into counter;
  else
    select coalesce(invoice_prefix, 'FAC') into prefix from public.organization_invoicing_settings where organization_id = p_org;
    if prefix is null then prefix := 'FAC'; end if;
    insert into public.organization_year_counters (organization_id, year, invoices_counter)
    values (p_org, p_year, 1)
    on conflict (organization_id, year) do update set invoices_counter = organization_year_counters.invoices_counter + 1
    returning invoices_counter into counter;
  end if;
  return prefix || '-' || p_year::text || '-' || lpad(counter::text, 4, '0');
end;
$$;

-- À la création : brouillon → référence provisoire ; sinon numéro définitif,
-- daté du jour (pas de facture antidatée depuis l'app)
create or replace function public.set_invoice_reference()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'draft' then
    new.reference := 'BROUILLON-' || upper(left(replace(new.id::text, '-', ''), 12));
    return new;
  end if;
  if auth.uid() is not null then
    if new.due_date is not null and new.issue_date is not null then
      new.due_date := current_date + (new.due_date - new.issue_date);
    end if;
    new.issue_date := current_date;
  end if;
  new.reference := public.next_invoice_number(new.organization_id, new.kind, extract(year from coalesce(new.issue_date, current_date))::int);
  return new;
end;
$$;

-- Sortie du brouillon : numéro définitif, date du jour, échéance décalée
create or replace function public.assign_invoice_number()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.status <> 'draft' or new.status in ('draft', 'cancelled') or old.reference not like 'BROUILLON-%' then
    return new;
  end if;

  if new.kind = 'credit_note' then
    new.due_date := null;
  elsif old.due_date is not null and old.issue_date is not null then
    new.due_date := current_date + (old.due_date - old.issue_date);
  end if;

  new.issue_date := current_date;
  new.reference := public.next_invoice_number(new.organization_id, new.kind, extract(year from current_date)::int);
  return new;
end;
$$;

drop trigger if exists invoices_assign_number on public.invoices;
create trigger invoices_assign_number
  before update on public.invoices
  for each row execute function public.assign_invoice_number();

-- ─── 3. Règles des avoirs ────────────────────────────────────

-- Un avoir vise une facture émise, non annulée, de la même entreprise ;
-- il naît en brouillon et ne dépasse pas le reste créditable à l'émission
create or replace function public.check_credit_note()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  inv record;
begin
  if new.kind <> 'credit_note' then
    return new;
  end if;
  -- Avoir déjà émis : rien à revérifier (le verrouillage s'en charge)
  if tg_op = 'UPDATE' and old.status <> 'draft' then
    return new;
  end if;

  select id, kind, status, total_ttc, credited_ttc into inv
    from public.invoices
   where id = new.credited_invoice_id and organization_id = new.organization_id;
  if not found or inv.kind <> 'invoice' then
    raise exception 'Facture d''origine introuvable pour cet avoir.' using errcode = '23514';
  end if;
  if inv.status in ('draft', 'cancelled') then
    raise exception 'Un avoir ne se fait que sur une facture émise et non annulée.' using errcode = '23514';
  end if;
  if tg_op = 'INSERT' and new.status <> 'draft' then
    raise exception 'Un avoir se crée en brouillon, puis s''émet.' using errcode = '23514';
  end if;

  -- Émission : montant positif, dans la limite du reste créditable
  if tg_op = 'UPDATE' and new.status not in ('draft', 'cancelled') then
    if coalesce(new.total_ttc, 0) <= 0 then
      raise exception 'Le montant de l''avoir doit être supérieur à zéro.' using errcode = '23514';
    end if;
    if new.total_ttc > inv.total_ttc - inv.credited_ttc + 0.01 then
      raise exception 'L''avoir dépasse le montant restant de la facture.' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists invoices_check_credit_note on public.invoices;
create trigger invoices_check_credit_note
  before insert or update on public.invoices
  for each row execute function public.check_credit_note();

-- Effet d'un avoir émis sur sa facture
create or replace function public.apply_credit_note()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  inv record;
  new_credited numeric(12,2);
  fully boolean;
begin
  if new.kind <> 'credit_note' or old.status <> 'draft' or new.status in ('draft', 'cancelled') then
    return null;
  end if;
  select * into inv
    from public.invoices
   where id = new.credited_invoice_id and organization_id = new.organization_id
   for update;
  if not found or inv.status = 'cancelled' then
    return null;
  end if;
  new_credited := inv.credited_ttc + new.total_ttc;
  fully := new_credited >= inv.total_ttc - 0.01;
  update public.invoices
     set credited_ht = credited_ht + new.total_ht,
         credited_ttc = new_credited,
         status = case
           when fully then 'cancelled'
           when inv.amount_paid >= inv.total_ttc - new_credited - 0.01 then 'paid'
           else inv.status
         end,
         cancelled_at = case when fully then now() else cancelled_at end,
         cancelled_reason = case when fully then 'Annulée par l''avoir ' || new.reference else cancelled_reason end,
         paid_at = case
           when not fully and inv.amount_paid >= inv.total_ttc - new_credited - 0.01 then coalesce(paid_at, now())
           else paid_at
         end,
         updated_at = now()
   where id = inv.id;
  return null;
end;
$$;

drop trigger if exists invoices_apply_credit_note on public.invoices;
create trigger invoices_apply_credit_note
  after update on public.invoices
  for each row execute function public.apply_credit_note();

-- ─── 4. Verrouillage ─────────────────────────────────────────

create or replace function public.protect_issued_invoice()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return coalesce(new, old);
  end if;

  if tg_op = 'DELETE' then
    if old.status <> 'draft' then
      raise exception 'Une facture émise ne peut pas être supprimée : faites un avoir.' using errcode = '42501';
    end if;
    return old;
  end if;

  -- Montants crédités : posés par la base à l'émission d'un avoir (déclencheur imbriqué), jamais à la main
  if (new.credited_ht, new.credited_ttc) is distinct from (old.credited_ht, old.credited_ttc) and pg_trigger_depth() < 2 then
    raise exception 'Les montants crédités se mettent à jour par les avoirs.' using errcode = '42501';
  end if;

  if old.status = 'draft' then
    return new;
  end if;
  if old.status = 'cancelled' then
    raise exception 'Une facture annulée ne peut plus être modifiée.' using errcode = '42501';
  end if;
  if new.status = 'draft' then
    raise exception 'Une facture émise ne peut pas repasser en brouillon.' using errcode = '42501';
  end if;
  if old.kind = 'credit_note' and new.status is distinct from old.status then
    raise exception 'Un avoir émis ne s''annule pas et ne se règle pas.' using errcode = '42501';
  end if;
  -- Annulation d'une facture émise : uniquement par un avoir (déclencheur imbriqué)
  if new.status = 'cancelled' and pg_trigger_depth() < 2 then
    raise exception 'Pour annuler une facture émise, faites un avoir.' using errcode = '42501';
  end if;
  if (new.reference, new.organization_id, new.client_id, new.client_name, new.client_contact_name,
      new.client_address, new.client_siren, new.client_email, new.intervention_id, new.quote_id,
      new.site_name, new.site_address, new.issue_date, new.due_date, new.notes,
      new.total_ht, new.total_vat, new.total_ttc, new.contract_id, new.contract_period_start,
      new.dossier_number, new.kind, new.credited_invoice_id)
     is distinct from
     (old.reference, old.organization_id, old.client_id, old.client_name, old.client_contact_name,
      old.client_address, old.client_siren, old.client_email, old.intervention_id, old.quote_id,
      old.site_name, old.site_address, old.issue_date, old.due_date, old.notes,
      old.total_ht, old.total_vat, old.total_ttc, old.contract_id, old.contract_period_start,
      old.dossier_number, old.kind, old.credited_invoice_id) then
    raise exception 'Une facture émise ne peut plus être modifiée : faites un avoir puis refaites-la.' using errcode = '42501';
  end if;
  return new;
end;
$$;

-- ─── 5. Prochain numéro : les brouillons ne comptent plus ────

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
  if p_kind not in ('quote', 'invoice') then
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

-- ─── 6. Portail client : avoirs et montants crédités ─────────

create or replace function public.client_portal_invoices(in_token text)
returns setof jsonb
language plpgsql
security definer
set search_path = public
as $$
declare tok public.client_portal_tokens;
begin
  select * into tok from public.client_portal_tokens where token = in_token and revoked_at is null and expires_at > now() limit 1;
  if tok.id is null then return; end if;
  return query select jsonb_build_object('id', inv.id, 'reference', inv.reference, 'issue_date', inv.issue_date, 'due_date', inv.due_date, 'status', inv.status, 'total_ht', inv.total_ht, 'total_vat', inv.total_vat, 'total_ttc', inv.total_ttc, 'amount_paid', inv.amount_paid, 'paid_at', inv.paid_at, 'pdf_url', inv.pdf_url, 'site_name', inv.site_name,
      'kind', inv.kind, 'credited_ttc', inv.credited_ttc,
      'credited_reference', (select o.reference from public.invoices o where o.id = inv.credited_invoice_id and o.organization_id = inv.organization_id))
    from public.invoices inv
   where inv.client_id = tok.client_id and inv.organization_id = tok.organization_id
     and inv.status <> 'draft' and inv.status <> 'cancelled'
   order by inv.issue_date desc, inv.created_at desc;
end; $$;

-- ─── 7. Droits ───────────────────────────────────────────────

revoke execute on function public.next_invoice_number(uuid, text, int) from public, anon, authenticated;
revoke execute on function public.set_invoice_reference() from public, anon, authenticated;
revoke execute on function public.assign_invoice_number() from public, anon, authenticated;
revoke execute on function public.check_credit_note() from public, anon, authenticated;
revoke execute on function public.apply_credit_note() from public, anon, authenticated;
revoke execute on function public.protect_issued_invoice() from public, anon, authenticated;
grant execute on function public.next_invoice_number(uuid, text, int) to service_role;
grant execute on function public.set_invoice_reference() to service_role;
grant execute on function public.assign_invoice_number() to service_role;
grant execute on function public.check_credit_note() to service_role;
grant execute on function public.apply_credit_note() to service_role;
grant execute on function public.protect_issued_invoice() to service_role;

-- Fonction appelée par l'app (Paramètres) : droits inchangés
revoke execute on function public.set_next_document_number(text, integer) from public, anon;
grant execute on function public.set_next_document_number(text, integer) to authenticated, service_role;

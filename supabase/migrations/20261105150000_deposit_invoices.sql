-- ═══════════════════════════════════════════════════════════
-- Factures d'acompte et déduction automatique sur la facture finale
--
-- 1. invoices.is_deposit : facture d'acompte (numérotée dans la série des
--    factures, rattachée au devis par quote_id).
-- 2. invoice_lines.deposit_invoice_id : ligne de déduction d'un acompte
--    (montant négatif) sur la facture finale. La base vérifie qu'il s'agit
--    d'un acompte émis, non annulé, de la même entreprise, et qu'il n'est
--    pas déjà déduit d'une autre facture non annulée.
-- 3. Un acompte déjà déduit ne se crédite plus par un avoir : c'est la
--    facture qui le déduit qu'il faut créditer.
-- 4. is_deposit rejoint les champs verrouillés d'une facture émise.
--
-- Colonnes ajoutées à des tables existantes : RLS et droits de table
-- inchangés. Fonctions de déclencheur : jamais appelées directement.
-- Idempotent.
-- ═══════════════════════════════════════════════════════════

-- ─── 1. Colonnes ─────────────────────────────────────────────

alter table public.invoices
  add column if not exists is_deposit boolean not null default false;

alter table public.invoices drop constraint if exists invoices_deposit_check;
alter table public.invoices
  add constraint invoices_deposit_check check (not is_deposit or kind = 'invoice');

alter table public.invoice_lines
  add column if not exists deposit_invoice_id uuid references public.invoices(id) on delete restrict;

create index if not exists idx_invoice_lines_deposit on public.invoice_lines (deposit_invoice_id) where deposit_invoice_id is not null;

comment on column public.invoices.is_deposit is 'Facture d''acompte (déduite ensuite de la facture finale du devis)';
comment on column public.invoice_lines.deposit_invoice_id is 'Ligne de déduction d''un acompte déjà facturé (montant négatif)';

-- ─── 2. Déduction d'un acompte ───────────────────────────────

create or replace function public.check_deposit_deduction()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target record;
  dep record;
  other text;
begin
  if new.deposit_invoice_id is null then
    return new;
  end if;
  select id, organization_id, kind into target from public.invoices where id = new.invoice_id;
  if not found then
    raise exception 'Facture introuvable.' using errcode = '23514';
  end if;
  if target.kind <> 'invoice' then
    raise exception 'Un avoir ne déduit pas d''acompte.' using errcode = '23514';
  end if;
  if new.deposit_invoice_id = new.invoice_id then
    raise exception 'Une facture ne peut pas se déduire elle-même.' using errcode = '23514';
  end if;
  select id, organization_id, is_deposit, status into dep from public.invoices where id = new.deposit_invoice_id;
  if not found or dep.organization_id <> target.organization_id or not dep.is_deposit then
    raise exception 'Acompte introuvable.' using errcode = '23514';
  end if;
  if dep.status in ('draft', 'cancelled') then
    raise exception 'Seul un acompte émis et non annulé peut être déduit.' using errcode = '23514';
  end if;
  select i.reference into other
    from public.invoice_lines l
    join public.invoices i on i.id = l.invoice_id
   where l.deposit_invoice_id = new.deposit_invoice_id
     and l.invoice_id <> new.invoice_id
     and i.status <> 'cancelled'
   limit 1;
  if other is not null then
    raise exception 'Cet acompte est déjà déduit de la facture %.', other using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists invoice_lines_check_deposit on public.invoice_lines;
create trigger invoice_lines_check_deposit
  before insert or update on public.invoice_lines
  for each row execute function public.check_deposit_deduction();

-- ─── 3. Avoirs : pas sur un acompte déjà déduit ──────────────

create or replace function public.check_credit_note()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  inv record;
  deducted_in text;
begin
  if new.kind <> 'credit_note' then
    return new;
  end if;
  -- Avoir déjà émis : rien à revérifier (le verrouillage s'en charge)
  if tg_op = 'UPDATE' and old.status <> 'draft' then
    return new;
  end if;

  select id, kind, status, total_ttc, credited_ttc, is_deposit into inv
    from public.invoices
   where id = new.credited_invoice_id and organization_id = new.organization_id;
  if not found or inv.kind <> 'invoice' then
    raise exception 'Facture d''origine introuvable pour cet avoir.' using errcode = '23514';
  end if;
  if inv.status in ('draft', 'cancelled') then
    raise exception 'Un avoir ne se fait que sur une facture émise et non annulée.' using errcode = '23514';
  end if;
  if inv.is_deposit then
    select i.reference into deducted_in
      from public.invoice_lines l
      join public.invoices i on i.id = l.invoice_id
     where l.deposit_invoice_id = inv.id and i.status <> 'cancelled'
     limit 1;
    if deducted_in is not null then
      raise exception 'Cet acompte est déduit de la facture % : faites l''avoir sur celle-ci.', deducted_in using errcode = '23514';
    end if;
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

-- ─── 4. Verrouillage : is_deposit inclus ─────────────────────

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
      new.dossier_number, new.kind, new.credited_invoice_id, new.is_deposit)
     is distinct from
     (old.reference, old.organization_id, old.client_id, old.client_name, old.client_contact_name,
      old.client_address, old.client_siren, old.client_email, old.intervention_id, old.quote_id,
      old.site_name, old.site_address, old.issue_date, old.due_date, old.notes,
      old.total_ht, old.total_vat, old.total_ttc, old.contract_id, old.contract_period_start,
      old.dossier_number, old.kind, old.credited_invoice_id, old.is_deposit) then
    raise exception 'Une facture émise ne peut plus être modifiée : faites un avoir puis refaites-la.' using errcode = '42501';
  end if;
  return new;
end;
$$;

-- ─── 5. Droits : fonctions internes ──────────────────────────

revoke execute on function public.check_deposit_deduction() from public, anon, authenticated;
revoke execute on function public.check_credit_note() from public, anon, authenticated;
revoke execute on function public.protect_issued_invoice() from public, anon, authenticated;
grant execute on function public.check_deposit_deduction() to service_role;
grant execute on function public.check_credit_note() to service_role;
grant execute on function public.protect_issued_invoice() to service_role;

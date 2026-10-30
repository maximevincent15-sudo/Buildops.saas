-- ═══════════════════════════════════════════════════════════
-- Factures : verrouillage des factures émises + mention TVA réglable
--
-- 1. Une facture qui n'est plus en brouillon (envoyée, payée, en retard,
--    annulée) ne se modifie plus et ne se supprime plus : seuls changent
--    son statut, ses règlements, sa date d'envoi, son annulation et son
--    PDF. Pour corriger : annuler la facture, puis en refaire une
--    (« Dupliquer »). Ses lignes sont verrouillées de la même façon.
--    Une facture annulée ne bouge plus. Les appels serveur (cron, service
--    role, SQL) ne sont pas concernés (auth.uid() nul).
-- 2. organization_invoicing_settings.vat_mention : mention imprimée en bas
--    des factures, au lieu de « TVA acquittée sur les débits » imprimée
--    pour tout le monde :
--      none      → aucune mention
--      debits    → « Option pour le paiement de la taxe d'après les débits »
--      franchise → « TVA non applicable, art. 293 B du CGI »
-- ═══════════════════════════════════════════════════════════

-- ─── 1. Verrouillage ─────────────────────────────────────────

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
      raise exception 'Une facture émise ne peut pas être supprimée : annulez-la.' using errcode = '42501';
    end if;
    return old;
  end if;

  if old.status = 'draft' then
    return new;
  end if;
  if old.status = 'cancelled' then
    raise exception 'Une facture annulée ne peut plus être modifiée.' using errcode = '42501';
  end if;
  if new.status = 'draft' and old.sent_at is not null then
    raise exception 'Une facture envoyée ne peut pas repasser en brouillon.' using errcode = '42501';
  end if;
  if (new.reference, new.organization_id, new.client_id, new.client_name, new.client_contact_name,
      new.client_address, new.client_siren, new.client_email, new.intervention_id, new.quote_id,
      new.site_name, new.site_address, new.issue_date, new.due_date, new.notes,
      new.total_ht, new.total_vat, new.total_ttc, new.contract_id, new.contract_period_start)
     is distinct from
     (old.reference, old.organization_id, old.client_id, old.client_name, old.client_contact_name,
      old.client_address, old.client_siren, old.client_email, old.intervention_id, old.quote_id,
      old.site_name, old.site_address, old.issue_date, old.due_date, old.notes,
      old.total_ht, old.total_vat, old.total_ttc, old.contract_id, old.contract_period_start) then
    raise exception 'Une facture émise ne peut plus être modifiée : annulez-la puis refaites-la.' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists invoices_protect_issued on public.invoices;
create trigger invoices_protect_issued
  before update or delete on public.invoices
  for each row execute function public.protect_issued_invoice();

create or replace function public.protect_issued_invoice_lines()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  inv_status text;
begin
  if auth.uid() is null then
    return coalesce(new, old);
  end if;
  -- Facture introuvable (suppression d'un brouillon en cascade) : laisser passer
  select status into inv_status from public.invoices where id = coalesce(new.invoice_id, old.invoice_id);
  if inv_status is not null and inv_status <> 'draft' then
    raise exception 'Les lignes d''une facture émise ne peuvent plus être modifiées.' using errcode = '42501';
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists invoice_lines_protect_issued on public.invoice_lines;
create trigger invoice_lines_protect_issued
  before insert or update or delete on public.invoice_lines
  for each row execute function public.protect_issued_invoice_lines();

-- Fonctions de trigger : jamais appelées directement
revoke execute on function public.protect_issued_invoice() from public, anon, authenticated;
revoke execute on function public.protect_issued_invoice_lines() from public, anon, authenticated;
grant execute on function public.protect_issued_invoice() to service_role;
grant execute on function public.protect_issued_invoice_lines() to service_role;

-- ─── 2. Mention TVA ──────────────────────────────────────────

alter table public.organization_invoicing_settings
  add column if not exists vat_mention text not null default 'none';

alter table public.organization_invoicing_settings
  drop constraint if exists organization_invoicing_settings_vat_mention_check;
alter table public.organization_invoicing_settings
  add constraint organization_invoicing_settings_vat_mention_check
  check (vat_mention in ('none', 'debits', 'franchise'));

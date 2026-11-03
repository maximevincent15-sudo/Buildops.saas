-- ═══════════════════════════════════════════════════════════
-- N° de dossier (chantier)
--
-- Numéro permanent du dossier d'un chantier (ex. « D-2026-014 »), choisi
-- par l'entreprise. Il est porté par les sites : un dossier couvre le plus
-- souvent un site, parfois plusieurs (les sites qui portent le même numéro
-- forment un seul dossier). Les devis et les factures en gardent une copie,
-- imprimée sur le PDF ; sur une facture émise, il est verrouillé comme le
-- reste. Idempotent.
-- ═══════════════════════════════════════════════════════════

alter table public.sites add column if not exists dossier_number text;
alter table public.quotes add column if not exists dossier_number text;
alter table public.invoices add column if not exists dossier_number text;

create index if not exists idx_sites_org_dossier
  on public.sites (organization_id, dossier_number) where dossier_number is not null;
create index if not exists idx_quotes_org_dossier
  on public.quotes (organization_id, dossier_number) where dossier_number is not null;
create index if not exists idx_invoices_org_dossier
  on public.invoices (organization_id, dossier_number) where dossier_number is not null;

-- Factures émises : le N° de dossier rejoint les champs verrouillés
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
      new.total_ht, new.total_vat, new.total_ttc, new.contract_id, new.contract_period_start,
      new.dossier_number)
     is distinct from
     (old.reference, old.organization_id, old.client_id, old.client_name, old.client_contact_name,
      old.client_address, old.client_siren, old.client_email, old.intervention_id, old.quote_id,
      old.site_name, old.site_address, old.issue_date, old.due_date, old.notes,
      old.total_ht, old.total_vat, old.total_ttc, old.contract_id, old.contract_period_start,
      old.dossier_number) then
    raise exception 'Une facture émise ne peut plus être modifiée : annulez-la puis refaites-la.' using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke execute on function public.protect_issued_invoice() from public, anon, authenticated;
grant execute on function public.protect_issued_invoice() to service_role;

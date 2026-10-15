-- ═══════════════════════════════════════════════════════════
-- Catalogue d'articles (fournitures, prestations, main-d'œuvre)
--
-- Sert à remplir une ligne de devis ou de facture en un clic :
-- désignation, prix de vente HT, TVA. Le prix d'achat (facultatif)
-- permet de suivre la marge. Multi-tenant : une organisation ne voit
-- que son catalogue (RLS), droits explicites comme le reste du métier
-- (cf. 20260916170000_grant_hardening).
-- Idempotent.
-- ═══════════════════════════════════════════════════════════

create table if not exists public.catalog_items (
  id                 uuid primary key default gen_random_uuid(),
  organization_id    uuid not null references public.organizations(id) on delete cascade,
  reference          text,
  label              text not null check (length(trim(label)) > 0),
  category           text not null default 'fourniture'
                       check (category in ('fourniture', 'prestation', 'main_oeuvre', 'deplacement', 'autre')),
  unit               text not null default 'u',
  unit_price_ht      numeric(12, 2) not null default 0 check (unit_price_ht >= 0),
  purchase_price_ht  numeric(12, 2) check (purchase_price_ht is null or purchase_price_ht >= 0),
  vat_rate           numeric(4, 2) not null default 20 check (vat_rate in (0, 5.5, 10, 20)),
  notes              text,
  active             boolean not null default true,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  created_by         uuid references auth.users(id) on delete set null
);

create index if not exists idx_catalog_items_org_label on public.catalog_items (organization_id, label);

alter table public.catalog_items enable row level security;

drop policy if exists "catalog_items_select_org" on public.catalog_items;
create policy "catalog_items_select_org"
  on public.catalog_items for select
  to authenticated
  using (organization_id = public.current_user_organization_id());

drop policy if exists "catalog_items_insert_org" on public.catalog_items;
create policy "catalog_items_insert_org"
  on public.catalog_items for insert
  to authenticated
  with check (organization_id = public.current_user_organization_id());

drop policy if exists "catalog_items_update_org" on public.catalog_items;
create policy "catalog_items_update_org"
  on public.catalog_items for update
  to authenticated
  using (organization_id = public.current_user_organization_id())
  with check (organization_id = public.current_user_organization_id());

drop policy if exists "catalog_items_delete_org" on public.catalog_items;
create policy "catalog_items_delete_org"
  on public.catalog_items for delete
  to authenticated
  using (organization_id = public.current_user_organization_id());

-- updated_at automatique
create or replace function public.catalog_items_set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists catalog_items_set_updated_at on public.catalog_items;
create trigger catalog_items_set_updated_at
  before update on public.catalog_items
  for each row execute function public.catalog_items_set_updated_at();

-- Droits : rien pour anon, CRUD sans TRUNCATE pour authenticated
revoke all on public.catalog_items from anon;
revoke all on public.catalog_items from authenticated;
grant select, insert, update, delete on public.catalog_items to authenticated;
revoke execute on function public.catalog_items_set_updated_at() from public, anon, authenticated;

-- ═══════════════════════════════════════════════════════════
-- Accusé de réception de commande et bons de livraison
--
-- 1. Accusé de réception (AR) : fait quand le client valide le devis.
--    Pas de table : il porte le numéro du devis. On garde sur le devis
--    la référence de commande du client, le délai prévu, les conditions
--    de paiement, la date et le PDF de l'AR.
-- 2. Bons de livraison (BL) : un devis accepté peut être livré en
--    plusieurs fois. Chaque BL a son numéro (BL-AAAA-NNNN, compteur
--    annuel), reprend des lignes du devis sans les prix et peut être
--    signé sur place (livraison sur chantier ou « bon pour enlèvement »).
--    Les lignes du devis sont recréées à chaque modification : le lien
--    se fait par la désignation (et la position), pas par l'identifiant.
--
-- Droits : comme les devis, réservés aux administrateurs (un technicien
-- ne voit pas les devis). Idempotent.
-- ═══════════════════════════════════════════════════════════

-- ─── 1. Accusé de réception : colonnes du devis ────────────
alter table public.quotes add column if not exists order_reference text;
alter table public.quotes add column if not exists order_date date;
alter table public.quotes add column if not exists order_lead_time text;
alter table public.quotes add column if not exists order_payment_terms text;
alter table public.quotes add column if not exists order_ack_date date;
alter table public.quotes add column if not exists order_ack_pdf_url text;
alter table public.quotes add column if not exists order_ack_sent_at timestamptz;

comment on column public.quotes.order_reference is 'Référence de commande du client (bon de commande), reprise sur l''AR et les BL';
comment on column public.quotes.order_date is 'Date de la commande (validation du devis par le client)';
comment on column public.quotes.order_lead_time is 'Délai prévu indiqué sur l''accusé de réception';
comment on column public.quotes.order_payment_terms is 'Conditions de paiement indiquées sur l''accusé de réception';
comment on column public.quotes.order_ack_date is 'Date de l''accusé de réception de commande';
comment on column public.quotes.order_ack_pdf_url is 'PDF de l''accusé de réception de commande (stockage privé)';
comment on column public.quotes.order_ack_sent_at is 'Envoi de l''accusé de réception au client';

-- ─── 2. Bons de livraison ──────────────────────────────────
alter table public.organization_year_counters
  add column if not exists delivery_notes_counter bigint not null default 0;

create table if not exists public.delivery_notes (
  id                 uuid primary key default gen_random_uuid(),
  organization_id    uuid not null references public.organizations(id) on delete cascade,
  quote_id           uuid references public.quotes(id) on delete set null,
  reference          text not null default '',
  delivery_date      date not null default current_date,
  -- delivered : livré sur chantier ; pickup : bon pour enlèvement (prêt à être récupéré)
  mode               text not null default 'delivered' check (mode in ('delivered', 'pickup')),
  quote_reference    text,
  order_reference    text,
  client_name        text not null,
  client_contact_name text,
  client_address     text,
  site_name          text,
  site_address       text,
  dossier_number     text,
  observations       text,
  signed_by_name     text,
  signature_data_url text,
  signed_at          timestamptz,
  pdf_url            text,
  sent_at            timestamptz,
  created_at         timestamptz not null default now(),
  created_by         uuid references auth.users(id) on delete set null,
  updated_at         timestamptz not null default now()
);

create unique index if not exists uq_delivery_notes_org_ref
  on public.delivery_notes (organization_id, reference) where reference <> '';
create index if not exists idx_delivery_notes_quote on public.delivery_notes (quote_id);
create index if not exists idx_delivery_notes_org_dossier on public.delivery_notes (organization_id, dossier_number);

create table if not exists public.delivery_note_lines (
  id                uuid primary key default gen_random_uuid(),
  delivery_note_id  uuid not null references public.delivery_notes(id) on delete cascade,
  organization_id   uuid not null references public.organizations(id) on delete cascade,
  -- Position de la ligne dans le devis au moment du BL (repère, pas un lien)
  quote_position    integer,
  position          integer not null default 0,
  description       text not null,
  format            jsonb,
  quantity          numeric(12, 2) not null check (quantity > 0),
  created_at        timestamptz not null default now()
);

create index if not exists idx_delivery_note_lines_note on public.delivery_note_lines (delivery_note_id, position);

-- Numéro BL-AAAA-NNNN attribué à la création (année de la livraison)
create or replace function public.set_delivery_note_reference()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  current_year int := extract(year from coalesce(new.delivery_date, current_date));
  new_counter  bigint;
begin
  if coalesce(new.reference, '') <> '' then
    return new;
  end if;
  insert into public.organization_year_counters (organization_id, year, delivery_notes_counter)
  values (new.organization_id, current_year, 1)
  on conflict (organization_id, year)
  do update set delivery_notes_counter = organization_year_counters.delivery_notes_counter + 1
  returning delivery_notes_counter into new_counter;
  new.reference := 'BL-' || current_year::text || '-' || lpad(new_counter::text, 4, '0');
  return new;
end;
$$;

drop trigger if exists delivery_notes_set_reference on public.delivery_notes;
create trigger delivery_notes_set_reference
  before insert on public.delivery_notes
  for each row execute function public.set_delivery_note_reference();

create or replace function public.delivery_notes_set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists delivery_notes_updated_at on public.delivery_notes;
create trigger delivery_notes_updated_at
  before update on public.delivery_notes
  for each row execute function public.delivery_notes_set_updated_at();

revoke execute on function public.set_delivery_note_reference() from public, anon, authenticated;
revoke execute on function public.delivery_notes_set_updated_at() from public, anon, authenticated;

-- ─── Règles d'accès : administrateurs de l'entreprise ──────
alter table public.delivery_notes enable row level security;
alter table public.delivery_note_lines enable row level security;

drop policy if exists delivery_notes_select_admin on public.delivery_notes;
drop policy if exists delivery_notes_insert_admin on public.delivery_notes;
drop policy if exists delivery_notes_update_admin on public.delivery_notes;
drop policy if exists delivery_notes_delete_admin on public.delivery_notes;
create policy delivery_notes_select_admin on public.delivery_notes for select to authenticated
  using (organization_id = public.current_user_organization_id() and public.current_user_is_org_admin());
create policy delivery_notes_insert_admin on public.delivery_notes for insert to authenticated
  with check (organization_id = public.current_user_organization_id() and public.current_user_is_org_admin());
create policy delivery_notes_update_admin on public.delivery_notes for update to authenticated
  using (organization_id = public.current_user_organization_id() and public.current_user_is_org_admin())
  with check (organization_id = public.current_user_organization_id() and public.current_user_is_org_admin());
create policy delivery_notes_delete_admin on public.delivery_notes for delete to authenticated
  using (organization_id = public.current_user_organization_id() and public.current_user_is_org_admin());

drop policy if exists delivery_note_lines_select_admin on public.delivery_note_lines;
drop policy if exists delivery_note_lines_insert_admin on public.delivery_note_lines;
drop policy if exists delivery_note_lines_update_admin on public.delivery_note_lines;
drop policy if exists delivery_note_lines_delete_admin on public.delivery_note_lines;
create policy delivery_note_lines_select_admin on public.delivery_note_lines for select to authenticated
  using (organization_id = public.current_user_organization_id() and public.current_user_is_org_admin());
create policy delivery_note_lines_insert_admin on public.delivery_note_lines for insert to authenticated
  with check (
    organization_id = public.current_user_organization_id() and public.current_user_is_org_admin()
    and exists (select 1 from public.delivery_notes d where d.id = delivery_note_lines.delivery_note_id and d.organization_id = public.current_user_organization_id())
  );
create policy delivery_note_lines_update_admin on public.delivery_note_lines for update to authenticated
  using (organization_id = public.current_user_organization_id() and public.current_user_is_org_admin())
  with check (organization_id = public.current_user_organization_id() and public.current_user_is_org_admin());
create policy delivery_note_lines_delete_admin on public.delivery_note_lines for delete to authenticated
  using (organization_id = public.current_user_organization_id() and public.current_user_is_org_admin());

-- Droits explicites (les nouvelles tables n'en ont plus par défaut)
revoke all on public.delivery_notes from public, anon, authenticated;
revoke all on public.delivery_note_lines from public, anon, authenticated;
grant select, insert, update, delete on public.delivery_notes to authenticated;
grant select, insert, update, delete on public.delivery_note_lines to authenticated;
grant all on public.delivery_notes to service_role;
grant all on public.delivery_note_lines to service_role;

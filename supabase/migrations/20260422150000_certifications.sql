-- ═══════════════════════════════════════════════════════════
-- BuildOps — Migration 011 : certifications des techniciens
-- ═══════════════════════════════════════════════════════════
-- Habilitations / certifications / formations de chaque tech,
-- avec date d'expiration pour alertes automatiques.

drop table if exists public.certifications cascade;

create table public.certifications (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete cascade,
  technician_id    uuid not null references public.technicians(id) on delete cascade,
  name             text not null,
  issuing_body     text,
  issued_at        date,
  expires_at       date,
  notes            text,
  created_at       timestamptz not null default now(),
  created_by       uuid references auth.users(id) on delete set null
);

create index idx_certifications_tech       on public.certifications (technician_id);
create index idx_certifications_org_expiry on public.certifications (organization_id, expires_at);

alter table public.certifications enable row level security;

create policy "cert_select_org"
  on public.certifications for select
  to authenticated
  using (organization_id = public.current_user_organization_id());

create policy "cert_insert_org"
  on public.certifications for insert
  to authenticated
  with check (organization_id = public.current_user_organization_id());

create policy "cert_update_org"
  on public.certifications for update
  to authenticated
  using (organization_id = public.current_user_organization_id())
  with check (organization_id = public.current_user_organization_id());

create policy "cert_delete_org"
  on public.certifications for delete
  to authenticated
  using (organization_id = public.current_user_organization_id());

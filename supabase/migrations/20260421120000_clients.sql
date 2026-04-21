-- ═══════════════════════════════════════════════════════════
-- BuildOps — Migration 004 : table clients + RLS multi-tenant
-- ═══════════════════════════════════════════════════════════
-- À coller dans Supabase SQL Editor puis cliquer Run.
-- Script idempotent : peut être rejoué sans erreur.


-- Cleanup safe
drop table if exists public.clients cascade;

-- Table clients
create table public.clients (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete cascade,
  name             text not null,
  contact_name     text,
  contact_email    text,
  contact_phone    text,
  address          text,
  notes            text,
  created_at       timestamptz not null default now(),
  created_by       uuid references auth.users(id) on delete set null
);

create index idx_clients_org_name on public.clients (organization_id, name);

-- RLS + policies
alter table public.clients enable row level security;

create policy "clients_select_org"
  on public.clients for select
  to authenticated
  using (organization_id = public.current_user_organization_id());

create policy "clients_insert_org"
  on public.clients for insert
  to authenticated
  with check (organization_id = public.current_user_organization_id());

create policy "clients_update_org"
  on public.clients for update
  to authenticated
  using (organization_id = public.current_user_organization_id())
  with check (organization_id = public.current_user_organization_id());

create policy "clients_delete_org"
  on public.clients for delete
  to authenticated
  using (organization_id = public.current_user_organization_id());

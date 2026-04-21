-- ═══════════════════════════════════════════════════════════
-- BuildOps — Migration 006 : table reports (rapports terrain)
-- ═══════════════════════════════════════════════════════════
-- Relation 1:1 avec intervention (contrainte unique).
-- RLS multi-tenant sur organization_id.
-- Script idempotent.


drop table if exists public.reports cascade;

create table public.reports (
  id                  uuid primary key default gen_random_uuid(),
  intervention_id     uuid unique not null references public.interventions(id) on delete cascade,
  organization_id     uuid not null references public.organizations(id) on delete cascade,
  checklist           jsonb not null default '[]'::jsonb,
  observations        text,
  signed_by_name      text,
  signature_data_url  text,
  photos              jsonb not null default '[]'::jsonb,
  pdf_url             text,
  completed_at        timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index idx_reports_intervention on public.reports (intervention_id);
create index idx_reports_org_completed on public.reports (organization_id, completed_at desc);

alter table public.reports enable row level security;

create policy "reports_select_org"
  on public.reports for select
  to authenticated
  using (organization_id = public.current_user_organization_id());

create policy "reports_insert_org"
  on public.reports for insert
  to authenticated
  with check (organization_id = public.current_user_organization_id());

create policy "reports_update_org"
  on public.reports for update
  to authenticated
  using (organization_id = public.current_user_organization_id())
  with check (organization_id = public.current_user_organization_id());

create policy "reports_delete_org"
  on public.reports for delete
  to authenticated
  using (organization_id = public.current_user_organization_id());

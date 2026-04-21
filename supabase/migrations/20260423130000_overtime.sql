-- ═══════════════════════════════════════════════════════════
-- BuildOps — Migration 013 : heures supplémentaires
-- ═══════════════════════════════════════════════════════════
-- Saisie des heures sup faites par les techniciens + workflow
-- de validation patron pour préparer la paie.

drop table if exists public.overtime_hours cascade;

create table public.overtime_hours (
  id                 uuid primary key default gen_random_uuid(),
  organization_id    uuid not null references public.organizations(id) on delete cascade,
  technician_id      uuid references public.technicians(id) on delete set null,
  technician_name    text not null,             -- snapshot
  worked_on          date not null,
  hours              numeric(4, 2) not null check (hours > 0 and hours <= 24),
  type               text not null check (type in ('standard', 'sunday_holiday', 'night')),
  description        text,
  status             text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  rejection_reason   text,
  reviewed_at        timestamptz,
  reviewed_by        uuid references auth.users(id) on delete set null,
  created_at         timestamptz not null default now(),
  created_by         uuid references auth.users(id) on delete set null
);

create index idx_overtime_org_date    on public.overtime_hours (organization_id, worked_on desc);
create index idx_overtime_tech        on public.overtime_hours (technician_id);
create index idx_overtime_org_status  on public.overtime_hours (organization_id, status);

alter table public.overtime_hours enable row level security;

create policy "overtime_select_org"
  on public.overtime_hours for select
  to authenticated
  using (organization_id = public.current_user_organization_id());

create policy "overtime_insert_org"
  on public.overtime_hours for insert
  to authenticated
  with check (organization_id = public.current_user_organization_id());

create policy "overtime_update_org"
  on public.overtime_hours for update
  to authenticated
  using (organization_id = public.current_user_organization_id())
  with check (organization_id = public.current_user_organization_id());

create policy "overtime_delete_org"
  on public.overtime_hours for delete
  to authenticated
  using (organization_id = public.current_user_organization_id());

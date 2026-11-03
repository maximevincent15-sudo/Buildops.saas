-- ═══════════════════════════════════════════════════════════
-- Checklists modifiables par l'entreprise
--
-- Chaque entreprise peut adapter les listes de points de contrôle :
--   - scope « visit » : la checklist de la visite, par type d'équipement
--     (kind = extincteurs, ria, desenfumage…) ;
--   - scope « unit » : la checklist d'un appareil, par famille (kind =
--     extincteurs, ria, desenfumage, detection…). Une famille peut avoir
--     plusieurs listes (ex. désenfumage naturel / mécanique).
-- builtin_key : la liste Firovia que la ligne remplace (null = liste créée
-- par l'entreprise). Sans ligne, les listes Firovia s'appliquent.
--
-- equipment_units.checklist_key / equipment_checks.checklist_key : la liste
-- choisie pour l'appareil (gardée d'une visite à l'autre) et celle utilisée
-- pour le contrôle. Idempotent.
-- ═══════════════════════════════════════════════════════════

create table if not exists public.checklist_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  scope text not null check (scope in ('visit', 'unit')),
  kind text not null,
  builtin_key text,
  name text not null,
  items jsonb not null default '[]'::jsonb,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_checklist_templates_org
  on public.checklist_templates (organization_id, scope, kind);
create unique index if not exists uq_checklist_templates_builtin
  on public.checklist_templates (organization_id, builtin_key) where builtin_key is not null;

alter table public.checklist_templates enable row level security;

drop policy if exists "checklist_templates_select_org" on public.checklist_templates;
create policy "checklist_templates_select_org"
  on public.checklist_templates for select
  to authenticated
  using (organization_id = public.current_user_organization_id());

drop policy if exists "checklist_templates_insert_admin" on public.checklist_templates;
create policy "checklist_templates_insert_admin"
  on public.checklist_templates for insert
  to authenticated
  with check (organization_id = public.current_user_organization_id() and public.current_user_is_org_admin());

drop policy if exists "checklist_templates_update_admin" on public.checklist_templates;
create policy "checklist_templates_update_admin"
  on public.checklist_templates for update
  to authenticated
  using (organization_id = public.current_user_organization_id() and public.current_user_is_org_admin())
  with check (organization_id = public.current_user_organization_id() and public.current_user_is_org_admin());

drop policy if exists "checklist_templates_delete_admin" on public.checklist_templates;
create policy "checklist_templates_delete_admin"
  on public.checklist_templates for delete
  to authenticated
  using (organization_id = public.current_user_organization_id() and public.current_user_is_org_admin());

revoke all on public.checklist_templates from public, anon, authenticated;
grant select, insert, update, delete on public.checklist_templates to authenticated;
grant all on public.checklist_templates to service_role;

alter table public.equipment_units add column if not exists checklist_key text;
alter table public.equipment_checks add column if not exists checklist_key text;

comment on column public.equipment_units.checklist_key is 'Liste de contrôle choisie pour l''appareil (clé Firovia ou id de checklist_templates)';
comment on column public.equipment_checks.checklist_key is 'Liste de contrôle utilisée pour ce contrôle';

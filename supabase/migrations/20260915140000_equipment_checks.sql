-- ═══════════════════════════════════════════════════════════
-- Firovia — Migration : equipment_checks (contrôles unitaires)
-- ═══════════════════════════════════════════════════════════
-- Un check = résultat du contrôle d'UNE unité d'équipement lors
-- d'UNE intervention (checklist item/item + observation + verdict
-- global + photos).
-- Contrainte : une seule check par (intervention, unité).


-- Cleanup safe (idempotent)
drop table if exists public.equipment_checks cascade;


create table public.equipment_checks (
  id                  uuid primary key default gen_random_uuid(),
  organization_id     uuid not null references public.organizations(id) on delete cascade,
  intervention_id     uuid not null references public.interventions(id) on delete cascade,
  equipment_unit_id   uuid not null references public.equipment_units(id) on delete cascade,
  family_template_id  uuid references public.family_templates(id) on delete set null,
  -- checklist : { "<itemId>": "ok" | "na" }
  checklist           jsonb not null default '{}'::jsonb,
  -- observation libre (souvent choisie parmi observation_types du template)
  observation         text,
  -- verdict global de l'unité pour ce contrôle
  verdict             text not null default 'non_verifie' check (verdict in (
    'non_verifie', 'conforme', 'surveiller', 'reformer'
  )),
  -- photos : [{ path, url }]
  photos              jsonb not null default '[]'::jsonb,
  technician_id       uuid references public.technicians(id) on delete set null,
  technician_name     text,
  checked_at          timestamptz not null default now(),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  created_by          uuid references auth.users(id) on delete set null,
  unique (intervention_id, equipment_unit_id)
);


create index idx_equipment_checks_intervention
  on public.equipment_checks (organization_id, intervention_id);

create index idx_equipment_checks_unit
  on public.equipment_checks (organization_id, equipment_unit_id);


alter table public.equipment_checks enable row level security;

create policy "equipment_checks_select_org"
  on public.equipment_checks for select
  to authenticated
  using (organization_id = public.current_user_organization_id());

create policy "equipment_checks_insert_org"
  on public.equipment_checks for insert
  to authenticated
  with check (organization_id = public.current_user_organization_id());

create policy "equipment_checks_update_org"
  on public.equipment_checks for update
  to authenticated
  using (organization_id = public.current_user_organization_id())
  with check (organization_id = public.current_user_organization_id());

create policy "equipment_checks_delete_org"
  on public.equipment_checks for delete
  to authenticated
  using (organization_id = public.current_user_organization_id());


create or replace function public.equipment_checks_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists equipment_checks_updated_at on public.equipment_checks;
create trigger equipment_checks_updated_at
  before update on public.equipment_checks
  for each row execute procedure public.equipment_checks_set_updated_at();


-- ═══════════════════════════════════════════════════════════
-- FIN — Migration equipment_checks
-- ═══════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════
-- BuildOps — Migration 002 : interventions + compteur par org
-- ═══════════════════════════════════════════════════════════
-- À coller dans Supabase SQL Editor puis cliquer Run.
-- Crée la table des interventions avec RLS multi-tenant et
-- un compteur de référence auto (INT-0001, INT-0002...) par org.
-- Script idempotent : peut être rejoué sans erreur.


-- 0. CLEANUP ────────────────────────────────────────────────
-- Attention : `drop trigger if exists X on table` nécessite que la
-- table existe, même si le trigger n'existe pas. On drop la table
-- en CASCADE d'abord, ce qui supprime ses triggers automatiquement.
drop table if exists public.interventions cascade;
drop function if exists public.set_intervention_reference() cascade;
alter table public.organizations drop column if exists interventions_counter;


-- 1. COMPTEUR PAR ORGANIZATION ─────────────────────────────

alter table public.organizations
  add column interventions_counter bigint not null default 0;


-- 2. TABLE INTERVENTIONS ───────────────────────────────────

create table public.interventions (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete cascade,
  reference        text not null,
  client_name      text not null,
  site_name        text,
  equipment_type   text not null
    check (equipment_type in ('extincteurs', 'ria', 'desenfumage', 'ssi', 'extinction_auto')),
  technician_name  text,
  scheduled_date   date,
  priority         text not null default 'normale'
    check (priority in ('normale', 'urgente', 'reglementaire')),
  status           text not null default 'a_planifier'
    check (status in ('a_planifier', 'planifiee', 'en_cours', 'terminee', 'brouillon')),
  notes            text,
  created_at       timestamptz not null default now(),
  created_by       uuid references auth.users(id) on delete set null
);

-- Index pour listing rapide par org + date
create index idx_interventions_org_created
  on public.interventions (organization_id, created_at desc);


-- 3. TRIGGER : génère la référence auto (INT-0001 par org) ─

create or replace function public.set_intervention_reference()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  new_counter bigint;
begin
  -- Incrémente le compteur de l'org atomiquement et récupère la valeur
  update public.organizations
     set interventions_counter = interventions_counter + 1
   where id = new.organization_id
  returning interventions_counter into new_counter;

  new.reference := 'INT-' || lpad(new_counter::text, 4, '0');
  return new;
end;
$$;

create trigger interventions_set_reference
  before insert on public.interventions
  for each row execute procedure public.set_intervention_reference();


-- 4. RLS ────────────────────────────────────────────────────

alter table public.interventions enable row level security;

-- Lecture : on voit uniquement les interventions de son org
create policy "interv_select_org"
  on public.interventions for select
  to authenticated
  using (organization_id = public.current_user_organization_id());

-- Création : organization_id doit matcher l'org de l'utilisateur
create policy "interv_insert_org"
  on public.interventions for insert
  to authenticated
  with check (organization_id = public.current_user_organization_id());

-- Modification : on ne peut modifier que les interventions de son org
create policy "interv_update_org"
  on public.interventions for update
  to authenticated
  using (organization_id = public.current_user_organization_id())
  with check (organization_id = public.current_user_organization_id());

-- Suppression : on ne peut supprimer que les interventions de son org
create policy "interv_delete_org"
  on public.interventions for delete
  to authenticated
  using (organization_id = public.current_user_organization_id());

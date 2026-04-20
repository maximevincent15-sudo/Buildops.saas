-- ═══════════════════════════════════════════════════════════
-- BuildOps — Migration 001 : organizations + profiles + RLS
-- ═══════════════════════════════════════════════════════════
-- À coller tel quel dans Supabase SQL Editor puis cliquer Run.
-- Pose les fondations multi-tenant : chaque utilisateur appartient
-- à une organization, et ne voit QUE les données de son org.


-- 1. TABLES ─────────────────────────────────────────────────

-- Une organization = une entreprise cliente de BuildOps (ex: "Sécurité Pro IDF")
create table public.organizations (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  created_at timestamptz not null default now()
);

-- Un profile = un utilisateur, lié à son organization.
-- La clé primaire est l'id de auth.users (géré par Supabase Auth).
create table public.profiles (
  id              uuid primary key references auth.users(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  first_name      text not null default '',
  last_name       text not null default '',
  created_at      timestamptz not null default now()
);


-- 2. HELPER : récupère l'org de l'utilisateur connecté ──────
-- security definer = bypass RLS pour éviter une récursion infinie
-- quand on l'utilise dans les policies de profiles.

create or replace function public.current_user_organization_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select organization_id from public.profiles where id = auth.uid()
$$;


-- 3. ROW LEVEL SECURITY ─────────────────────────────────────
-- RLS activée sur les 2 tables : par défaut personne ne voit rien,
-- sauf ce que les policies autorisent explicitement.

alter table public.organizations enable row level security;
alter table public.profiles      enable row level security;


-- 4. POLICIES ───────────────────────────────────────────────

-- Lecture : un user voit son organization
create policy "orgs_select_own"
  on public.organizations for select
  to authenticated
  using (id = public.current_user_organization_id());

-- Modification : un user peut modifier son organization
create policy "orgs_update_own"
  on public.organizations for update
  to authenticated
  using (id = public.current_user_organization_id());

-- Lecture : un user voit les profiles de son organization (y compris le sien)
create policy "profiles_select_same_org"
  on public.profiles for select
  to authenticated
  using (organization_id = public.current_user_organization_id());

-- Modification : un user ne peut modifier QUE son propre profile
create policy "profiles_update_own"
  on public.profiles for update
  to authenticated
  using (id = auth.uid());


-- 5. TRIGGER SIGNUP : auto-crée org + profile à l'inscription
-- Quand Supabase Auth crée un nouvel utilisateur dans auth.users,
-- ce trigger lit les métadonnées (first_name/last_name/company_name)
-- passées au signup et crée automatiquement l'organization et le profile.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  new_org_id uuid;
begin
  insert into public.organizations (name)
  values (coalesce(new.raw_user_meta_data->>'company_name', 'Mon entreprise'))
  returning id into new_org_id;

  insert into public.profiles (id, organization_id, first_name, last_name)
  values (
    new.id,
    new_org_id,
    coalesce(new.raw_user_meta_data->>'first_name', ''),
    coalesce(new.raw_user_meta_data->>'last_name',  '')
  );

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ════════════════════════════════════════════════════════════════════
-- Ajoute le SIRET aux organizations pour empêcher les abus d'essai gratuit.
-- Un SIRET = une seule inscription à vie. Permet aussi l'auto-remplissage
-- du nom d'entreprise depuis l'API Annuaire des Entreprises (recherche-entreprises.api.gouv.fr).
-- ════════════════════════════════════════════════════════════════════

-- 1. Colonne siret sur organizations
alter table public.organizations add column if not exists siret text;
comment on column public.organizations.siret is 'SIRET 14 chiffres validé via API recherche-entreprises.api.gouv.fr — unique par organization';

-- 2. Contrainte d'unicité (NULL autorisés multiples, mais une seule org par SIRET non-null)
create unique index if not exists organizations_siret_unique
  on public.organizations(siret)
  where siret is not null;

-- 3. Fonction RPC pour vérifier la disponibilité d'un SIRET avant signup.
-- Callable par anon, mais ne retourne qu'un booléen (ne leak rien).
create or replace function public.check_siret_available(p_siret text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select not exists(
    select 1 from public.organizations where siret = p_siret
  );
$$;

grant execute on function public.check_siret_available(text) to anon, authenticated;
comment on function public.check_siret_available(text) is 'Retourne true si le SIRET est libre (aucune org ne l''utilise déjà). Utilisé côté front avant signup.';

-- 4. Mise à jour de handle_new_user() pour récupérer le siret depuis les métadonnées.
-- Si le SIRET passé est déjà utilisé, la contrainte unique sur organizations.siret
-- fera échouer le trigger, ce qui annulera l'inscription côté Auth (rollback).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  new_org_id uuid;
begin
  insert into public.organizations (name, siret)
  values (
    coalesce(new.raw_user_meta_data->>'company_name', 'Mon entreprise'),
    nullif(new.raw_user_meta_data->>'siret', '')
  )
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

-- ============================================================================
-- Firovia — Relier un compte de connexion à sa fiche technicien
-- ============================================================================
-- Jusqu'ici, rien ne reliait l'utilisateur connecté (auth.users) à la fiche
-- technicien du planning (technicians) : un technicien voyait le planning de
-- toute l'équipe, sans vue « Ma journée ». On ajoute technicians.user_id :
--   - liaison automatique à la connexion quand l'email du compte est celui
--     de la fiche (link_my_technician) ;
--   - liaison manuelle par un administrateur (set_technician_user) ;
--   - liste des comptes de l'organisation avec leur email
--     (list_org_member_accounts), pour choisir le compte à relier.
-- Colonne ajoutée à une table existante + fonctions : GRANT EXECUTE explicite.
-- ============================================================================

alter table public.technicians
  add column if not exists user_id uuid references auth.users(id) on delete set null;

create unique index if not exists technicians_user_id_unique
  on public.technicians (user_id) where user_id is not null;

comment on column public.technicians.user_id is 'Compte de connexion du technicien (vue « Ma journée », notifications)';

-- ─── Liaison automatique par email ─────────────────────────────────────────
create or replace function public.link_my_technician()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  uid  uuid := auth.uid();
  org  uuid;
  mail text;
  tid  uuid;
begin
  if uid is null then
    return null;
  end if;

  select id into tid from public.technicians where user_id = uid limit 1;
  if tid is not null then
    return tid;
  end if;

  select organization_id into org from public.profiles where id = uid;
  select email into mail from auth.users where id = uid;
  if org is null or mail is null then
    return null;
  end if;

  select id into tid
    from public.technicians
   where organization_id = org
     and user_id is null
     and active
     and lower(trim(email)) = lower(trim(mail))
   order by created_at
   limit 1;
  if tid is null then
    return null;
  end if;

  update public.technicians set user_id = uid where id = tid;
  return tid;
end;
$$;

revoke all on function public.link_my_technician() from public, anon;
grant execute on function public.link_my_technician() to authenticated;

-- ─── Comptes de l'organisation (avec email) ────────────────────────────────
create or replace function public.list_org_member_accounts()
returns table (id uuid, first_name text, last_name text, email text, user_role text)
language sql
security definer
set search_path = public
stable
as $$
  select p.id, p.first_name, p.last_name, u.email::text, coalesce(p.user_role, 'admin')
    from public.profiles p
    join auth.users u on u.id = p.id
   where p.organization_id = public.current_user_organization_id()
   order by p.last_name nulls last, p.first_name;
$$;

revoke all on function public.list_org_member_accounts() from public, anon;
grant execute on function public.list_org_member_accounts() to authenticated;

-- ─── Liaison manuelle (administrateur) ─────────────────────────────────────
create or replace function public.set_technician_user(p_technician uuid, p_user uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_org  uuid;
  caller_role text;
begin
  select organization_id, user_role into caller_org, caller_role
    from public.profiles where id = auth.uid();
  if caller_org is null then
    return jsonb_build_object('error', 'not_authenticated');
  end if;
  if coalesce(caller_role, 'admin') <> 'admin' then
    return jsonb_build_object('error', 'not_admin');
  end if;
  if not exists (select 1 from public.technicians where id = p_technician and organization_id = caller_org) then
    return jsonb_build_object('error', 'technician_not_found');
  end if;
  if p_user is not null and not exists (select 1 from public.profiles where id = p_user and organization_id = caller_org) then
    return jsonb_build_object('error', 'user_not_in_org');
  end if;

  -- Un compte = une fiche : on libère l'éventuelle ancienne liaison
  if p_user is not null then
    update public.technicians set user_id = null
     where user_id = p_user and id <> p_technician;
  end if;
  update public.technicians set user_id = p_user where id = p_technician;
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.set_technician_user(uuid, uuid) from public, anon;
grant execute on function public.set_technician_user(uuid, uuid) to authenticated;

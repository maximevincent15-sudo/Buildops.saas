-- Firovia — Migration 023 : Fonction RPC pour retirer un membre de l'équipe
--
-- Problème : un admin ne peut pas modifier directement organization_id = NULL
-- sur le profile d'un autre membre car les politiques RLS de profiles ont une
-- clause WITH CHECK qui empêche la modification vers un état "hors organisation".
--
-- Solution : RPC SECURITY DEFINER avec checks de sécurité explicites :
--   - L'appelant doit être admin
--   - Le membre doit être dans la même organisation
--   - On ne peut pas se retirer soi-même
--   - On ne peut pas retirer le dernier admin (évite verrouillage org)
--
-- Comportement : soft remove
--   - Le compte auth.users reste intact (ré-invitation possible)
--   - Toutes les données passées (interventions, rapports, etc.) restent dans
--     l'organisation car elles référencent organization_id, pas profile.id

create or replace function public.remove_member_from_organization(member_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_id        uuid := auth.uid();
  caller_org_id    uuid;
  caller_role      text;
  member_org_id    uuid;
  member_role      text;
  admin_count      int;
begin
  if caller_id is null then
    return jsonb_build_object('error', 'not_authenticated');
  end if;

  -- Récupère l'org et le rôle de l'appelant
  select organization_id, user_role
    into caller_org_id, caller_role
    from public.profiles
   where id = caller_id;

  if caller_org_id is null then
    return jsonb_build_object('error', 'caller_no_org');
  end if;

  -- L'appelant doit être admin
  if caller_role <> 'admin' then
    return jsonb_build_object('error', 'not_admin');
  end if;

  -- Pas de retrait de soi-même
  if member_id = caller_id then
    return jsonb_build_object('error', 'cannot_remove_self');
  end if;

  -- Récupère l'org et le rôle du membre à retirer
  select organization_id, user_role
    into member_org_id, member_role
    from public.profiles
   where id = member_id;

  if member_org_id is null then
    return jsonb_build_object('error', 'member_not_found');
  end if;

  -- Le membre doit être dans la même org que l'appelant
  if member_org_id <> caller_org_id then
    return jsonb_build_object('error', 'not_same_org');
  end if;

  -- Si le membre est admin, vérifier qu'il ne reste pas le dernier admin
  if member_role = 'admin' then
    select count(*)::int into admin_count
      from public.profiles
     where organization_id = caller_org_id
       and user_role = 'admin';

    if admin_count <= 1 then
      return jsonb_build_object('error', 'last_admin');
    end if;
  end if;

  -- Soft remove : détacher le profile de l'organisation
  update public.profiles
     set organization_id = null
   where id = member_id;

  return jsonb_build_object('success', true);
end;
$$;

grant execute on function public.remove_member_from_organization(uuid) to authenticated;

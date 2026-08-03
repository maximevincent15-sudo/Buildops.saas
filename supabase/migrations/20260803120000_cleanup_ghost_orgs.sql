-- ═══════════════════════════════════════════════════════════
-- Firovia — Cleanup orgs fantômes créées par les invitations
-- ═══════════════════════════════════════════════════════════
-- Contexte (identifié le 22/07/2026) :
--
-- Quand un technicien s'inscrit via un lien d'invitation :
--   1. Le trigger handle_new_user() crée son org "personnelle"
--      (nom = "(rejoint via invitation)")
--   2. Le trigger handle_new_organization_subscription() crée
--      une ligne subscriptions status='trialing' pour cette org
--   3. La RPC accept_organization_invitation() déplace le
--      profile vers la VRAIE org (celle de l'inviteur)
--   4. → L'org fantôme + son abo restent en base, sans user
--
-- Fix :
--   - Étape 1 : accept_organization_invitation() supprime maintenant
--     l'org fantôme après avoir déplacé le profile
--   - Étape 2 : cleanup rétroactif des orgs orphelines existantes


-- ─────────────────────────────────────────────────────────────
-- 1. Modifie accept_organization_invitation pour supprimer l'org
-- ─────────────────────────────────────────────────────────────

create or replace function public.accept_organization_invitation(invite_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  inv   public.organization_invitations;
  user_id uuid := auth.uid();
  user_email text;
  old_org_id uuid;
begin
  if user_id is null then
    return jsonb_build_object('error', 'not_authenticated');
  end if;

  -- Récupère l'invitation valide (non expirée, non acceptée, non annulée)
  select * into inv from public.organization_invitations
   where token = invite_token
     and accepted_at is null
     and cancelled_at is null
     and expires_at > now()
   limit 1;

  if inv.id is null then
    return jsonb_build_object('error', 'invalid_or_expired');
  end if;

  -- Vérifie que l'email du user courant matche celui de l'invitation
  select email into user_email from auth.users where id = user_id;
  if lower(user_email) <> lower(inv.email) then
    return jsonb_build_object('error', 'email_mismatch', 'expected', inv.email);
  end if;

  -- Récupère l'ancienne org (celle créée par handle_new_user au signup)
  select organization_id into old_org_id
    from public.profiles where id = user_id;

  -- Bascule le profile courant sur l'orga d'invitation + rôle invité
  update public.profiles
     set organization_id = inv.organization_id,
         user_role       = inv.role
   where id = user_id;

  -- Marque l'invitation comme acceptée
  update public.organization_invitations
     set accepted_at = now()
   where id = inv.id;

  -- ✨ NOUVEAU : supprime l'org fantôme si elle est vide et différente
  -- de la nouvelle. CASCADE supprime aussi sa subscription trial.
  -- On vérifie l'absence de profile résiduel par sécurité.
  if old_org_id is not null and old_org_id <> inv.organization_id then
    if not exists (
      select 1 from public.profiles where organization_id = old_org_id
    ) then
      delete from public.organizations where id = old_org_id;
    end if;
  end if;

  return jsonb_build_object(
    'success', true,
    'organization_id', inv.organization_id,
    'role', inv.role
  );
end;
$$;


-- ─────────────────────────────────────────────────────────────
-- 2. Cleanup rétroactif : supprime toutes les orgs sans profile
-- ─────────────────────────────────────────────────────────────
-- Sécurité : ne supprime QUE les orgs qui n'ont AUCUN profile actif
-- ET qui portent le nom "(rejoint via invitation)" (empreinte du bug).
-- Les autres orgs vides (créées volontairement pour test) restent.
-- Le CASCADE se charge des subscriptions liées.

delete from public.organizations o
where o.name = '(rejoint via invitation)'
  and not exists (
    select 1 from public.profiles p where p.organization_id = o.id
  );

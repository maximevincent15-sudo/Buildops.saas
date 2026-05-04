-- ═══════════════════════════════════════════════════════════
-- BuildOps — Migration 021 : multi-utilisateurs (équipe)
-- ═══════════════════════════════════════════════════════════
-- - Ajoute un rôle (admin / member) sur les profiles
-- - Table organization_invitations : invitations en attente avec token unique
-- - RPC accept_invitation() : attache le profile courant à l'organisation
--   de l'invitation (au lieu de la nouvelle org créée à l'inscription)

-- 1. Rôle utilisateur (tous les comptes existants deviennent admin)
alter table public.profiles
  add column if not exists user_role text not null default 'admin'
    check (user_role in ('admin', 'member'));

-- 2. Table des invitations
drop table if exists public.organization_invitations cascade;
create table public.organization_invitations (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  email           text not null,
  role            text not null default 'member' check (role in ('admin', 'member')),
  token           text not null unique,
  invited_by      uuid references auth.users(id) on delete set null,
  expires_at      timestamptz not null default (now() + interval '14 days'),
  accepted_at     timestamptz,
  cancelled_at    timestamptz,
  created_at      timestamptz not null default now()
);

create index idx_invitations_org on public.organization_invitations (organization_id);
create index idx_invitations_email on public.organization_invitations (lower(email));
create unique index idx_invitations_org_email_pending
  on public.organization_invitations (organization_id, lower(email))
  where accepted_at is null and cancelled_at is null;

alter table public.organization_invitations enable row level security;

create policy "invitations_select_org"
  on public.organization_invitations for select
  to authenticated
  using (organization_id = public.current_user_organization_id());

create policy "invitations_insert_org"
  on public.organization_invitations for insert
  to authenticated
  with check (organization_id = public.current_user_organization_id());

create policy "invitations_update_org"
  on public.organization_invitations for update
  to authenticated
  using (organization_id = public.current_user_organization_id())
  with check (organization_id = public.current_user_organization_id());

create policy "invitations_delete_org"
  on public.organization_invitations for delete
  to authenticated
  using (organization_id = public.current_user_organization_id());

-- Policy spéciale : permet à un user authentifié de LIRE une invitation par
-- son token (utile pour afficher "Vous rejoignez l'équipe XYZ" avant signup).
create policy "invitations_select_by_token"
  on public.organization_invitations for select
  to authenticated
  using (true); -- Le filtre par token se fait côté requête. Lecture-only.

-- 3. RPC pour accepter une invitation depuis le user courant
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

  -- Bascule le profile courant sur l'orga + applique le rôle invité.
  -- Note : l'orga "personnelle" créée au signup devient orpheline (pas de delete
  -- automatique pour ne pas casser les FK ; à nettoyer manuellement si besoin).
  update public.profiles
     set organization_id = inv.organization_id,
         user_role       = inv.role
   where id = user_id;

  -- Marque l'invitation comme acceptée
  update public.organization_invitations
     set accepted_at = now()
   where id = inv.id;

  return jsonb_build_object(
    'success', true,
    'organization_id', inv.organization_id,
    'role', inv.role
  );
end;
$$;

grant execute on function public.accept_organization_invitation(text) to authenticated;

-- 4. RPC pour récupérer une invitation par token (pré-affichage avant signup)
create or replace function public.get_invitation_preview(invite_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  inv  public.organization_invitations;
  org  public.organizations;
begin
  select * into inv from public.organization_invitations
   where token = invite_token
     and accepted_at is null
     and cancelled_at is null
     and expires_at > now()
   limit 1;

  if inv.id is null then
    return jsonb_build_object('error', 'invalid_or_expired');
  end if;

  select * into org from public.organizations where id = inv.organization_id;

  return jsonb_build_object(
    'success', true,
    'organization_name', org.name,
    'role', inv.role,
    'email', inv.email,
    'expires_at', inv.expires_at
  );
end;
$$;

grant execute on function public.get_invitation_preview(text) to anon, authenticated;

-- ═══════════════════════════════════════════════════════════
-- Cloisonnement entre entreprises (audit du 30/10/2026)
--
-- 1. profiles : un utilisateur pouvait modifier dans sa propre fiche
--    son organization_id (et donc se rattacher à une autre entreprise
--    dont il connaît l'identifiant, visible dans les adresses des PDF)
--    et son user_role. Il ne peut plus modifier que son prénom et son
--    nom. Le rôle d'un membre se change par set_member_role (admin).
-- 2. organizations : l'administrateur ne modifie plus que les réglages
--    affichés dans Paramètres (plus le SIRET ni le compteur).
-- 3. Stockage report-photos (photos, PDF des rapports, devis, factures)
--    et expense-receipts (justificatifs) : chaque entreprise ne lit,
--    n'écrit et ne supprime que dans son dossier « <organization_id>/ ».
--    La lecture par l'adresse publique (mails, portail client) ne change
--    pas, mais le listage public de report-photos est fermé. Les PDF de
--    devis et de factures restent réservés aux administrateurs.
-- 4. Fonctions SECURITY DEFINER : le droit d'exécution PUBLIC (hérité par
--    anon) restait en place malgré le durcissement de septembre. Chaque
--    fonction ne reste appelable que par les rôles qui en ont besoin.
-- ═══════════════════════════════════════════════════════════

-- ─── 1. profiles ─────────────────────────────────────────────

revoke update on public.profiles from public, anon, authenticated;
grant update (first_name, last_name) on public.profiles to authenticated;

create or replace function public.set_member_role(p_member uuid, p_role text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_org  uuid;
  caller_role text;
  member_org  uuid;
  member_role text;
  other_admins int;
begin
  select organization_id, user_role into caller_org, caller_role
    from public.profiles where id = auth.uid();
  if caller_org is null then
    return jsonb_build_object('error', 'not_authenticated');
  end if;
  if coalesce(caller_role, 'admin') <> 'admin' then
    return jsonb_build_object('error', 'not_admin');
  end if;
  if p_role not in ('admin', 'member') then
    return jsonb_build_object('error', 'bad_role');
  end if;
  if p_member = auth.uid() then
    return jsonb_build_object('error', 'cannot_change_self');
  end if;

  select organization_id, user_role into member_org, member_role
    from public.profiles where id = p_member;
  if member_org is null or member_org <> caller_org then
    return jsonb_build_object('error', 'not_same_org');
  end if;

  if coalesce(member_role, 'admin') = 'admin' and p_role <> 'admin' then
    select count(*)::int into other_admins
      from public.profiles
     where organization_id = caller_org
       and id <> p_member
       and coalesce(user_role, 'admin') = 'admin';
    if other_admins < 1 then
      return jsonb_build_object('error', 'last_admin');
    end if;
  end if;

  update public.profiles set user_role = p_role where id = p_member;
  return jsonb_build_object('ok', true);
end;
$$;

-- ─── 2. organizations ────────────────────────────────────────

revoke update on public.organizations from public, anon, authenticated;
grant update (name, disabled_modules, notify_technicians, notify_admins_reports, auto_send_reports)
  on public.organizations to authenticated;

-- ─── 3. Stockage ─────────────────────────────────────────────

drop policy if exists "report_photos_select" on storage.objects;
drop policy if exists "report_photos_insert" on storage.objects;
drop policy if exists "report_photos_update" on storage.objects;
drop policy if exists "report_photos_delete" on storage.objects;
drop policy if exists "report_photos_select_own" on storage.objects;
drop policy if exists "report_photos_insert_own" on storage.objects;
drop policy if exists "report_photos_update_own" on storage.objects;
drop policy if exists "report_photos_delete_own" on storage.objects;

-- Lister / lire ses propres fichiers (la lecture publique passe par l'URL publique)
create policy "report_photos_select_own"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'report-photos'
    and (storage.foldername(name))[1] = public.current_user_organization_id()::text
  );

-- Écrire dans son dossier ; les PDF de devis et de factures : administrateurs seulement
create policy "report_photos_insert_own"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'report-photos'
    and (storage.foldername(name))[1] = public.current_user_organization_id()::text
    and (coalesce((storage.foldername(name))[2], '') not in ('quotes', 'invoices')
         or public.current_user_is_org_admin())
  );

create policy "report_photos_update_own"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'report-photos'
    and (storage.foldername(name))[1] = public.current_user_organization_id()::text
    and (coalesce((storage.foldername(name))[2], '') not in ('quotes', 'invoices')
         or public.current_user_is_org_admin())
  )
  with check (
    bucket_id = 'report-photos'
    and (storage.foldername(name))[1] = public.current_user_organization_id()::text
    and (coalesce((storage.foldername(name))[2], '') not in ('quotes', 'invoices')
         or public.current_user_is_org_admin())
  );

create policy "report_photos_delete_own"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'report-photos'
    and (storage.foldername(name))[1] = public.current_user_organization_id()::text
    and (coalesce((storage.foldername(name))[2], '') not in ('quotes', 'invoices')
         or public.current_user_is_org_admin())
  );

drop policy if exists "expense_receipts_insert" on storage.objects;
drop policy if exists "expense_receipts_update" on storage.objects;
drop policy if exists "expense_receipts_delete" on storage.objects;
drop policy if exists "expense_receipts_select_own" on storage.objects;
drop policy if exists "expense_receipts_insert_own" on storage.objects;
drop policy if exists "expense_receipts_update_own" on storage.objects;
drop policy if exists "expense_receipts_delete_own" on storage.objects;

create policy "expense_receipts_select_own"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'expense-receipts'
    and (storage.foldername(name))[1] = public.current_user_organization_id()::text
  );

create policy "expense_receipts_insert_own"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'expense-receipts'
    and (storage.foldername(name))[1] = public.current_user_organization_id()::text
  );

create policy "expense_receipts_update_own"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'expense-receipts'
    and (storage.foldername(name))[1] = public.current_user_organization_id()::text
  )
  with check (
    bucket_id = 'expense-receipts'
    and (storage.foldername(name))[1] = public.current_user_organization_id()::text
  );

create policy "expense_receipts_delete_own"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'expense-receipts'
    and (storage.foldername(name))[1] = public.current_user_organization_id()::text
  );

-- ─── 4. Droits d'exécution des fonctions SECURITY DEFINER ────

-- Tout fermer, puis rouvrir rôle par rôle. service_role (fonctions serveur,
-- cron) garde tout.
do $$
declare
  f regprocedure;
begin
  for f in
    select p.oid::regprocedure
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.prosecdef
       and p.prokind = 'f'
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;

-- Pages publiques : inscription, invitation, portail client, registre public
grant execute on function public.check_siret_available(text) to anon, authenticated;
grant execute on function public.get_invitation_preview(text) to anon, authenticated;
grant execute on function public.accept_organization_invitation(text) to anon, authenticated;
grant execute on function public.client_portal_validate(text) to anon, authenticated;
grant execute on function public.client_portal_reports(text) to anon, authenticated;
grant execute on function public.client_portal_invoices(text) to anon, authenticated;
grant execute on function public.client_portal_contracts(text) to anon, authenticated;
grant execute on function public.client_portal_upcoming(text) to anon, authenticated;
do $$
declare
  f regprocedure;
begin
  for f in
    select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname in ('client_portal_request_intervention', 'get_public_registry')
  loop
    execute format('grant execute on function %s to anon, authenticated', f);
  end loop;
end $$;

-- Utilisateurs connectés (règles d'accès et fonctions de l'app)
grant execute on function public.current_user_organization_id() to authenticated;
grant execute on function public.current_user_is_org_admin() to authenticated;
grant execute on function public.admin_list_prospects() to authenticated;
grant execute on function public.link_my_technician() to authenticated;
grant execute on function public.list_org_member_accounts() to authenticated;
grant execute on function public.remove_member_from_organization(uuid) to authenticated;
grant execute on function public.set_next_document_number(text, integer) to authenticated;
grant execute on function public.set_technician_user(uuid, uuid) to authenticated;
grant execute on function public.set_member_role(uuid, text) to authenticated;

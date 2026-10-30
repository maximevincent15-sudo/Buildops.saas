-- ═══════════════════════════════════════════════════════════
-- Logo de l'entreprise (Paramètres)
--
-- Un espace de stockage dédié, en lecture publique (le logo est
-- imprimé sur les devis, factures, rapports et contrats envoyés aux
-- clients). Chaque entreprise écrit uniquement dans son dossier
-- « <organization_id>/ », et seuls ses administrateurs peuvent
-- ajouter, remplacer ou supprimer le logo.
-- L'adresse du logo est rangée dans organization_invoicing_settings.logo_url.
-- ═══════════════════════════════════════════════════════════

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('org-logos', 'org-logos', true, 1048576, array['image/png', 'image/jpeg'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "org_logos_select_own" on storage.objects;
drop policy if exists "org_logos_insert_admin" on storage.objects;
drop policy if exists "org_logos_update_admin" on storage.objects;
drop policy if exists "org_logos_delete_admin" on storage.objects;

-- Lister / lire ses propres fichiers (la lecture publique passe par l'URL publique)
create policy "org_logos_select_own"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'org-logos'
    and (storage.foldername(name))[1] = public.current_user_organization_id()::text
  );

create policy "org_logos_insert_admin"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'org-logos'
    and (storage.foldername(name))[1] = public.current_user_organization_id()::text
    and public.current_user_is_org_admin()
  );

create policy "org_logos_update_admin"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'org-logos'
    and (storage.foldername(name))[1] = public.current_user_organization_id()::text
    and public.current_user_is_org_admin()
  )
  with check (
    bucket_id = 'org-logos'
    and (storage.foldername(name))[1] = public.current_user_organization_id()::text
    and public.current_user_is_org_admin()
  );

create policy "org_logos_delete_admin"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'org-logos'
    and (storage.foldername(name))[1] = public.current_user_organization_id()::text
    and public.current_user_is_org_admin()
  );

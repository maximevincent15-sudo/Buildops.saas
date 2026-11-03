-- ═══════════════════════════════════════════════════════════
-- Documents en accès privé
--
-- 1. Bucket « documents », privé : PDF des rapports, devis et factures,
--    documents des dossiers, archives importées. Plus de lien public : la
--    lecture passe par un lien temporaire signé, donné à un membre connecté
--    de l'entreprise (ou par le portail client, côté serveur).
--    Rangement : <organisation>/<dossier>/… ; « quotes », « invoices »,
--    « dossiers » et « legacy » sont réservés aux administrateurs, les
--    rapports (« interventions ») sont lisibles par toute l'équipe.
-- 2. Les justificatifs de dépenses passent en privé dans la migration
--    suivante (20261103235500), à lancer après la mise en ligne du code qui
--    lit les fichiers par lien temporaire.
--
-- Les photos (bucket « report-photos ») restent en lien secret pour
-- l'instant. Les anciens documents de « report-photos » sont copiés dans
-- « documents » par scripts/migrate-private-documents.mjs. Idempotent.
-- ═══════════════════════════════════════════════════════════

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'documents',
  'documents',
  false,
  10485760,
  array[
    'application/pdf',
    'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]
)
on conflict (id) do update set
  public             = excluded.public,
  file_size_limit    = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "documents_select_own" on storage.objects;
create policy "documents_select_own"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] = public.current_user_organization_id()::text
    and (coalesce((storage.foldername(name))[2], '') not in ('quotes', 'invoices', 'dossiers', 'legacy')
         or public.current_user_is_org_admin())
  );

drop policy if exists "documents_insert_own" on storage.objects;
create policy "documents_insert_own"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] = public.current_user_organization_id()::text
    and (coalesce((storage.foldername(name))[2], '') not in ('quotes', 'invoices', 'dossiers', 'legacy')
         or public.current_user_is_org_admin())
  );

drop policy if exists "documents_update_own" on storage.objects;
create policy "documents_update_own"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] = public.current_user_organization_id()::text
    and (coalesce((storage.foldername(name))[2], '') not in ('quotes', 'invoices', 'dossiers', 'legacy')
         or public.current_user_is_org_admin())
  )
  with check (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] = public.current_user_organization_id()::text
    and (coalesce((storage.foldername(name))[2], '') not in ('quotes', 'invoices', 'dossiers', 'legacy')
         or public.current_user_is_org_admin())
  );

drop policy if exists "documents_delete_own" on storage.objects;
create policy "documents_delete_own"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] = public.current_user_organization_id()::text
    and (coalesce((storage.foldername(name))[2], '') not in ('quotes', 'invoices', 'dossiers', 'legacy')
         or public.current_user_is_org_admin())
  );

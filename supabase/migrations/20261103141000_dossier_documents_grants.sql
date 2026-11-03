-- ═══════════════════════════════════════════════════════════
-- Documents des dossiers : mêmes protections que les devis et factures
--
-- 1. dossier_documents a hérité des droits par défaut (TRUNCATE,
--    REFERENCES, TRIGGER) pour « authenticated » : on ne garde que lecture,
--    ajout, modification et suppression, filtrées par les règles RLS.
-- 2. Stockage : les fichiers « <organisation>/dossiers/… » ne s'écrivent et
--    ne se suppriment que par un administrateur, comme les PDF de devis et
--    de factures. Idempotent.
-- ═══════════════════════════════════════════════════════════

revoke all on public.dossier_documents from public, anon, authenticated;
grant select, insert, update, delete on public.dossier_documents to authenticated;
grant all on public.dossier_documents to service_role;

drop policy if exists "report_photos_insert_own" on storage.objects;
create policy "report_photos_insert_own"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'report-photos'
    and (storage.foldername(name))[1] = public.current_user_organization_id()::text
    and (coalesce((storage.foldername(name))[2], '') not in ('quotes', 'invoices', 'dossiers')
         or public.current_user_is_org_admin())
  );

drop policy if exists "report_photos_update_own" on storage.objects;
create policy "report_photos_update_own"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'report-photos'
    and (storage.foldername(name))[1] = public.current_user_organization_id()::text
    and (coalesce((storage.foldername(name))[2], '') not in ('quotes', 'invoices', 'dossiers')
         or public.current_user_is_org_admin())
  )
  with check (
    bucket_id = 'report-photos'
    and (storage.foldername(name))[1] = public.current_user_organization_id()::text
    and (coalesce((storage.foldername(name))[2], '') not in ('quotes', 'invoices', 'dossiers')
         or public.current_user_is_org_admin())
  );

drop policy if exists "report_photos_delete_own" on storage.objects;
create policy "report_photos_delete_own"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'report-photos'
    and (storage.foldername(name))[1] = public.current_user_organization_id()::text
    and (coalesce((storage.foldername(name))[2], '') not in ('quotes', 'invoices', 'dossiers')
         or public.current_user_is_org_admin())
  );

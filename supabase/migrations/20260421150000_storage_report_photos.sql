-- ═══════════════════════════════════════════════════════════
-- BuildOps — Migration 007 : bucket Storage pour les photos
-- ═══════════════════════════════════════════════════════════
-- Crée le bucket "report-photos" (public, 10 MB max par fichier,
-- types image uniquement) et les policies minimales.
-- Script idempotent.


-- 1. Bucket
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'report-photos',
  'report-photos',
  true,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
)
on conflict (id) do update set
  public             = excluded.public,
  file_size_limit    = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;


-- 2. Policies sur storage.objects
drop policy if exists "report_photos_insert"  on storage.objects;
drop policy if exists "report_photos_select"  on storage.objects;
drop policy if exists "report_photos_delete"  on storage.objects;
drop policy if exists "report_photos_update"  on storage.objects;

-- Lecture publique (bucket public — URLs accessibles par quiconque
-- connaît l'URL ; OK pour MVP, à tighten avec URLs signées plus tard)
create policy "report_photos_select"
  on storage.objects for select
  to public
  using (bucket_id = 'report-photos');

-- Écriture réservée aux utilisateurs authentifiés
create policy "report_photos_insert"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'report-photos');

create policy "report_photos_update"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'report-photos')
  with check (bucket_id = 'report-photos');

create policy "report_photos_delete"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'report-photos');

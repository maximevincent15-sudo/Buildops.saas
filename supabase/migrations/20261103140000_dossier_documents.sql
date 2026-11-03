-- ═══════════════════════════════════════════════════════════
-- Documents des dossiers (bons de livraison, plans, PV, anciens rapports…)
--
-- Un dossier est identifié par son N° (sites.dossier_number). Les documents
-- ajoutés à la main y sont rattachés par ce numéro. Fichiers rangés dans le
-- bucket report-photos, dossier « <organisation>/dossiers/… ».
-- Lecture : toute l'entreprise ; ajout, modification, suppression : les
-- administrateurs (la page Dossiers leur est réservée). Idempotent.
-- ═══════════════════════════════════════════════════════════

create table if not exists public.dossier_documents (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete cascade,
  dossier_number   text not null,
  kind             text not null default 'other'
                     check (kind in ('delivery_note', 'plan', 'certificate', 'report', 'photo', 'other')),
  title            text not null,
  document_date    date,
  file_path        text not null,
  file_url         text not null,
  file_name        text,
  mime_type        text,
  size_bytes       integer,
  created_at       timestamptz not null default now(),
  created_by       uuid references auth.users(id) on delete set null,
  created_by_name  text
);

create index if not exists idx_dossier_documents_org_number
  on public.dossier_documents (organization_id, dossier_number);

alter table public.dossier_documents enable row level security;

drop policy if exists "dossier_documents_select_org" on public.dossier_documents;
create policy "dossier_documents_select_org"
  on public.dossier_documents for select
  to authenticated
  using (organization_id = public.current_user_organization_id());

drop policy if exists "dossier_documents_insert_admin" on public.dossier_documents;
create policy "dossier_documents_insert_admin"
  on public.dossier_documents for insert
  to authenticated
  with check (organization_id = public.current_user_organization_id() and public.current_user_is_org_admin());

drop policy if exists "dossier_documents_update_admin" on public.dossier_documents;
create policy "dossier_documents_update_admin"
  on public.dossier_documents for update
  to authenticated
  using (organization_id = public.current_user_organization_id() and public.current_user_is_org_admin())
  with check (organization_id = public.current_user_organization_id() and public.current_user_is_org_admin());

drop policy if exists "dossier_documents_delete_admin" on public.dossier_documents;
create policy "dossier_documents_delete_admin"
  on public.dossier_documents for delete
  to authenticated
  using (organization_id = public.current_user_organization_id() and public.current_user_is_org_admin());

revoke all on public.dossier_documents from public, anon, authenticated;
grant select, insert, update, delete on public.dossier_documents to authenticated;
grant all on public.dossier_documents to service_role;

-- Bucket : en plus des images et des PDF, les fichiers Excel et Word
-- (anciens rapports, bordereaux tenus sous Excel)
update storage.buckets
set allowed_mime_types = array[
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
  'application/pdf',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
]
where id = 'report-photos';

-- ═══════════════════════════════════════════════════════════
-- BuildOps — Migration 012 : notes de frais des techniciens
-- ═══════════════════════════════════════════════════════════
-- Saisie des frais (repas, carburant, achat fournisseur…) avec
-- photo du justificatif + workflow de validation patron.

drop table if exists public.expenses cascade;

create table public.expenses (
  id                 uuid primary key default gen_random_uuid(),
  organization_id    uuid not null references public.organizations(id) on delete cascade,
  technician_id      uuid references public.technicians(id) on delete set null,
  technician_name    text not null,             -- snapshot
  spent_on           date not null,
  category           text not null,             -- 'meal' | 'supplier' | 'fuel' | 'toll' | 'supplies' | 'lodging' | 'other'
  amount_ttc         numeric(10, 2) not null check (amount_ttc >= 0),
  vat_rate           numeric(4, 2) not null default 20.00 check (vat_rate >= 0 and vat_rate <= 100),
  description        text,
  receipt_url        text,
  receipt_path       text,
  status             text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  rejection_reason   text,
  reviewed_at        timestamptz,
  reviewed_by        uuid references auth.users(id) on delete set null,
  created_at         timestamptz not null default now(),
  created_by         uuid references auth.users(id) on delete set null
);

create index idx_expenses_org_date    on public.expenses (organization_id, spent_on desc);
create index idx_expenses_tech        on public.expenses (technician_id);
create index idx_expenses_org_status  on public.expenses (organization_id, status);

alter table public.expenses enable row level security;

create policy "expenses_select_org"
  on public.expenses for select
  to authenticated
  using (organization_id = public.current_user_organization_id());

create policy "expenses_insert_org"
  on public.expenses for insert
  to authenticated
  with check (organization_id = public.current_user_organization_id());

create policy "expenses_update_org"
  on public.expenses for update
  to authenticated
  using (organization_id = public.current_user_organization_id())
  with check (organization_id = public.current_user_organization_id());

create policy "expenses_delete_org"
  on public.expenses for delete
  to authenticated
  using (organization_id = public.current_user_organization_id());


-- ═══════════════════════════════════════════════════════════
-- Bucket Storage pour les justificatifs (photos / PDF)
-- ═══════════════════════════════════════════════════════════

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'expense-receipts',
  'expense-receipts',
  true,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'application/pdf']
)
on conflict (id) do update set
  public             = excluded.public,
  file_size_limit    = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "expense_receipts_select" on storage.objects;
drop policy if exists "expense_receipts_insert" on storage.objects;
drop policy if exists "expense_receipts_update" on storage.objects;
drop policy if exists "expense_receipts_delete" on storage.objects;

create policy "expense_receipts_select"
  on storage.objects for select
  to public
  using (bucket_id = 'expense-receipts');

create policy "expense_receipts_insert"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'expense-receipts');

create policy "expense_receipts_update"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'expense-receipts')
  with check (bucket_id = 'expense-receipts');

create policy "expense_receipts_delete"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'expense-receipts');

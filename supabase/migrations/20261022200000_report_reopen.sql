-- ============================================================================
-- Firovia — Rouvrir un rapport finalisé (administrateurs)
-- ============================================================================
-- Un rapport finalisé était figé : impossible de corriger une erreur. Un
-- administrateur peut maintenant le rouvrir (il repasse en brouillon, puis
-- est refinalisé). Traçabilité : date et auteur de la réouverture.
-- Colonnes ajoutées à une table existante : pas de nouveau GRANT nécessaire.
-- ============================================================================

alter table public.reports
  add column if not exists reopened_at timestamptz,
  add column if not exists reopened_by_name text;

comment on column public.reports.reopened_at is 'Dernière réouverture du rapport finalisé (correction)';
comment on column public.reports.reopened_by_name is 'Administrateur qui a rouvert le rapport';

-- Seul un administrateur peut repasser un rapport finalisé en brouillon
create or replace function public.protect_report_reopen()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or public.current_user_is_org_admin() then
    return new;
  end if;
  if old.completed_at is not null and new.completed_at is null then
    raise exception 'Seul un administrateur peut rouvrir un rapport finalisé.' using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function public.protect_report_reopen() from public, anon, authenticated;

drop trigger if exists reports_protect_reopen on public.reports;
create trigger reports_protect_reopen
  before update on public.reports
  for each row execute function public.protect_report_reopen();

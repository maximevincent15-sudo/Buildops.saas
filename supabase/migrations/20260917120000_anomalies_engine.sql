-- ═══════════════════════════════════════════════════════════════════════
-- Firovia — Migration : Slice M1 — Moteur d'anomalies persistantes
-- ═══════════════════════════════════════════════════════════════════════
--
-- Une anomalie = un problème réel constaté sur une unité d'équipement précise,
-- avec un cycle de vie propre (détectée → planifiée → résolue → clôturée),
-- une échéance, une priorité, des photos, et un lien vers l'intervention et
-- le check qui l'ont générée.
--
-- Différence avec `equipment_checks.checklist` :
--   • Un check = état momentané d'un contrôle (OK / NOK / NA)
--   • Une anomalie = entité qui persiste après la fin de l'intervention,
--     et qui devra être suivie, planifiée, résolue.
--
-- Différence avec `reports.checklist` :
--   • Le reports.checklist est agrégé au niveau famille (extincteurs, RIA…)
--   • Une anomalie est reliée à UNE unité précise (EXT-07, RIA-02, DES-01…)
--
-- Cycle de vie :
--   open        → détectée, pas encore agie
--   planned     → une intervention future est prévue pour la traiter
--   resolved    → corrigée sur place ou lors d'une intervention ultérieure
--   closed      → clôturée manuellement (ex : équipement retiré du service)
--
-- Idempotent : re-exécutable sans effet secondaire (create table if not exists,
-- create policy if not exists via drop/create, etc.).
-- ═══════════════════════════════════════════════════════════════════════

begin;

-- ─────────────────────────────────────────────────────────────────────
-- Table anomalies
-- ─────────────────────────────────────────────────────────────────────

create table if not exists public.anomalies (
  id                     uuid primary key default gen_random_uuid(),
  organization_id        uuid not null references public.organizations(id) on delete cascade,

  -- Liens métier (delete set null pour garder l'historique même si l'entité
  -- source est supprimée)
  equipment_unit_id      uuid references public.equipment_units(id) on delete set null,
  intervention_id        uuid references public.interventions(id) on delete set null,
  equipment_check_id     uuid references public.equipment_checks(id) on delete set null,

  -- Contenu métier de l'anomalie
  title                  text not null,
  description            text,
  checklist_item_id      text,
  checklist_item_label   text,

  -- Classification
  action                 text check (action is null or action in (
    'replacement', 'repair', 'verification'
  )),
  priority               text not null default 'normal' check (priority in (
    'high', 'normal', 'low'
  )),
  status                 text not null default 'open' check (status in (
    'open', 'planned', 'resolved', 'closed'
  )),

  -- Suivi
  due_date               date,
  resolved_at            timestamptz,
  resolved_by            uuid references auth.users(id) on delete set null,
  resolution_notes       text,

  -- Media : [{ path, url }]
  photos                 jsonb not null default '[]'::jsonb,

  -- Traçabilité
  detected_at            timestamptz not null default now(),
  detected_by            uuid references auth.users(id) on delete set null,
  detected_by_name       text,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  created_by             uuid references auth.users(id) on delete set null
);

-- ─────────────────────────────────────────────────────────────────────
-- Indexes
-- ─────────────────────────────────────────────────────────────────────

create index if not exists idx_anomalies_org_status_open
  on public.anomalies (organization_id, status)
  where status in ('open', 'planned');

create index if not exists idx_anomalies_unit
  on public.anomalies (equipment_unit_id)
  where status in ('open', 'planned');

create index if not exists idx_anomalies_intervention
  on public.anomalies (organization_id, intervention_id);

create index if not exists idx_anomalies_due_date
  on public.anomalies (organization_id, due_date)
  where status in ('open', 'planned');

-- ─────────────────────────────────────────────────────────────────────
-- Row Level Security multi-tenant
-- ─────────────────────────────────────────────────────────────────────

alter table public.anomalies enable row level security;

drop policy if exists "anomalies_select_org" on public.anomalies;
create policy "anomalies_select_org"
  on public.anomalies for select
  to authenticated
  using (organization_id = public.current_user_organization_id());

drop policy if exists "anomalies_insert_org" on public.anomalies;
create policy "anomalies_insert_org"
  on public.anomalies for insert
  to authenticated
  with check (organization_id = public.current_user_organization_id());

drop policy if exists "anomalies_update_org" on public.anomalies;
create policy "anomalies_update_org"
  on public.anomalies for update
  to authenticated
  using (organization_id = public.current_user_organization_id())
  with check (organization_id = public.current_user_organization_id());

drop policy if exists "anomalies_delete_org" on public.anomalies;
create policy "anomalies_delete_org"
  on public.anomalies for delete
  to authenticated
  using (organization_id = public.current_user_organization_id());

-- ─────────────────────────────────────────────────────────────────────
-- Trigger : mise à jour automatique de updated_at
-- ─────────────────────────────────────────────────────────────────────

create or replace function public.anomalies_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists anomalies_updated_at on public.anomalies;
create trigger anomalies_updated_at
  before update on public.anomalies
  for each row execute procedure public.anomalies_set_updated_at();

-- ─────────────────────────────────────────────────────────────────────
-- Trigger : quand status passe à 'resolved', set resolved_at si null
-- ─────────────────────────────────────────────────────────────────────

create or replace function public.anomalies_set_resolved_at()
returns trigger language plpgsql as $$
begin
  if new.status = 'resolved'
     and (old.status is null or old.status <> 'resolved')
     and new.resolved_at is null then
    new.resolved_at = now();
  end if;
  -- Si on rouvre une anomalie, on remet resolved_at à null
  if new.status in ('open', 'planned')
     and old.status = 'resolved' then
    new.resolved_at = null;
    new.resolved_by = null;
  end if;
  return new;
end;
$$;

drop trigger if exists anomalies_resolved_at on public.anomalies;
create trigger anomalies_resolved_at
  before update on public.anomalies
  for each row execute procedure public.anomalies_set_resolved_at();

-- ─────────────────────────────────────────────────────────────────────
-- GRANTs (cohérence avec migration #67 hardening du 16/09)
-- ─────────────────────────────────────────────────────────────────────

revoke all on table public.anomalies from anon;
grant select, insert, update, delete on table public.anomalies to authenticated;

-- Les fonctions trigger internes ne doivent pas être appelables directement
revoke execute on function public.anomalies_set_updated_at() from anon, authenticated;
revoke execute on function public.anomalies_set_resolved_at() from anon, authenticated;

commit;

-- ═══════════════════════════════════════════════════════════════════════
-- Vérification post-migration :
--   • select count(*) from public.anomalies;                 → 0
--   • \d public.anomalies                                    → structure OK
--   • select policyname from pg_policies where tablename = 'anomalies';
--     → 4 lignes : anomalies_select_org, insert, update, delete
-- ═══════════════════════════════════════════════════════════════════════

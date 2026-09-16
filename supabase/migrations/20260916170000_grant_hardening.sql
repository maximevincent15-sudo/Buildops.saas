-- ═══════════════════════════════════════════════════════════════════════
-- Firovia — Migration : GRANT hardening (tâche #67, deadline 30 oct 2026)
-- ═══════════════════════════════════════════════════════════════════════
--
-- Contexte : audit sécurité des GRANTs Postgres/Supabase.
--
-- Constat pré-migration :
--   1. Toutes les tables ont anon/authenticated/service_role avec DELETE,
--      INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE.
--   2. Toutes les fonctions ont EXECUTE pour anon (comportement Supabase
--      par défaut historique).
--   3. RLS activée partout avec policies strictes multi-tenant → protection
--      effective aujourd'hui, mais défense en profondeur fragile.
--
-- Failles réelles corrigées :
--   [P0] `admin_list_prospects` : check whitelist bugué (NULL NOT IN =
--        NULL, pas TRUE) → anon peut voir tous les prospects.
--   [P1] `admin_list_prospects` EXECUTE accessible à anon.
--   [P1] Fonctions trigger (handle_new_user, set_*_reference,
--        *_set_updated_at, notify_*) accessibles à anon/authenticated
--        alors qu'elles ne sont jamais appelées directement.
--   [P1] TRUNCATE possible pour anon/authenticated → bypass RLS.
--   [P2] REFERENCES/TRIGGER inutiles pour anon.
--
-- Stratégie :
--   • REVOKE ALL FROM anon sur toutes les tables `public`.
--   • GRANT explicite (SELECT/INSERT/UPDATE/DELETE) pour authenticated
--     sur les tables métier — sans TRUNCATE.
--   • Certaines tables restent read-only pour authenticated :
--     family_templates (catalogue mondial), subscriptions (Stripe seul),
--     organization_year_counters (triggers seuls), rate_limits (edge fns).
--   • Certaines tables n'ont ni INSERT ni DELETE : organizations,
--     profiles, organization_invoicing_settings (créées via trigger/UI
--     mais jamais supprimées).
--   • REVOKE EXECUTE FROM anon sur fonctions internes (admin, triggers,
--     jobs cron).
--   • Fonctions publiques légitimes conservées : accept_organization_
--     invitation, get_invitation_preview, check_siret_available,
--     client_portal_*, get_public_registry, current_user_organization_id,
--     check_rate_limit.
--   • Patch de `admin_list_prospects` pour couvrir user_email IS NULL.
--
-- Idempotent : re-exécutable sans effet secondaire.
-- ═══════════════════════════════════════════════════════════════════════

begin;

-- ─────────────────────────────────────────────────────────────────────
-- Partie 1 : Patch `admin_list_prospects` (bug NULL sur check whitelist)
-- ─────────────────────────────────────────────────────────────────────

create or replace function public.admin_list_prospects()
returns table (
  organization_id uuid,
  organization_name text,
  siret text,
  contact_name text,
  contact_email text,
  status text,
  plan text,
  billing_period text,
  trial_ends_at timestamptz,
  days_left int,
  current_period_end timestamptz,
  stripe_customer_id text,
  nb_interventions int,
  nb_clients int,
  nb_reports int,
  last_sign_in_at timestamptz,
  signed_up_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  user_email text;
begin
  -- Sécurité : anon a auth.uid() = NULL, donc user_email NULL, donc
  -- l'ancien check `NOT IN (...)` retournait NULL (pas TRUE) et laissait
  -- passer. On rejette explicitement toute session sans email connu.
  if auth.uid() is null then
    return;
  end if;

  select email into user_email from auth.users where id = auth.uid();

  if user_email is null then
    return;
  end if;

  -- Whitelist des admins (à adapter si tu ajoutes des associés plus tard)
  if user_email not in ('contact@firovia.fr', 'maximevincent15@gmail.com') then
    return;
  end if;

  return query
  select
    o.id as organization_id,
    o.name as organization_name,
    o.siret,
    (p.first_name || ' ' || p.last_name) as contact_name,
    u.email as contact_email,
    s.status,
    s.plan,
    s.billing_period,
    s.trial_ends_at,
    (s.trial_ends_at::date - now()::date)::int as days_left,
    s.current_period_end,
    s.stripe_customer_id,
    (select count(*)::int from public.interventions i where i.organization_id = o.id) as nb_interventions,
    (select count(*)::int from public.clients c where c.organization_id = o.id) as nb_clients,
    (select count(*)::int from public.reports r where r.organization_id = o.id) as nb_reports,
    u.last_sign_in_at,
    u.created_at as signed_up_at
  from public.organizations o
  left join public.profiles p on p.organization_id = o.id
  left join auth.users u on u.id = p.id
  left join public.subscriptions s on s.organization_id = o.id
  where p.id = (
    select id from public.profiles
     where organization_id = o.id
     order by created_at asc
     limit 1
  )
  order by
    case s.status
      when 'trialing' then 1
      when 'past_due' then 2
      when 'active' then 3
      when 'canceled' then 4
      else 5
    end,
    (s.trial_ends_at::date - now()::date) asc nulls last,
    u.created_at desc;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────
-- Partie 2 : REVOKE ALL FROM anon sur toutes les tables `public`
-- ─────────────────────────────────────────────────────────────────────

do $$
declare
  t text;
  all_tables text[] := array[
    'certifications', 'client_portal_tokens', 'clients',
    'equipment_checks', 'equipment_units', 'expenses',
    'family_templates', 'interventions', 'invoice_lines', 'invoices',
    'legacy_documents', 'organization_invitations',
    'organization_invoicing_settings', 'organization_year_counters',
    'organizations', 'overtime_hours', 'planning_blocks',
    'profiles', 'quote_lines', 'quotes', 'rate_limits',
    'reports', 'sites', 'subscriptions', 'technicians',
    'vehicles', 'zones'
  ];
begin
  foreach t in array all_tables loop
    if exists (
      select 1 from information_schema.tables
      where table_schema = 'public' and table_name = t
    ) then
      execute format('revoke all on table public.%I from anon', t);
    end if;
  end loop;
end $$;

-- ─────────────────────────────────────────────────────────────────────
-- Partie 3 : GRANT explicite pour authenticated
-- (SELECT/INSERT/UPDATE/DELETE — pas de TRUNCATE, REFERENCES, TRIGGER)
-- ─────────────────────────────────────────────────────────────────────

-- 3.a — Tables métier avec accès complet CRUD
do $$
declare
  t text;
  crud_tables text[] := array[
    'certifications', 'client_portal_tokens', 'clients',
    'equipment_checks', 'equipment_units', 'expenses',
    'interventions', 'invoice_lines', 'invoices',
    'legacy_documents', 'organization_invitations',
    'overtime_hours', 'planning_blocks',
    'quote_lines', 'quotes', 'reports', 'sites',
    'technicians', 'vehicles', 'zones'
  ];
begin
  foreach t in array crud_tables loop
    if exists (
      select 1 from information_schema.tables
      where table_schema = 'public' and table_name = t
    ) then
      execute format('revoke all on table public.%I from authenticated', t);
      execute format('grant select, insert, update, delete on table public.%I to authenticated', t);
    end if;
  end loop;
end $$;

-- 3.b — Tables read-only pour authenticated
-- (écrites via triggers ou Stripe webhook uniquement)
do $$
declare
  t text;
  read_only_tables text[] := array[
    'family_templates',
    'organization_year_counters',
    'rate_limits',
    'subscriptions'
  ];
begin
  foreach t in array read_only_tables loop
    if exists (
      select 1 from information_schema.tables
      where table_schema = 'public' and table_name = t
    ) then
      execute format('revoke all on table public.%I from authenticated', t);
      execute format('grant select on table public.%I to authenticated', t);
    end if;
  end loop;
end $$;

-- 3.c — Tables sans DELETE
-- (organizations, profiles, invoicing_settings : jamais supprimées via UI)
do $$
declare
  t text;
  no_delete_tables text[] := array[
    'organizations',
    'organization_invoicing_settings',
    'profiles'
  ];
begin
  foreach t in array no_delete_tables loop
    if exists (
      select 1 from information_schema.tables
      where table_schema = 'public' and table_name = t
    ) then
      execute format('revoke all on table public.%I from authenticated', t);
      execute format('grant select, insert, update on table public.%I to authenticated', t);
    end if;
  end loop;
end $$;

-- ─────────────────────────────────────────────────────────────────────
-- Partie 4 : REVOKE EXECUTE FROM anon sur fonctions internes
-- ─────────────────────────────────────────────────────────────────────

-- 4.a — Fonctions admin (jamais anon)
do $$
begin
  if exists (select 1 from pg_proc where proname = 'admin_list_prospects') then
    revoke execute on function public.admin_list_prospects() from anon;
  end if;
end $$;

-- 4.b — Fonctions cron / jobs internes (jamais anon)
do $$
begin
  if exists (select 1 from pg_proc where proname = 'check_trials_lifecycle') then
    revoke execute on function public.check_trials_lifecycle() from anon;
  end if;
  if exists (select 1 from pg_proc where proname = 'rate_limits_maybe_cleanup') then
    revoke execute on function public.rate_limits_maybe_cleanup() from anon;
  end if;
  if exists (select 1 from pg_proc where proname = 'rls_auto_enable') then
    revoke execute on function public.rls_auto_enable() from anon;
  end if;
end $$;

-- 4.c — Fonctions authentifiées uniquement (déjà safe via check interne,
--       mais REVOKE anon pour défense en profondeur)
do $$
begin
  if exists (select 1 from pg_proc where proname = 'remove_member_from_organization') then
    revoke execute on function public.remove_member_from_organization(uuid) from anon;
  end if;
end $$;

-- 4.d — Fonctions trigger (jamais appelables directement)
do $$
begin
  if exists (select 1 from pg_proc where proname = 'handle_new_user') then
    revoke execute on function public.handle_new_user() from anon, authenticated;
  end if;
  if exists (select 1 from pg_proc where proname = 'handle_new_organization_subscription') then
    revoke execute on function public.handle_new_organization_subscription() from anon, authenticated;
  end if;
  if exists (select 1 from pg_proc where proname = 'notify_lifecycle_via_http') then
    revoke execute on function public.notify_lifecycle_via_http(text, uuid) from anon, authenticated;
  end if;
  if exists (select 1 from pg_proc where proname = 'notify_signup_webhook') then
    revoke execute on function public.notify_signup_webhook() from anon, authenticated;
  end if;
  if exists (select 1 from pg_proc where proname = 'set_intervention_reference') then
    revoke execute on function public.set_intervention_reference() from anon, authenticated;
  end if;
  if exists (select 1 from pg_proc where proname = 'set_invoice_reference') then
    revoke execute on function public.set_invoice_reference() from anon, authenticated;
  end if;
  if exists (select 1 from pg_proc where proname = 'set_quote_reference') then
    revoke execute on function public.set_quote_reference() from anon, authenticated;
  end if;
  if exists (select 1 from pg_proc where proname = 'equipment_checks_set_updated_at') then
    revoke execute on function public.equipment_checks_set_updated_at() from anon, authenticated;
  end if;
  if exists (select 1 from pg_proc where proname = 'equipment_units_set_updated_at') then
    revoke execute on function public.equipment_units_set_updated_at() from anon, authenticated;
  end if;
  if exists (select 1 from pg_proc where proname = 'sites_set_updated_at') then
    revoke execute on function public.sites_set_updated_at() from anon, authenticated;
  end if;
  if exists (select 1 from pg_proc where proname = 'sites_generate_public_token') then
    revoke execute on function public.sites_generate_public_token() from anon, authenticated;
  end if;
  if exists (select 1 from pg_proc where proname = 'subscriptions_set_updated_at') then
    revoke execute on function public.subscriptions_set_updated_at() from anon, authenticated;
  end if;
end $$;

-- ─────────────────────────────────────────────────────────────────────
-- Partie 5 : Fonctions publiques légitimes (aucun REVOKE, doc)
-- ─────────────────────────────────────────────────────────────────────
-- Ces fonctions RESTENT accessibles à anon (usage documenté) :
--   • accept_organization_invitation(text) — signup via invitation
--   • get_invitation_preview(text)         — preview avant signup
--   • check_siret_available(text)          — validation SIRET signup
--   • check_rate_limit(text, int, int)     — rate-limit signup/login
--   • client_portal_invoices(text)         — portail client par token
--   • client_portal_reports(text)          — portail client par token
--   • client_portal_upcoming(text)         — portail client par token
--   • client_portal_validate(text)         — validation token portail
--   • client_portal_request_intervention(text, text, text, text, text)
--   • get_public_registry(text)            — registre APSAD public
--   • current_user_organization_id()       — helper RLS (retourne NULL
--                                            pour anon, OK)

commit;

-- ═══════════════════════════════════════════════════════════════════════
-- Vérification post-migration : re-jouer les 5 blocs d'audit et confirmer
--   • anon n'a plus AUCUN privilège sur les tables `public`
--   • authenticated a SELECT/INSERT/UPDATE/DELETE explicite (pas TRUNCATE)
--   • Les fonctions internes n'ont plus EXECUTE pour anon
--   • Les 11 fonctions publiques légitimes gardent EXECUTE anon
-- ═══════════════════════════════════════════════════════════════════════

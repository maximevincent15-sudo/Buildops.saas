-- ═══════════════════════════════════════════════════════════
-- Page admin « Prospects » : « Erreur inconnue »
--
-- RETURN QUERY exige des types identiques à ceux annoncés par la fonction.
-- auth.users.email est en varchar(255), pas en text : PostgreSQL refuse la
-- réponse (« structure of query does not match function result type »).
-- Toutes les colonnes renvoyées sont désormais converties explicitement.
-- Même logique de sécurité qu'avant (whitelist, session obligatoire). Idempotent.
-- ═══════════════════════════════════════════════════════════

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
  -- Session obligatoire (anon : auth.uid() NULL)
  if auth.uid() is null then
    return;
  end if;

  select email::text into user_email from auth.users where id = auth.uid();

  if user_email is null then
    return;
  end if;

  -- Whitelist des admins
  if user_email not in ('contact@firovia.fr', 'maximevincent15@gmail.com') then
    return;
  end if;

  return query
  select
    o.id::uuid,
    o.name::text,
    o.siret::text,
    (coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, ''))::text,
    u.email::text,
    s.status::text,
    s.plan::text,
    s.billing_period::text,
    s.trial_ends_at::timestamptz,
    (s.trial_ends_at::date - now()::date)::int,
    s.current_period_end::timestamptz,
    s.stripe_customer_id::text,
    (select count(*)::int from public.interventions i where i.organization_id = o.id),
    (select count(*)::int from public.clients c where c.organization_id = o.id),
    (select count(*)::int from public.reports r where r.organization_id = o.id),
    u.last_sign_in_at::timestamptz,
    u.created_at::timestamptz
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

-- Droits inchangés : utilisateurs connectés uniquement (le contrôle admin est dans la fonction)
revoke all on function public.admin_list_prospects() from public, anon;
grant execute on function public.admin_list_prospects() to authenticated;

-- ═══════════════════════════════════════════════════════════
-- Firovia — Vue admin "mes prospects" (pilotage pipeline)
-- ═══════════════════════════════════════════════════════════
-- RPC accessible uniquement à Maxime (founder) pour lister toutes
-- les organisations avec leur état de trial/abonnement, sans passer
-- par SQL brut.
--
-- Sécurité : SECURITY DEFINER (bypass RLS) + check email whitelist
-- au début de la fonction. Un user non-admin reçoit un tableau vide.

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
  -- Récupère l'email du user courant
  select email into user_email from auth.users where id = auth.uid();

  -- Whitelist des admins (à adapter si tu ajoutes des associés plus tard)
  if user_email not in ('contact@firovia.fr', 'maximevincent15@gmail.com') then
    -- Non-admin → tableau vide (comportement silencieux, pas d'erreur)
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
    -- Jours restants (négatif si expiré)
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
  -- Un seul profile par org pour ce dashboard (le 1er créé = le fondateur du compte)
  where p.id = (
    select id from public.profiles
     where organization_id = o.id
     order by created_at asc
     limit 1
  )
  order by
    -- Ordre d'urgence : trial expiré > trial J-3 > trial en cours > actif > canceled
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

grant execute on function public.admin_list_prospects() to authenticated;

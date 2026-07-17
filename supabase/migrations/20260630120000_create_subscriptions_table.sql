-- ═══════════════════════════════════════════════════════════
-- Firovia — Abonnements Stripe (table `subscriptions`)
-- ═══════════════════════════════════════════════════════════
-- Stratégie "trial local 14j sans CB" (Option B validée 30/06/2026) :
--   • À la création d'une organisation, on crée AUTO une ligne
--     `subscriptions` avec status='trialing' et trial_ends_at = now()+14j.
--   • Pendant le trial, l'utilisateur a accès à 100% du produit, sans
--     aucune interaction Stripe (zéro friction à l'inscription).
--   • À J-14 (ou avant), l'UI propose "Choisir un plan" → ouvre une
--     Stripe Checkout Session (Edge Function `stripe-checkout`).
--   • Le webhook `stripe-webhook` synchronise stripe_subscription_id,
--     status, current_period_end, etc., à chaque event Stripe.
--
-- Modèle 1:1 : exactement une ligne `subscriptions` par organisation.

create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null unique
    references public.organizations(id) on delete cascade,

  -- ─── IDs Stripe (NULL pendant le trial local) ───────────
  stripe_customer_id     text unique,
  stripe_subscription_id text unique,
  stripe_price_id        text,

  -- ─── Plan & période ─────────────────────────────────────
  plan           text check (plan in ('starter', 'pro')),
  billing_period text check (billing_period in ('monthly', 'yearly')),

  -- ─── Statut (miroir Stripe + 'trialing' local) ──────────
  status text not null default 'trialing'
    check (status in (
      'trialing', 'active', 'past_due', 'canceled',
      'unpaid', 'incomplete', 'incomplete_expired'
    )),

  trial_ends_at        timestamptz,
  current_period_end   timestamptz,
  cancel_at_period_end boolean not null default false,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_subscriptions_org
  on public.subscriptions(organization_id);
create index if not exists idx_subscriptions_stripe_customer
  on public.subscriptions(stripe_customer_id)
  where stripe_customer_id is not null;
create index if not exists idx_subscriptions_stripe_subscription
  on public.subscriptions(stripe_subscription_id)
  where stripe_subscription_id is not null;


-- ─── Trigger updated_at ─────────────────────────────────────
create or replace function public.subscriptions_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists subscriptions_updated_at on public.subscriptions;
create trigger subscriptions_updated_at
  before update on public.subscriptions
  for each row execute procedure public.subscriptions_set_updated_at();


-- ─── Auto-création d'une ligne trial à chaque nouvelle org ─
create or replace function public.handle_new_organization_subscription()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.subscriptions (organization_id, status, trial_ends_at)
  values (new.id, 'trialing', now() + interval '14 days')
  on conflict (organization_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_organization_created_subscription on public.organizations;
create trigger on_organization_created_subscription
  after insert on public.organizations
  for each row execute procedure public.handle_new_organization_subscription();


-- ─── Backfill orgs existantes ──────────────────────────────
-- Crée des lignes trial pour toutes les orgs déjà en base
-- qui n'ont pas encore d'abonnement (sécurité idempotente).
insert into public.subscriptions (organization_id, status, trial_ends_at)
select o.id, 'trialing', now() + interval '14 days'
from public.organizations o
where not exists (
  select 1 from public.subscriptions s where s.organization_id = o.id
)
on conflict (organization_id) do nothing;


-- ─── RLS ────────────────────────────────────────────────────
-- Les Edge Functions stripe-checkout / stripe-webhook utilisent le
-- service_role (qui bypasse RLS), donc on ne crée que la policy SELECT
-- pour `authenticated`. Pas d'INSERT/UPDATE/DELETE côté client : un
-- utilisateur ne peut PAS bricoler son propre abonnement.

alter table public.subscriptions enable row level security;

drop policy if exists "subscriptions_select_own_org" on public.subscriptions;
create policy "subscriptions_select_own_org"
  on public.subscriptions for select
  to authenticated
  using (organization_id = public.current_user_organization_id());

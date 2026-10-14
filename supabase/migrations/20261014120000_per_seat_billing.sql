-- ═══════════════════════════════════════════════════════════
-- Facturation par technicien (grille du 13/10/2026)
--
--   Essentiel : 49 € HT / technicien / mois (minimum 2), 39 € dès le 11e
--   Pro       : 69 € HT / technicien / mois (minimum 3), 59 € dès le 11e
--   (annuel = 10 mois ; paliers portés par les prix Stripe « progressifs »)
--
-- 1. subscriptions.seat_based / seats : abonnement facturé au nombre de
--    techniciens actifs + quantité actuellement facturée (miroir Stripe)
-- 2. Plus de limite de techniciens pour ces abonnements (chaque technicien
--    est facturé) ; Starter 5 / Pro forfaitaire 20 conservés pour l'existant
-- 3. Chaque ajout, retrait, activation ou désactivation d'un technicien
--    appelle l'Edge Function stripe-sync-seats (pg_net, après commit)
-- 4. Cron quotidien de rattrapage (toutes les organisations)
-- Idempotent.
-- ═══════════════════════════════════════════════════════════

-- ─── 1. Colonnes ─────────────────────────────────────────────
alter table public.subscriptions
  add column if not exists seat_based boolean not null default false,
  add column if not exists seats integer;

comment on column public.subscriptions.seat_based is
  'Abonnement facturé par technicien actif (prix Stripe à paliers)';
comment on column public.subscriptions.seats is
  'Nombre de techniciens facturés sur l''abonnement Stripe';

-- ─── 2. Limite de techniciens ────────────────────────────────
create or replace function public.technician_limit_for_org(p_org uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select case
    when s.status = 'trialing' then null
    when s.seat_based          then null
    when s.plan = 'starter'    then 5
    when s.plan = 'pro'        then 20
    else null
  end
  from public.subscriptions s
  where s.organization_id = p_org
$$;

revoke execute on function public.technician_limit_for_org(uuid) from public, anon, authenticated;

-- ─── 3. Synchronisation Stripe ───────────────────────────────
-- p_org null → rattrapage de toutes les organisations
create or replace function public.request_seat_sync(p_org uuid default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform net.http_post(
    url := 'https://omqroiivaedafmwfeygt.supabase.co/functions/v1/stripe-sync-seats',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := case
      when p_org is null then jsonb_build_object('all', true)
      else jsonb_build_object('organization_id', p_org)
    end
  );
exception when others then
  -- Ne jamais bloquer la gestion des techniciens : le cron rattrapera
  raise warning 'request_seat_sync failed: %', sqlerrm;
end;
$$;

create or replace function public.technicians_sync_seats()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid;
begin
  -- Seuls les changements qui modifient le nombre de techniciens actifs
  if tg_op = 'INSERT' then
    if not new.active then return null; end if;
    v_org := new.organization_id;
  elsif tg_op = 'DELETE' then
    if not old.active then return null; end if;
    v_org := old.organization_id;
  else
    if old.active is not distinct from new.active then return null; end if;
    v_org := new.organization_id;
  end if;

  if exists (
    select 1
      from public.subscriptions s
     where s.organization_id = v_org
       and s.seat_based
       and s.stripe_subscription_id is not null
       and s.status in ('active', 'past_due')
  ) then
    perform public.request_seat_sync(v_org);
  end if;

  return null;
end;
$$;

drop trigger if exists technicians_sync_seats on public.technicians;
create trigger technicians_sync_seats
  after insert or delete or update of active on public.technicians
  for each row execute function public.technicians_sync_seats();

revoke execute on function public.request_seat_sync(uuid) from public, anon, authenticated;
revoke execute on function public.technicians_sync_seats() from public, anon, authenticated;

-- ─── 4. Cron quotidien de rattrapage (4h UTC) ────────────────
select cron.unschedule('firovia-seats-sync')
  where exists (select 1 from cron.job where jobname = 'firovia-seats-sync');

select cron.schedule(
  'firovia-seats-sync',
  '0 4 * * *',
  $$ select public.request_seat_sync(null); $$
);

-- ─── 5. Limite de comptes (CGV art. 4) ───────────────────────
-- Comptes autorisés = techniciens facturés (actifs, au minimum celui de la
-- formule) + comptes bureau inclus :
--   Essentiel : max(actifs, 2) + 2      Pro : max(actifs, 3) + 5
-- Uniquement pour les abonnements par technicien ; essai, anciennes
-- formules et accès offerts : pas de limite. Les comptes existants ne sont
-- jamais retirés : seules les nouvelles invitations / arrivées sont bloquées.
create or replace function public.account_limit_for_org(p_org uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select case
    when s.status = 'trialing' or not s.seat_based then null
    else greatest(
           (select count(*)::int
              from public.technicians t
             where t.organization_id = p_org
               and t.active),
           case when s.plan = 'pro' then 3 else 2 end
         )
         + case when s.plan = 'pro' then 5 else 2 end
  end
  from public.subscriptions s
  where s.organization_id = p_org
$$;

-- Invitation : comptes existants + invitations en attente
create or replace function public.enforce_account_limit_on_invitation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_limit integer;
  v_used  integer;
begin
  v_limit := public.account_limit_for_org(new.organization_id);
  if v_limit is null then
    return new;
  end if;

  select (select count(*) from public.profiles p where p.organization_id = new.organization_id)
       + (select count(*) from public.organization_invitations i
           where i.organization_id = new.organization_id
             and i.accepted_at is null
             and i.cancelled_at is null
             and i.expires_at > now())
    into v_used;

  if v_used >= v_limit then
    raise exception 'account_limit_reached:%', v_limit
      using errcode = 'P0001',
            hint = 'Ajoutez un technicien actif pour ouvrir un compte supplémentaire.';
  end if;

  return new;
end;
$$;

drop trigger if exists organization_invitations_account_limit on public.organization_invitations;
create trigger organization_invitations_account_limit
  before insert on public.organization_invitations
  for each row execute function public.enforce_account_limit_on_invitation();

-- Arrivée dans l'équipe (acceptation d'invitation) : garde-fou final
create or replace function public.enforce_account_limit_on_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_limit integer;
  v_count integer;
begin
  if new.organization_id is null
     or (tg_op = 'UPDATE' and new.organization_id is not distinct from old.organization_id) then
    return new;
  end if;

  v_limit := public.account_limit_for_org(new.organization_id);
  if v_limit is null then
    return new;
  end if;

  select count(*) into v_count
    from public.profiles p
   where p.organization_id = new.organization_id
     and p.id <> new.id;

  if v_count >= v_limit then
    raise exception 'account_limit_reached:%', v_limit
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

drop trigger if exists profiles_account_limit on public.profiles;
create trigger profiles_account_limit
  before insert or update of organization_id on public.profiles
  for each row execute function public.enforce_account_limit_on_profile();

revoke execute on function public.account_limit_for_org(uuid) from public, anon, authenticated;
revoke execute on function public.enforce_account_limit_on_invitation() from public, anon, authenticated;
revoke execute on function public.enforce_account_limit_on_profile() from public, anon, authenticated;

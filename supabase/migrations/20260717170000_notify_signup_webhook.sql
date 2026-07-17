-- ═══════════════════════════════════════════════════════════
-- Firovia — Webhook DB : notification email nouvelle inscription
-- ═══════════════════════════════════════════════════════════
-- À chaque INSERT dans public.profiles (= nouveau signup), on appelle
-- l'Edge Function `notify-signup` via pg_net qui envoie un email à
-- contact@firovia.fr avec les infos du prospect.
--
-- Pourquoi INSERT sur profiles et pas auth.users ?
-- → Le trigger handle_new_user() crée d'abord l'organization,
--   puis le profile. En hookant sur profiles, on a déjà accès à
--   organization_id (et donc entreprise + SIRET).

-- pg_net est déjà activé par défaut sur Supabase Pro
create extension if not exists pg_net;

-- Trigger function : appelle l'Edge Function notify-signup
create or replace function public.notify_signup_webhook()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  webhook_url text;
  service_role_key text;
  payload jsonb;
begin
  -- URL de l'Edge Function (auto-détectable via project_ref)
  webhook_url := 'https://omqroiivaedafmwfeygt.supabase.co/functions/v1/notify-signup';

  -- Payload standard "database webhook" pour rester compat côté Edge Function
  payload := jsonb_build_object(
    'type', 'INSERT',
    'table', 'profiles',
    'schema', 'public',
    'record', to_jsonb(new)
  );

  -- Appel HTTP asynchrone (pg_net) — n'attend pas la réponse
  -- Le service_role key est stocké côté function via env, pas besoin
  -- de le passer en header (la function utilise SUPABASE_SERVICE_ROLE_KEY).
  perform net.http_post(
    url := webhook_url,
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := payload
  );

  return new;
exception when others then
  -- Ne jamais faire échouer l'inscription à cause d'un problème de notif.
  -- On log l'erreur mais on laisse le signup se terminer.
  raise warning 'notify_signup_webhook failed: %', sqlerrm;
  return new;
end;
$$;

drop trigger if exists on_profile_created_notify_signup on public.profiles;
create trigger on_profile_created_notify_signup
  after insert on public.profiles
  for each row execute procedure public.notify_signup_webhook();

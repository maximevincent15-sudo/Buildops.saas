-- Durcissement de sécurité (audit du 24/11/2026)
--
-- 1. Portail client : les rapports et les prochaines interventions affichés
--    par le portail sont limités à l'entreprise du lien, et un lien portail
--    ne peut être créé ou modifié que pour un client de sa propre entreprise.
-- 2. Appels internes : un secret aléatoire est rangé dans le coffre de la
--    base (vault). Les trois fonctions SQL qui appellent les fonctions
--    serveur notify-signup, notify-lifecycle et stripe-sync-seats l'envoient
--    dans l'en-tête « x-internal-secret », et ces fonctions refusent tout
--    appel sans lui. Personne ne voit le secret : il est tiré au hasard ici,
--    et les fonctions serveur le lisent via internal_hook_secret(), réservée
--    au rôle service.
-- 3. Mails : known_recipient_emails() indique quelles adresses l'entreprise
--    connaît déjà (fiches clients, techniciens, adresse légale, documents
--    déjà envoyés). send-document-email limite le nombre des autres.
--
-- À lancer AVANT de déployer les fonctions serveur modifiées. Les anciennes
-- fonctions ignorent l'en-tête ajouté : rien ne casse entre les deux étapes.

-- ─── 1. Portail client ───────────────────────────────────────────────

create or replace function public.client_portal_reports(in_token text)
 returns setof jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  tok public.client_portal_tokens;
begin
  select * into tok from public.client_portal_tokens
   where token = in_token and revoked_at is null and expires_at > now() limit 1;
  if tok.id is null then return; end if;

  return query
    select jsonb_build_object(
      'id', r.id,
      'reference', i.reference,
      'site_name', i.site_name,
      'equipment_type', r.equipment_type,
      'equipment_types', i.equipment_types,
      'completed_at', r.completed_at,
      'pdf_url', r.pdf_url,
      'scheduled_date', i.scheduled_date,
      'technician_name', i.technician_name,
      'checklist', r.checklist,
      'is_conform', r.is_conform,
      'anomaly_count', r.anomaly_count
    )
    from public.reports r
    join public.interventions i on i.id = r.intervention_id
   where i.client_id = tok.client_id
     and i.organization_id = tok.organization_id
     and r.organization_id = tok.organization_id
     and r.completed_at is not null
   order by r.completed_at desc nulls last;
end;
$function$;

create or replace function public.client_portal_upcoming(in_token text)
 returns setof jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare tok public.client_portal_tokens;
begin
  select * into tok from public.client_portal_tokens where token = in_token and revoked_at is null and expires_at > now() limit 1;
  if tok.id is null then return; end if;
  return query select jsonb_build_object('id', i.id, 'reference', i.reference, 'site_name', i.site_name, 'address', i.address, 'equipment_types', i.equipment_types, 'scheduled_date', i.scheduled_date, 'technician_name', i.technician_name, 'status', i.status)
    from public.interventions i
   where i.client_id = tok.client_id
     and i.organization_id = tok.organization_id
     and i.status in ('a_planifier', 'planifiee', 'en_cours')
   order by coalesce(i.scheduled_date, '9999-12-31'::date) asc;
end; $function$;

-- Un lien portail ne vise que les clients de sa propre entreprise
drop policy if exists portal_tokens_insert_org on public.client_portal_tokens;
create policy portal_tokens_insert_org on public.client_portal_tokens
  for insert to authenticated
  with check (
    organization_id = public.current_user_organization_id()
    and exists (
      select 1 from public.clients c
       where c.id = client_portal_tokens.client_id
         and c.organization_id = public.current_user_organization_id()
    )
  );

drop policy if exists portal_tokens_update_org on public.client_portal_tokens;
create policy portal_tokens_update_org on public.client_portal_tokens
  for update to authenticated
  using (organization_id = public.current_user_organization_id())
  with check (
    organization_id = public.current_user_organization_id()
    and exists (
      select 1 from public.clients c
       where c.id = client_portal_tokens.client_id
         and c.organization_id = public.current_user_organization_id()
    )
  );

-- ─── 2. Secret des appels internes ───────────────────────────────────

do $$
begin
  if not exists (select 1 from vault.secrets where name = 'internal_hook_secret') then
    perform vault.create_secret(
      encode(extensions.gen_random_bytes(32), 'hex'),
      'internal_hook_secret',
      'Secret partagé base → fonctions serveur internes (notify-signup, notify-lifecycle, stripe-sync-seats)'
    );
  end if;
end $$;

create or replace function public.internal_hook_secret()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select decrypted_secret from vault.decrypted_secrets where name = 'internal_hook_secret' limit 1;
$$;

revoke all on function public.internal_hook_secret() from public, anon, authenticated;
grant execute on function public.internal_hook_secret() to service_role;

-- Inscription → notify-signup
create or replace function public.notify_signup_webhook()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  webhook_url text := 'https://omqroiivaedafmwfeygt.supabase.co/functions/v1/notify-signup';
  payload jsonb;
begin
  -- Payload standard « database webhook » pour rester compatible avec la fonction
  payload := jsonb_build_object(
    'type', 'INSERT',
    'table', 'profiles',
    'schema', 'public',
    'record', to_jsonb(new)
  );

  -- Appel HTTP asynchrone (pg_net), avec le secret des appels internes
  perform net.http_post(
    url := webhook_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-internal-secret', coalesce(public.internal_hook_secret(), '')
    ),
    body := payload
  );

  return new;
exception when others then
  -- Ne jamais faire échouer l'inscription à cause d'un problème de notif
  raise warning 'notify_signup_webhook failed: %', sqlerrm;
  return new;
end;
$function$;

-- Cycle de vie de l'essai (cron) → notify-lifecycle
create or replace function public.notify_lifecycle_via_http(p_kind text, p_organization_id uuid)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  perform net.http_post(
    url := 'https://omqroiivaedafmwfeygt.supabase.co/functions/v1/notify-lifecycle',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-internal-secret', coalesce(public.internal_hook_secret(), '')
    ),
    body := jsonb_build_object(
      'kind', p_kind,
      'organization_id', p_organization_id
    )
  );
exception when others then
  raise warning 'notify_lifecycle_via_http failed: %', sqlerrm;
end;
$function$;

-- Nombre de techniciens → stripe-sync-seats
create or replace function public.request_seat_sync(p_org uuid default null::uuid)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  perform net.http_post(
    url := 'https://omqroiivaedafmwfeygt.supabase.co/functions/v1/stripe-sync-seats',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-internal-secret', coalesce(public.internal_hook_secret(), '')
    ),
    body := case
      when p_org is null then jsonb_build_object('all', true)
      else jsonb_build_object('organization_id', p_org)
    end
  );
exception when others then
  -- Ne jamais bloquer la gestion des techniciens : le cron rattrapera
  raise warning 'request_seat_sync failed: %', sqlerrm;
end;
$function$;

revoke execute on function public.notify_signup_webhook() from public, anon, authenticated;
revoke execute on function public.notify_lifecycle_via_http(text, uuid) from public, anon, authenticated;
revoke execute on function public.request_seat_sync(uuid) from public, anon, authenticated;

-- ─── 3. Adresses déjà connues d'une entreprise ───────────────────────

create or replace function public.known_recipient_emails(p_org uuid, p_emails text[])
returns text[]
language sql
stable
security definer
set search_path = ''
as $$
  with wanted as (
    select distinct lower(trim(e)) as e from unnest(p_emails) as e
  ),
  known as (
    select lower(trim(c.contact_email)) as e
      from public.clients c
     where c.organization_id = p_org and c.contact_email is not null
    union
    select lower(trim(x->>'email'))
      from public.clients c
     cross join lateral jsonb_array_elements(
       case when jsonb_typeof(c.extra_emails) = 'array' then c.extra_emails else '[]'::jsonb end
     ) as x
     where c.organization_id = p_org
    union
    select lower(trim(t.email))
      from public.technicians t
     where t.organization_id = p_org and t.email is not null
    union
    select lower(trim(s.legal_email))
      from public.organization_invoicing_settings s
     where s.organization_id = p_org and s.legal_email is not null
    union
    select lower(trim(x))
      from public.reports r
     cross join lateral regexp_split_to_table(coalesce(r.sent_to_email, ''), '[,;[:space:]]+') as x
     where r.organization_id = p_org
    union
    select lower(trim(x))
      from public.quotes q
     cross join lateral regexp_split_to_table(coalesce(q.sent_to_email, '') || ',' || coalesce(q.client_email, ''), '[,;[:space:]]+') as x
     where q.organization_id = p_org
    union
    select lower(trim(x))
      from public.invoices v
     cross join lateral regexp_split_to_table(coalesce(v.sent_to_email, '') || ',' || coalesce(v.client_email, ''), '[,;[:space:]]+') as x
     where v.organization_id = p_org
  )
  select coalesce(array_agg(w.e), '{}'::text[])
    from wanted w
   where w.e in (select k.e from known k where k.e <> '');
$$;

revoke all on function public.known_recipient_emails(uuid, text[]) from public, anon, authenticated;
grant execute on function public.known_recipient_emails(uuid, text[]) to service_role;

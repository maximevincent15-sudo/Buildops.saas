-- ═══════════════════════════════════════════════════════════
-- BuildOps — Migration 022 : Portail client
-- ═══════════════════════════════════════════════════════════
-- Permet à un client (entreprise cliente d'une PME maintenance) d'accéder
-- à un espace en ligne pour consulter ses rapports, factures et
-- interventions, et demander une nouvelle intervention.
--
-- Architecture :
-- - Table client_portal_tokens : token unique pour chaque accès
-- - 4 RPC SECURITY DEFINER pour l'accès anonyme (lecture filtrée par token)
-- - Pas de RLS classique sur la table tokens : seul le patron via son orga
--   peut la lire (RLS standard sur organization_id)

drop table if exists public.client_portal_tokens cascade;
create table public.client_portal_tokens (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  client_id       uuid not null references public.clients(id) on delete cascade,
  token           text not null unique,
  email_sent_to   text,
  expires_at      timestamptz not null default (now() + interval '90 days'),
  last_used_at    timestamptz,
  revoked_at      timestamptz,
  created_at      timestamptz not null default now(),
  created_by      uuid references auth.users(id) on delete set null
);

create index idx_portal_tokens_org on public.client_portal_tokens (organization_id);
create index idx_portal_tokens_client on public.client_portal_tokens (client_id);

alter table public.client_portal_tokens enable row level security;

create policy "portal_tokens_select_org"
  on public.client_portal_tokens for select
  to authenticated
  using (organization_id = public.current_user_organization_id());

create policy "portal_tokens_insert_org"
  on public.client_portal_tokens for insert
  to authenticated
  with check (organization_id = public.current_user_organization_id());

create policy "portal_tokens_update_org"
  on public.client_portal_tokens for update
  to authenticated
  using (organization_id = public.current_user_organization_id())
  with check (organization_id = public.current_user_organization_id());

create policy "portal_tokens_delete_org"
  on public.client_portal_tokens for delete
  to authenticated
  using (organization_id = public.current_user_organization_id());


-- ═══════════════════════════════════════════════════════════
-- RPC : valide le token et renvoie le contexte client
-- ═══════════════════════════════════════════════════════════
create or replace function public.client_portal_validate(in_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  tok public.client_portal_tokens;
  cli public.clients;
  org public.organizations;
begin
  select * into tok from public.client_portal_tokens
   where token = in_token
     and revoked_at is null
     and expires_at > now()
   limit 1;

  if tok.id is null then
    return jsonb_build_object('error', 'invalid_or_expired');
  end if;

  -- Met à jour last_used_at pour traçabilité
  update public.client_portal_tokens
     set last_used_at = now()
   where id = tok.id;

  select * into cli from public.clients where id = tok.client_id;
  select * into org from public.organizations where id = tok.organization_id;

  return jsonb_build_object(
    'success', true,
    'client_id', tok.client_id,
    'organization_id', tok.organization_id,
    'client_name', cli.name,
    'organization_name', org.name,
    'expires_at', tok.expires_at
  );
end;
$$;

grant execute on function public.client_portal_validate(text) to anon, authenticated;


-- ═══════════════════════════════════════════════════════════
-- RPC : récupère les rapports finalisés du client
-- ═══════════════════════════════════════════════════════════
create or replace function public.client_portal_reports(in_token text)
returns setof jsonb
language plpgsql
security definer
set search_path = public
as $$
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
      'checklist', r.checklist
    )
    from public.reports r
    join public.interventions i on i.id = r.intervention_id
   where i.client_id = tok.client_id
     and r.completed_at is not null
   order by r.completed_at desc nulls last;
end;
$$;

grant execute on function public.client_portal_reports(text) to anon, authenticated;


-- ═══════════════════════════════════════════════════════════
-- RPC : récupère les factures du client
-- ═══════════════════════════════════════════════════════════
create or replace function public.client_portal_invoices(in_token text)
returns setof jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  tok public.client_portal_tokens;
begin
  select * into tok from public.client_portal_tokens
   where token = in_token and revoked_at is null and expires_at > now() limit 1;
  if tok.id is null then return; end if;

  return query
    select jsonb_build_object(
      'id', inv.id,
      'reference', inv.reference,
      'issue_date', inv.issue_date,
      'due_date', inv.due_date,
      'status', inv.status,
      'total_ht', inv.total_ht,
      'total_vat', inv.total_vat,
      'total_ttc', inv.total_ttc,
      'amount_paid', inv.amount_paid,
      'paid_at', inv.paid_at,
      'pdf_url', inv.pdf_url,
      'site_name', inv.site_name
    )
    from public.invoices inv
   where inv.client_id = tok.client_id
     and inv.status <> 'draft'                -- on ne montre pas les brouillons
     and inv.status <> 'cancelled'            -- ni les annulées
   order by inv.issue_date desc;
end;
$$;

grant execute on function public.client_portal_invoices(text) to anon, authenticated;


-- ═══════════════════════════════════════════════════════════
-- RPC : récupère les interventions à venir du client
-- ═══════════════════════════════════════════════════════════
create or replace function public.client_portal_upcoming(in_token text)
returns setof jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  tok public.client_portal_tokens;
begin
  select * into tok from public.client_portal_tokens
   where token = in_token and revoked_at is null and expires_at > now() limit 1;
  if tok.id is null then return; end if;

  return query
    select jsonb_build_object(
      'id', i.id,
      'reference', i.reference,
      'site_name', i.site_name,
      'address', i.address,
      'equipment_types', i.equipment_types,
      'scheduled_date', i.scheduled_date,
      'technician_name', i.technician_name,
      'status', i.status
    )
    from public.interventions i
   where i.client_id = tok.client_id
     and i.status in ('a_planifier', 'planifiee', 'en_cours')
   order by coalesce(i.scheduled_date, '9999-12-31'::date) asc;
end;
$$;

grant execute on function public.client_portal_upcoming(text) to anon, authenticated;


-- ═══════════════════════════════════════════════════════════
-- RPC : crée une demande d'intervention depuis le portail
-- ═══════════════════════════════════════════════════════════
create or replace function public.client_portal_request_intervention(
  in_token        text,
  in_equipment    text,
  in_message      text,
  in_site_name    text default null,
  in_address      text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  tok public.client_portal_tokens;
  cli public.clients;
  new_intervention_id uuid;
  request_note text;
begin
  select * into tok from public.client_portal_tokens
   where token = in_token and revoked_at is null and expires_at > now() limit 1;
  if tok.id is null then
    return jsonb_build_object('error', 'invalid_or_expired');
  end if;

  if in_equipment is null or in_equipment = '' then
    return jsonb_build_object('error', 'equipment_required');
  end if;

  -- Vérifie le code équipement
  if in_equipment not in ('extincteurs', 'ria', 'desenfumage', 'ssi', 'extinction_auto') then
    return jsonb_build_object('error', 'equipment_invalid');
  end if;

  select * into cli from public.clients where id = tok.client_id;
  request_note := '🔔 Demande reçue via portail client le ' ||
                   to_char(now(), 'DD/MM/YYYY HH24:MI') ||
                   E'\n\n' ||
                   coalesce(in_message, '(pas de message)');

  insert into public.interventions (
    organization_id,
    client_id,
    client_name,
    site_name,
    address,
    equipment_type,
    equipment_types,
    priority,
    status,
    notes
  ) values (
    tok.organization_id,
    tok.client_id,
    cli.name,
    coalesce(in_site_name, ''),
    coalesce(in_address, cli.address),
    in_equipment,
    array[in_equipment],
    'normale',
    'a_planifier',
    request_note
  )
  returning id into new_intervention_id;

  return jsonb_build_object(
    'success', true,
    'intervention_id', new_intervention_id
  );
end;
$$;

grant execute on function public.client_portal_request_intervention(text, text, text, text, text) to anon, authenticated;

-- ═══════════════════════════════════════════════════════════
-- Contrats de maintenance — étape D : contrats dans le portail client
--
-- RPC client_portal_contracts(token) : contrats en cours (actifs ou
-- suspendus) du client du lien, avec sites couverts et prestations.
-- Même modèle que client_portal_invoices : SECURITY DEFINER, accès par
-- jeton valide uniquement, notes internes jamais exposées.
-- Idempotent.
-- ═══════════════════════════════════════════════════════════

create or replace function public.client_portal_contracts(in_token text)
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
      'id', c.id,
      'reference', c.reference,
      'title', c.title,
      'status', c.status,
      'start_date', c.start_date,
      'initial_months', c.initial_months,
      'tacit_renewal', c.tacit_renewal,
      'notice_months', c.notice_months,
      'billing_mode', c.billing_mode,
      'billing_frequency', c.billing_frequency,
      'revision_rate', c.revision_rate,
      'sites', coalesce((
        select jsonb_agg(jsonb_build_object('name', s.name, 'city', s.city) order by s.name)
          from public.contract_sites cs
          join public.sites s on s.id = cs.site_id
         where cs.contract_id = c.id
      ), '[]'::jsonb),
      'lines', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'description', l.description,
                 'quantity', l.quantity,
                 'unit_price_ht', l.unit_price_ht,
                 'vat_rate', l.vat_rate,
                 'frequency', l.frequency
               ) order by l.position)
          from public.contract_lines l
         where l.contract_id = c.id
      ), '[]'::jsonb)
    )
    from public.contracts c
   where c.client_id = tok.client_id
     and c.organization_id = tok.organization_id
     and c.status in ('active', 'suspended')
   order by c.start_date desc;
end;
$$;

revoke all on function public.client_portal_contracts(text) from public;
grant execute on function public.client_portal_contracts(text) to anon, authenticated;

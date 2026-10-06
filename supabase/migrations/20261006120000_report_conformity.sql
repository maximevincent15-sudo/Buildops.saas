-- ═══════════════════════════════════════════════════════════
-- Conformité figée des rapports
--
-- Le PDF calculait la conformité avec les verdicts équipement par équipement,
-- alors que le portail client et l'historique ne regardaient que la checklist
-- globale (vide dans un rapport fait équipement par équipement) : un rapport
-- « NON CONFORME » sur le PDF pouvait s'afficher « CONFORME » au client.
--
-- L'app enregistre désormais le résultat à la finalisation ; le portail et
-- l'historique le lisent tel quel. Idempotent.
-- ═══════════════════════════════════════════════════════════

alter table public.reports
  add column if not exists is_conform boolean,
  add column if not exists anomaly_count integer;

-- Reprise des rapports déjà finalisés :
-- anomalies = points NOK de la checklist + équipements à surveiller / à réformer
with counts as (
  select
    r.id,
    (select count(*)
       from jsonb_array_elements(
              case when jsonb_typeof(r.checklist) = 'array' then r.checklist else '[]'::jsonb end
            ) e
      where e->>'value' = 'nok') as nok,
    (select count(*)
       from public.equipment_checks ec
      where ec.intervention_id = r.intervention_id
        and ec.verdict in ('surveiller', 'reformer')) as unit_anomalies
  from public.reports r
  where r.completed_at is not null
    and r.anomaly_count is null
)
update public.reports r
   set anomaly_count = c.nok + c.unit_anomalies,
       is_conform = (c.nok + c.unit_anomalies = 0)
  from counts c
 where c.id = r.id;

-- Portail client : expose la conformité figée
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
      'checklist', r.checklist,
      'is_conform', r.is_conform,
      'anomaly_count', r.anomaly_count
    )
    from public.reports r
    join public.interventions i on i.id = r.intervention_id
   where i.client_id = tok.client_id
     and r.completed_at is not null
   order by r.completed_at desc nulls last;
end;
$$;

grant execute on function public.client_portal_reports(text) to anon, authenticated;

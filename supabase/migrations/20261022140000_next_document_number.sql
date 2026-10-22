-- ============================================================================
-- Firovia — Choisir le prochain numéro de devis / de facture
-- ============================================================================
-- Une entreprise qui arrive d'un autre logiciel (MEG, Sage…) continue sa
-- numérotation : si son dernier devis était DEV-2026-0153, le prochain créé
-- dans Firovia sera DEV-2026-0154. Le compteur est celui de l'année en cours
-- (organization_year_counters, incrémenté par les triggers de référence).
--
-- Garde-fous :
--   - administrateur de l'organisation uniquement ;
--   - devis : on ne peut qu'avancer (jamais réutiliser un numéro déjà pris) ;
--   - factures : seulement tant qu'aucune facture n'existe cette année dans
--     Firovia (la numérotation des factures doit rester continue).
-- ============================================================================

create or replace function public.set_next_document_number(p_kind text, p_next int)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_org  uuid;
  caller_role text;
  yr          int := extract(year from current_date)::int;
  cur         bigint;
begin
  select organization_id, user_role into caller_org, caller_role
    from public.profiles
   where id = auth.uid();

  if caller_org is null then
    return jsonb_build_object('error', 'not_authenticated');
  end if;
  if coalesce(caller_role, 'admin') <> 'admin' then
    return jsonb_build_object('error', 'not_admin');
  end if;
  if p_kind not in ('quote', 'invoice') then
    return jsonb_build_object('error', 'bad_kind');
  end if;
  if p_next is null or p_next < 1 or p_next > 999999 then
    return jsonb_build_object('error', 'bad_number');
  end if;

  insert into public.organization_year_counters (organization_id, year)
  values (caller_org, yr)
  on conflict (organization_id, year) do nothing;

  if p_kind = 'quote' then
    select quotes_counter into cur
      from public.organization_year_counters
     where organization_id = caller_org and year = yr
     for update;
    if p_next <= cur then
      return jsonb_build_object('error', 'would_reuse', 'current', cur);
    end if;
    update public.organization_year_counters
       set quotes_counter = p_next - 1
     where organization_id = caller_org and year = yr;
  else
    if exists (
      select 1 from public.invoices
       where organization_id = caller_org
         and extract(year from issue_date)::int = yr
    ) then
      return jsonb_build_object('error', 'invoices_already_issued');
    end if;
    update public.organization_year_counters
       set invoices_counter = p_next - 1
     where organization_id = caller_org and year = yr;
  end if;

  return jsonb_build_object('ok', true, 'year', yr, 'next', p_next);
end;
$$;

revoke all on function public.set_next_document_number(text, int) from public, anon;
grant execute on function public.set_next_document_number(text, int) to authenticated;

comment on function public.set_next_document_number(text, int) is
  'Fixe le prochain numéro de devis ou de facture de l''année en cours (reprise de la numérotation d''un ancien logiciel)';

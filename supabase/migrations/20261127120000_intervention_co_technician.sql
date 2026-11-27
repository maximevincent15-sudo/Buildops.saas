-- ═══════════════════════════════════════════════════════════
-- Binôme : un équipier par intervention (interventions.co_technician_id)
--
-- Une intervention peut avoir un technicien principal ET un équipier.
-- L'équipier voit la visite dans son planning et sur son téléphone, peut
-- remplir le rapport, et le CA de la visite lui est aussi compté au pilotage.
--
-- - co_technician_id : FK vers technicians (mise à null si le technicien
--   est supprimé), différent du technicien principal ;
-- - co_technician_name : nom affiché (comme technician_name) ;
-- - déclencheur : refuse un équipier d'une autre organisation.
--
-- Droits : interventions a des droits de TABLE pour authenticated
-- (select/insert/update/delete, 20260916170000_grant_hardening.sql), aucun
-- droit par colonne : les nouvelles colonnes sont couvertes sans GRANT.
--
-- À lancer par Maxime :
--   cd ~/buildops-saas && supabase db query --linked -f supabase/migrations/20261127120000_intervention_co_technician.sql
--   supabase migration repair --status applied 20261127120000
-- Idempotent.
-- ═══════════════════════════════════════════════════════════

alter table public.interventions
  add column if not exists co_technician_id uuid references public.technicians(id) on delete set null,
  add column if not exists co_technician_name text;

create index if not exists idx_interventions_co_technician
  on public.interventions (co_technician_id);

-- L'équipier ne peut pas être aussi le technicien principal
alter table public.interventions
  drop constraint if exists interventions_co_technician_distinct;
alter table public.interventions
  add constraint interventions_co_technician_distinct
  check (co_technician_id is null or co_technician_id is distinct from technician_id);

-- L'équipier doit appartenir à la même organisation que l'intervention
-- (sinon la notification d'affectation partirait chez une autre entreprise)
create or replace function public.interventions_check_co_technician()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_org uuid;
begin
  if new.co_technician_id is null then
    return new;
  end if;
  if tg_op = 'UPDATE'
     and new.co_technician_id is not distinct from old.co_technician_id
     and new.organization_id is not distinct from old.organization_id then
    return new;
  end if;
  select t.organization_id into v_org
    from public.technicians t
   where t.id = new.co_technician_id;
  if v_org is null or v_org is distinct from new.organization_id then
    raise exception 'Équipier inconnu dans votre entreprise.'
      using errcode = '23503';
  end if;
  return new;
end;
$$;

-- Fonction de déclencheur : jamais appelée directement
revoke all on function public.interventions_check_co_technician() from public, anon, authenticated;

drop trigger if exists interventions_co_technician_org on public.interventions;
create trigger interventions_co_technician_org
  before insert or update of co_technician_id, organization_id on public.interventions
  for each row execute function public.interventions_check_co_technician();

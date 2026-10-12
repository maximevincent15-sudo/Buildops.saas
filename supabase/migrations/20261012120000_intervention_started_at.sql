-- ═══════════════════════════════════════════════════════════
-- 1. Heure d'arrivée sur place (interventions.started_at)
--    Notée automatiquement au passage en « en cours » (bouton Démarrer).
--    Sert au suivi du temps réel : temps sur place, temps de contrôle.
-- 2. Réparation des visites récurrentes créées sans leur site
--    (avant le correctif, la visite suivante perdait site, zones, durée et
--    consignes d'accès : la liste des équipements n'apparaissait pas).
-- Idempotent.
-- ═══════════════════════════════════════════════════════════

alter table public.interventions
  add column if not exists started_at timestamptz;

create or replace function public.interventions_set_started_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.status = 'en_cours'
     and old.status is distinct from 'en_cours'
     and new.started_at is null then
    new.started_at := now();
  end if;
  return new;
end;
$$;

-- Fonction de déclencheur : jamais appelée directement
revoke all on function public.interventions_set_started_at() from public, anon, authenticated;

drop trigger if exists interventions_started_at on public.interventions;
create trigger interventions_started_at
  before update of status on public.interventions
  for each row execute function public.interventions_set_started_at();

-- Visites récurrentes à venir créées sans leur site : on recopie depuis la visite parente
update public.interventions c
   set site_id                 = p.site_id,
       zone_ids                = coalesce(c.zone_ids, p.zone_ids),
       duration_minutes        = coalesce(c.duration_minutes, p.duration_minutes),
       slot                    = coalesce(c.slot, p.slot),
       start_time              = coalesce(c.start_time, p.start_time),
       chantier_address        = coalesce(c.chantier_address, p.chantier_address),
       chantier_postal_code    = coalesce(c.chantier_postal_code, p.chantier_postal_code),
       chantier_city           = coalesce(c.chantier_city, p.chantier_city),
       chantier_contact_name   = coalesce(c.chantier_contact_name, p.chantier_contact_name),
       chantier_contact_phone  = coalesce(c.chantier_contact_phone, p.chantier_contact_phone),
       chantier_access_parking = coalesce(c.chantier_access_parking, p.chantier_access_parking),
       chantier_access_digicode = coalesce(c.chantier_access_digicode, p.chantier_access_digicode),
       chantier_access_building = coalesce(c.chantier_access_building, p.chantier_access_building),
       chantier_access_hours   = coalesce(c.chantier_access_hours, p.chantier_access_hours)
  from public.interventions p
 where c.parent_intervention_id = p.id
   and c.auto_generated = true
   and c.site_id is null
   and p.site_id is not null
   and c.status in ('a_planifier', 'planifiee');

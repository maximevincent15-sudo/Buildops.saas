-- ═══════════════════════════════════════════════════════════════════════
-- Firovia — Migration : type d'intervention (préventive / corrective / …)
-- ═══════════════════════════════════════════════════════════════════════
--
-- Ajoute un champ `intervention_type` sur `interventions` pour distinguer :
--   • preventive           — Maintenance préventive (contrôle annuel APSAD)
--   • corrective           — Maintenance corrective (réparation, remplacement)
--   • installation         — Nouvelle installation
--   • depannage            — Dépannage urgent
--   • verification_contrat — Vérification contractuelle (bureau de contrôle)
--   • autre                — Non catégorisé
--
-- Idempotent : add column if not exists + backfill 'preventive'.
-- ═══════════════════════════════════════════════════════════════════════

begin;

alter table public.interventions
  add column if not exists intervention_type text not null default 'preventive';

-- Contrainte de valeurs autorisées
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'interventions_intervention_type_check'
  ) then
    alter table public.interventions
      add constraint interventions_intervention_type_check
      check (intervention_type in (
        'preventive', 'corrective', 'installation',
        'depannage', 'verification_contrat', 'autre'
      ));
  end if;
end $$;

-- Backfill : les vieilles interventions sans type restent 'preventive'
-- (comportement historique implicite de Firovia)
update public.interventions
   set intervention_type = 'preventive'
 where intervention_type is null;

commit;

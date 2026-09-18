-- ═══════════════════════════════════════════════════════════════════════
-- Firovia — Migration : signature client — statut + note
-- ═══════════════════════════════════════════════════════════════════════
--
-- Aujourd'hui `reports` a juste `signed_by_name` + `signature_data_url`.
-- Un rapport sans signature dessinée était affiché comme "aucune signature
-- enregistrée" en pied de rapport, sans distinction entre :
--   • Client absent au moment de l'intervention
--   • Client présent mais refusant de signer
--   • Signature non requise (contrat, régie interne…)
--
-- On ajoute :
--   • signature_status text — 'signed' / 'client_absent' / 'client_refused'
--                              / 'not_required' / 'pending'
--   • signature_note text   — motif ou contexte optionnel
--
-- Idempotent : add column if not exists.
-- ═══════════════════════════════════════════════════════════════════════

begin;

alter table public.reports
  add column if not exists signature_status text not null default 'pending';

alter table public.reports
  add column if not exists signature_note text;

-- Contrainte de valeurs autorisées
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'reports_signature_status_check'
  ) then
    alter table public.reports
      add constraint reports_signature_status_check
      check (signature_status in (
        'pending', 'signed', 'client_absent', 'client_refused', 'not_required'
      ));
  end if;
end $$;

-- Backfill : un rapport avec signature dessinée est considéré 'signed'
update public.reports
   set signature_status = 'signed'
 where signature_data_url is not null
   and signature_status = 'pending';

commit;

-- ═══════════════════════════════════════════════════════════════════════
-- Vérification :
--   select signature_status, count(*) from public.reports group by 1;
-- ═══════════════════════════════════════════════════════════════════════

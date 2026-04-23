-- ═══════════════════════════════════════════════════════════
-- BuildOps — Migration 017 : correction données incohérentes
-- ═══════════════════════════════════════════════════════════
-- Avant ce commit, quand on éditait une intervention pour ajouter
-- une date prévue, le statut restait "a_planifier". Résultat :
-- le bouton d'action affichait encore "Ajouter une date" et on ne
-- pouvait pas démarrer le rapport.
--
-- On corrige une fois pour toutes les données en base : toute
-- intervention avec une date prévue mais encore en "a_planifier"
-- passe à "planifiee" pour retrouver le bon workflow.

update public.interventions
   set status = 'planifiee'
 where status = 'a_planifier'
   and scheduled_date is not null;

-- Ne touche pas aux statuts 'en_cours', 'terminee', 'brouillon'
-- (ils sont déjà dans le workflow avancé).

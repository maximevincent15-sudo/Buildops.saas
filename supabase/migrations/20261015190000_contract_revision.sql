-- ═══════════════════════════════════════════════════════════
-- Contrats de maintenance — étape C : révision annuelle du prix
--
-- contracts.last_revised_period : début de la période (anniversaire) pour
-- laquelle la révision a été appliquée aux prix des prestations. Une
-- révision n'est proposée qu'une fois par période.
-- Idempotent. RLS inchangée.
-- ═══════════════════════════════════════════════════════════

alter table public.contracts
  add column if not exists last_revised_period date;

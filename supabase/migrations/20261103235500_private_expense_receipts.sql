-- ═══════════════════════════════════════════════════════════
-- Justificatifs de dépenses en accès privé
--
-- À lancer APRÈS la mise en ligne du code qui ouvre les fichiers par lien
-- temporaire : sinon les justificatifs déjà enregistrés ne s'affichent
-- plus. Les règles du bucket limitent déjà la lecture à l'entreprise
-- (expense_receipts_select_own). Idempotent.
-- ═══════════════════════════════════════════════════════════

update storage.buckets set public = false where id = 'expense-receipts';

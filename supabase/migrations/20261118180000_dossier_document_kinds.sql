-- ═══════════════════════════════════════════════════════════
-- Documents de dossier : nouveaux types
--
-- L'import de documents classe automatiquement les fichiers d'un dossier
-- (devis, accusé de réception de commande, bon de livraison, bon de
-- commande du client, CGV, facture…). On ajoute ces types à la liste.
-- Idempotent.
-- ═══════════════════════════════════════════════════════════

alter table public.dossier_documents
  drop constraint if exists dossier_documents_kind_check;

alter table public.dossier_documents
  add constraint dossier_documents_kind_check
  check (kind in (
    'quote', 'order_ack', 'purchase_order', 'delivery_note', 'invoice', 'terms',
    'plan', 'certificate', 'report', 'photo', 'other'
  ));

-- ═══════════════════════════════════════════════════════════
-- Firovia — Autoriser les PDF dans le bucket report-photos
-- ═══════════════════════════════════════════════════════════
-- Bug constaté le 22/06/2026 : la finalisation d'un rapport
-- échoue avec "new row violates row-level security policy"
-- car le bucket n'autorisait que les images, alors qu'on y
-- uploade aussi les PDF de rapport générés par React PDF.
--
-- Fix : ajouter 'application/pdf' à la liste des MIME types
-- autorisés du bucket existant 'report-photos'.

update storage.buckets
set allowed_mime_types = array[
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
  'application/pdf'
]
where id = 'report-photos';

-- Note : Si plus tard on veut séparer photos et PDF dans des
-- buckets distincts (pour clarté ou sécurité granulaire), créer
-- un nouveau bucket 'report-pdfs' avec ses propres policies.
-- Pour l'instant, on reste simple : un seul bucket.

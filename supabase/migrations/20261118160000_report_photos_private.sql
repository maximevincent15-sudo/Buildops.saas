-- ═══════════════════════════════════════════════════════════
-- Photos de visite en accès privé (bucket « report-photos »)
--
-- Jusqu'ici, une photo s'ouvrait par son lien public (non devinable).
-- Désormais, l'app demande un lien temporaire signé (une heure), réservé
-- aux membres de l'entreprise : la règle « report_photos_select_own »
-- (dossier = entreprise) existe déjà depuis la migration 20261030140000.
-- Les fichiers restent où ils sont ; les adresses en base aussi (l'app en
-- tire le chemin pour demander le lien).
--
-- À lancer APRÈS la mise en ligne du code qui affiche les photos par lien
-- temporaire (sinon les photos ne s'afficheraient plus). Idempotent.
-- ═══════════════════════════════════════════════════════════

update storage.buckets
   set public = false
 where id = 'report-photos';

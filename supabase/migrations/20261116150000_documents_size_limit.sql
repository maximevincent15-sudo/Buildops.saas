-- ═══════════════════════════════════════════════════════════
-- Documents privés : limite de taille portée de 10 à 50 Mo
--
-- Le « PDF complet avec photos » d'une visite (toutes les photos de
-- tous les appareils) dépasse vite 10 Mo : une visite de 30 appareils
-- avec une centaine de photos fait déjà environ 10 Mo. 50 Mo laisse
-- de la marge (environ 400 photos). Les autres buckets ne changent pas.
-- Idempotent.
-- ═══════════════════════════════════════════════════════════

update storage.buckets
set file_size_limit = 52428800  -- 50 Mo (50 * 1024 * 1024 octets)
where id = 'documents';

-- Vérification : 52428800 attendu
select id, file_size_limit from storage.buckets where id = 'documents';

-- ═══════════════════════════════════════════════════════════
-- Firovia — Limite de taille des fichiers uploadés (10 Mo)
-- ═══════════════════════════════════════════════════════════
-- Défense en profondeur : en plus de la limite client (storage.ts),
-- on impose une limite server-side sur le bucket report-photos.
-- Un attaquant qui contournerait le client sera bloqué par Supabase.

update storage.buckets
set file_size_limit = 10485760  -- 10 Mo (10 * 1024 * 1024 bytes)
where id = 'report-photos';

-- Firovia — Migration 024 : Rendre profiles.organization_id NULLABLE
--
-- Problème : la migration initiale a posé NOT NULL sur profiles.organization_id.
-- Cette contrainte empêche le soft-remove d'un membre (qui passe org_id à NULL
-- pour révoquer son accès tout en conservant son auth.users et ses données passées).
--
-- Solution : drop la contrainte NOT NULL.
--
-- Impact :
--  - Signup classique : crée toujours une organisation personnelle (trigger),
--    donc org_id est setté à la création
--  - Signup via invitation : org_id est setté immédiatement à l'acceptation
--  - Soft remove : org_id = NULL pour les membres retirés
--
-- RLS : aucun impact négatif.
--   - listMembers() filtre par organization_id = current_user_organization_id()
--   - Un profile sans org (NULL) ne match aucune org → pas listé
--   - current_user_organization_id() retourne NULL si pas d'org → l'user retiré
--     ne voit aucune donnée d'aucune org (parfait pour la sécurité)

alter table public.profiles
  alter column organization_id drop not null;

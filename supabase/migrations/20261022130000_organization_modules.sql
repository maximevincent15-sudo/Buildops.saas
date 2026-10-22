-- ============================================================================
-- Firovia — Modules affichés (« mode terrain »)
-- ============================================================================
-- Retour Alert'Incendie : « logiciel trop poussé », leur gestion (devis,
-- factures) reste dans leur logiciel (Sage…). Chaque organisation peut
-- masquer les modules qu'elle n'utilise pas : le menu et les boutons qui y
-- mènent disparaissent. Aucune donnée n'est supprimée.
-- Colonne ajoutée à une table existante : pas de nouveau GRANT nécessaire.
-- ============================================================================

alter table public.organizations
  add column if not exists disabled_modules text[] not null default '{}';

alter table public.organizations
  drop constraint if exists organizations_disabled_modules_known;
alter table public.organizations
  add constraint organizations_disabled_modules_known
  check (disabled_modules <@ array['devis', 'factures', 'catalogue', 'contrats']::text[]);

comment on column public.organizations.disabled_modules is
  'Modules masqués dans l''application (devis, factures, catalogue, contrats) — « mode terrain »';

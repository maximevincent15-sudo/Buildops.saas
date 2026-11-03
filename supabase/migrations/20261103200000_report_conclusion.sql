-- ═══════════════════════════════════════════════════════════
-- Texte libre du technicien sur le rapport
--
-- En plus des observations : les non-conformités constatées et la
-- conclusion, imprimées sur le rapport PDF (annexe 2 et conclusion générale
-- du compte rendu classique). Colonnes ajoutées à une table existante : pas
-- de nouveau GRANT nécessaire. Idempotent.
-- ═══════════════════════════════════════════════════════════

alter table public.reports
  add column if not exists conclusion text,
  add column if not exists nonconformities text;

comment on column public.reports.conclusion is 'Conclusion rédigée par le technicien';
comment on column public.reports.nonconformities is 'Non-conformités constatées, rédigées par le technicien';

-- ============================================================================
-- Firovia — Identification des équipements sur place
-- ============================================================================
-- Retours prospects (Alert'Incendie, ALES, Mont-Blanc) : sur le terrain, le
-- technicien doit savoir de quel extincteur ou de quelle porte coupe-feu on
-- parle. On ajoute :
--   - une photo de repérage (l'appareil dans son environnement) ;
--   - les caractéristiques propres à chaque famille (degré d'une porte
--     coupe-feu, agent et capacité d'un extincteur, diamètre d'un RIA…),
--     stockées en JSON pour ne pas multiplier les colonnes.
-- Colonnes ajoutées à une table existante : pas de nouveau GRANT nécessaire.
-- ============================================================================

alter table public.equipment_units
  add column if not exists photo_path text,
  add column if not exists photo_url text,
  add column if not exists attributes jsonb not null default '{}'::jsonb;

alter table public.equipment_units
  drop constraint if exists equipment_units_attributes_object;
alter table public.equipment_units
  add constraint equipment_units_attributes_object check (jsonb_typeof(attributes) = 'object');

comment on column public.equipment_units.photo_path is 'Chemin Storage (bucket report-photos) de la photo de repérage';
comment on column public.equipment_units.photo_url is 'URL publique de la photo de repérage';
comment on column public.equipment_units.attributes is 'Caractéristiques propres à la famille (ex. {"degre": "EI 60 (CF 1 h)", "vantaux": "2 vantaux"})';

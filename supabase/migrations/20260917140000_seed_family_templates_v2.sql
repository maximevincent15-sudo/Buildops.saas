-- ═══════════════════════════════════════════════════════════════════════
-- Firovia — Seed V2 des 7 templates APSAD (checklists métier détaillées)
-- ═══════════════════════════════════════════════════════════════════════
--
-- Remplace les checklists génériques (5-8 items) par les vraies listes de
-- points de contrôle conformes aux référentiels sectoriels français :
--   • Extincteurs        — 15 items (APSAD R4 · NF EN 3)
--   • RIA                — 15 items (APSAD R5 · NF EN 671-1/3)
--   • BAES               — 12 items (NF C 71-800 · NF EN 60598-2-22)
--   • Portes coupe-feu   — 10 items (Arrêté 25/06/1980 · NF S 61-937)
--   • Désenfumage        — 15 items (APSAD R17 · NF S 61-932)
--   • Détection incendie — 15 items (APSAD R7 · NF S 61-950)
--   • Colonnes sèches    — 10 items (NF S 61-750/759)
--
-- Total : 92 items métier réels (contre 42 aujourd'hui).
--
-- Idempotent : delete puis insert des 7 templates.
-- ═══════════════════════════════════════════════════════════════════════

begin;

-- Cleanup safe des 7 templates
delete from public.family_templates
where family in (
  'extincteurs', 'ria', 'baes', 'portes_cf',
  'desenfumage', 'detection', 'colonnes_seches'
);

-- ─── EXTINCTEURS (APSAD R4 · NF EN 3) — 15 items ────────────────────
insert into public.family_templates (
  family, name, reference_code, standard_ref, checklist, observation_types
) values (
  'extincteurs',
  'Contrôle extincteurs mobiles — Vérification annuelle',
  'APSAD R4',
  'NF EN 3-7 · NF EN 3-10',
  '[
    {"id":"emplacement","label":"Emplacement conforme au plan de sécurité"},
    {"id":"signaletique","label":"Signalisation présente et lisible (pictogramme, hauteur)"},
    {"id":"accessibilite","label":"Accessibilité dégagée (aucun obstacle 1 m devant)"},
    {"id":"fixation","label":"Fixation murale solide, support intact"},
    {"id":"etat_general","label":"État général du corps (absence corrosion, chocs, déformation)"},
    {"id":"etiquette_id","label":"Étiquette d''identification lisible (marque, modèle, date fabrication)"},
    {"id":"plombage","label":"Plombage de sécurité intact"},
    {"id":"goupille","label":"Goupille de sécurité présente et libre"},
    {"id":"manometre","label":"Manomètre en zone verte (pression conforme)", "helper":"Pour appareils à pression permanente uniquement"},
    {"id":"pesee","label":"Poids ou pesée conforme (< 5% pour poudre, < 10% pour CO2)"},
    {"id":"tuyau","label":"Tuyau d''aspersion / diffuseur sans craquelure ni pliure"},
    {"id":"lance","label":"Lance / gâchette fonctionnelle et propre"},
    {"id":"joint_bouchon","label":"État du joint de cuve et du joint de bouchon"},
    {"id":"date_epreuve","label":"Épreuve décennale à jour (à réformer à 10 ans si eau/pré-mélange)"},
    {"id":"etiquette_maintenance","label":"Étiquette de vérification annuelle apposée (date + prestataire)"}
  ]'::jsonb,
  '["Néant","Remplacement complet","Recharge à prévoir","Épreuve décennale à programmer","Manomètre hors zone verte","Plombage refait","Goupille remplacée","Support à repositionner","Étiquette illisible remplacée","Réforme (âge > 20 ans)"]'::jsonb
);

-- ─── RIA (APSAD R5 · NF EN 671-1/3) — 15 items ──────────────────────
insert into public.family_templates (
  family, name, reference_code, standard_ref, checklist, observation_types
) values (
  'ria',
  'Contrôle Robinets Incendie Armés — Vérification annuelle',
  'APSAD R5',
  'NF EN 671-1 · NF EN 671-3',
  '[
    {"id":"emplacement","label":"Emplacement conforme (à moins de 6 m d''une porte, couverture du local)"},
    {"id":"signaletique","label":"Signalisation ''RIA'' visible et normalisée"},
    {"id":"accessibilite","label":"Accessibilité dégagée (aucun stockage devant le poste)"},
    {"id":"coffret","label":"État général du coffret ou de la niche (pas de rouille, porte fonctionnelle)"},
    {"id":"vanne_arret","label":"Vanne d''arrêt en position ouverte et opérante"},
    {"id":"pression_statique","label":"Pression d''eau statique conforme (2,5 à 4,5 bars)"},
    {"id":"devidoir","label":"Intégrité du dévidoir, rotation libre sans grippage"},
    {"id":"tuyau","label":"Tuyau semi-rigide sans coupure, craquelure ni pliure permanente"},
    {"id":"longueur","label":"Longueur du tuyau conforme (20 à 30 m selon type)"},
    {"id":"raccord","label":"Raccord robinet-tuyau étanche, joints en état"},
    {"id":"lance","label":"Lance-diffuseur : jet plein / diffusé / arrêt fonctionnels"},
    {"id":"essai_eau","label":"Essai de mise en eau réussi (pression dynamique maintenue)"},
    {"id":"debit","label":"Débit à la lance conforme (≥ 60 L/min sous 2 bars minimum)"},
    {"id":"purge","label":"Purge / vidange effectuée après essai (anti-gel si extérieur)"},
    {"id":"etiquette","label":"Étiquette de contrôle annuel apposée (date + signataire)"}
  ]'::jsonb,
  '["Néant","Pression insuffisante","Débit non conforme","Tuyau à remplacer","Épreuve décennale à prévoir","Fuite au raccord","Vanne à graisser","Joint remplacé","Lance à remplacer","Coffret repeint"]'::jsonb
);

-- ─── BAES (NF C 71-800 · EN 60598-2-22) — 12 items ──────────────────
insert into public.family_templates (
  family, name, reference_code, standard_ref, checklist, observation_types
) values (
  'baes',
  'Contrôle Blocs Autonomes d''Éclairage de Sécurité — Vérification annuelle',
  'NF C 71-800',
  'NF C 71-800 · NF EN 60598-2-22',
  '[
    {"id":"emplacement","label":"Emplacement conforme au plan d''évacuation (< 15 m et changements de direction)"},
    {"id":"voyant_secteur","label":"Voyant de contrôle allumé (LED verte - présence tension secteur)"},
    {"id":"etiquette_id","label":"Étiquette d''identification lisible (marque, référence, date mise en service)"},
    {"id":"fixation","label":"Fixation murale ou plafond solide, absence de fissure"},
    {"id":"diffuseur","label":"Diffuseur / vasque en bon état (pas de fissure, pas de décoloration)"},
    {"id":"pictogramme","label":"Pictogramme d''évacuation visible et conforme (NF EN ISO 7010)"},
    {"id":"essai_sati","label":"Essai fonctionnel via SATI ou test manuel (LED s''allume à pleine puissance)"},
    {"id":"autonomie","label":"Autonomie batterie ≥ 1 h en cas de coupure secteur"},
    {"id":"etancheite_ip","label":"Étanchéité conforme à l''environnement (IP44 minimum en extérieur)"},
    {"id":"proprete","label":"Absence de dépôt de poussière obstruant le diffuseur"},
    {"id":"cohérence_effectif","label":"Cohérence entre nombre de BAES et effectif du bâtiment (registre)"},
    {"id":"etiquette","label":"Étiquette de contrôle annuel apposée"}
  ]'::jsonb,
  '["Néant","Batterie à remplacer","BAES à remplacer (âge > 4 ans)","Pictogramme illisible remplacé","Diffuseur nettoyé","Fixation resserrée","Test SATI échoué","Autonomie < 1 h","BAES ajouté au registre"]'::jsonb
);

-- ─── PORTES COUPE-FEU (Arrêté 25/06/1980 · NF S 61-937) — 10 items ──
insert into public.family_templates (
  family, name, reference_code, standard_ref, checklist, observation_types
) values (
  'portes_cf',
  'Contrôle Portes Coupe-Feu — Vérification annuelle',
  'Arrêté du 25/06/1980',
  'NF S 61-937 · NF EN 1634-1',
  '[
    {"id":"signaletique","label":"Signalisation ''Porte coupe-feu — ne pas obstruer'' présente"},
    {"id":"cadre","label":"Encadrement / cadre en bon état (fissure, jeu conforme < 3 mm)"},
    {"id":"joints","label":"Joints intumescents périphériques en place et non endommagés"},
    {"id":"ferme_porte","label":"Ferme-porte fonctionnel — refermeture complète autonome"},
    {"id":"vitesse","label":"Vitesse de fermeture réglée (5 à 8 secondes)"},
    {"id":"retenue","label":"Retenue magnétique fonctionnelle (asservissement SSI si présente)"},
    {"id":"serrure","label":"Serrure / verrou permet ouverture en poussée manuelle (pas de blocage)"},
    {"id":"cale","label":"Aucune cale ou objet maintenant la porte ouverte"},
    {"id":"calfeutrement","label":"Étanchéité des passages de câbles et gaines (calfeutrement conforme)"},
    {"id":"etiquette","label":"Étiquette de contrôle annuel apposée (date + signataire)"}
  ]'::jsonb,
  '["Néant","Ferme-porte à régler","Ferme-porte à remplacer","Joints remplacés","Cale retirée + information client","Retenue magnétique en défaut","Calfeutrement refait","Serrure à graisser","Porte à remettre en service"]'::jsonb
);

-- ─── DÉSENFUMAGE (APSAD R17 · NF S 61-932) — 15 items ───────────────
insert into public.family_templates (
  family, name, reference_code, standard_ref, checklist, observation_types
) values (
  'desenfumage',
  'Contrôle Désenfumage — Vérification annuelle',
  'APSAD R17',
  'NF S 61-932 · IT 246',
  '[
    {"id":"emplacement","label":"Emplacement des exutoires / DENFC conforme au plan de désenfumage"},
    {"id":"surface","label":"Surface libre géométrique conforme au calcul de désenfumage"},
    {"id":"etat_exutoire","label":"État général des exutoires / trappes (pas d''oxydation, verrière intacte)"},
    {"id":"obstruction","label":"Absence d''obstruction sur la course d''ouverture (câbles, matériel)"},
    {"id":"ouverture_manuelle","label":"Ouverture manuelle de secours fonctionnelle (essai réel)"},
    {"id":"fermeture","label":"Fermeture complète après essai (retour position OK)"},
    {"id":"commande_elec","label":"Commande électrique (boîtier BAAS ou déclencheur) fonctionnelle"},
    {"id":"signaletique","label":"Signalisation ''Ouverture désenfumage'' présente et lisible"},
    {"id":"amenee_air","label":"Amenées d''air (grilles basses, DAS) : absence d''obstruction"},
    {"id":"volets_ouverture","label":"Volets de désenfumage : essai d''ouverture depuis le tableau SSI"},
    {"id":"volets_fermeture","label":"Volets de désenfumage : fermeture après test"},
    {"id":"ventilateurs","label":"Ventilateurs de désenfumage : essai fonctionnel (démarrage, débit conforme)"},
    {"id":"gaines","label":"Étanchéité des gaines de désenfumage (calfeutrement)"},
    {"id":"asservissement","label":"Cohérence avec le SSI (asservissement de mise en sécurité)"},
    {"id":"etiquette","label":"Étiquette de contrôle annuel apposée (date + signataire)"}
  ]'::jsonb,
  '["Néant","Vérin à remplacer","Verrière remplacée","Obstruction retirée + information client","Commande électrique en défaut","Volet à recalibrer","Ventilateur à remplacer","Gaine à recalfeutrer","Asservissement SSI défectueux"]'::jsonb
);

-- ─── DÉTECTION INCENDIE (APSAD R7 · NF S 61-950) — 15 items ─────────
insert into public.family_templates (
  family, name, reference_code, standard_ref, checklist, observation_types
) values (
  'detection',
  'Contrôle Détection Incendie — Vérification annuelle',
  'APSAD R7',
  'NF S 61-950 · NF EN 54',
  '[
    {"id":"emplacement_ssi","label":"Emplacement du tableau SSI conforme (local sûr, accessible aux secours)"},
    {"id":"alim_secteur","label":"Alimentation secteur présente (voyant vert allumé)"},
    {"id":"batterie","label":"Batterie de secours : test de décharge (autonomie ≥ 12 h veille)"},
    {"id":"alarme_defaut","label":"Aucune alarme ni défaut actif au tableau"},
    {"id":"journal","label":"Journal historique consulté (aucun défaut récurrent)"},
    {"id":"nombre_detecteurs","label":"Nombre et implantation des détecteurs conformes au plan"},
    {"id":"etat_detecteurs","label":"État général des détecteurs (dépôt de poussière, capuchon en place)"},
    {"id":"essai_detecteurs","label":"Essai fonctionnel d''un échantillon de détecteurs (5% minimum, tirage aléatoire)"},
    {"id":"acces_dm","label":"Déclencheurs manuels (DM) : accessibilité et présence de la vitre"},
    {"id":"essai_dm","label":"Essai fonctionnel d''un échantillon de déclencheurs manuels (5%)"},
    {"id":"signaletique_dm","label":"Signalisation ''En cas d''incendie briser la vitre'' présente"},
    {"id":"audible","label":"Signal sonore d''évacuation audible partout dans le bâtiment"},
    {"id":"niveau_son","label":"Niveau sonore d''évacuation conforme (≥ 65 dB(A) au sol)"},
    {"id":"asservissements","label":"Asservissements SSI (portes CF, désenfumage, arrêt CVC) fonctionnels"},
    {"id":"etiquette","label":"Étiquette de contrôle annuel apposée + rapport de vérification établi"}
  ]'::jsonb,
  '["Néant","Détecteur à remplacer","Batterie à remplacer","DM à remplacer","Défaut ligne à investiguer","Nettoyage détecteurs effectué","Programmation SSI à ajuster","Asservissement défectueux","Signalisation refaite","Rapport de vérification remis au client"]'::jsonb
);

-- ─── COLONNES SÈCHES (NF S 61-750/759) — 10 items ───────────────────
insert into public.family_templates (
  family, name, reference_code, standard_ref, checklist, observation_types
) values (
  'colonnes_seches',
  'Contrôle Colonnes Sèches — Vérification annuelle',
  'NF S 61-750',
  'NF S 61-750 · NF S 61-759',
  '[
    {"id":"emplacement","label":"Emplacement conforme (accessible depuis la voie engins pompiers)"},
    {"id":"signaletique","label":"Signalisation ''Colonne sèche — pompiers'' présente et normalisée"},
    {"id":"raccord_facade","label":"Étanchéité des raccords d''alimentation extérieure (façade)"},
    {"id":"guillemin","label":"Raccords symétriques (Guillemin DN65) sans corrosion, bouchons présents"},
    {"id":"coffret","label":"Fixation murale du coffret d''alimentation extérieure solide"},
    {"id":"prise_niveau","label":"Prise d''incendie sur chaque niveau desservi : accessibilité et signalisation"},
    {"id":"vanne_niveau","label":"Vanne de niveau opérationnelle (ouverture/fermeture aisée)"},
    {"id":"essai_pression","label":"Étanchéité générale (essai de mise en charge à 16 bars pendant 15 min)"},
    {"id":"vidange","label":"Vidange automatique fonctionnelle après essai (anti-gel)"},
    {"id":"etiquette","label":"Étiquette de contrôle annuel apposée (date + signataire)"}
  ]'::jsonb,
  '["Néant","Bouchon Guillemin remplacé","Raccord à changer","Vanne à réviser","Étanchéité non conforme (essai KO)","Signalisation refaite","Vidange à déboucher","Épreuve pression décennale à programmer","Coffret repeint"]'::jsonb
);

commit;

-- ═══════════════════════════════════════════════════════════════════════
-- Vérification post-migration :
--   select family, name, reference_code,
--          jsonb_array_length(checklist) as nb_items,
--          jsonb_array_length(observation_types) as nb_obs
--   from public.family_templates
--   order by family;
--
-- Résultat attendu :
--   baes           | 12 items | 9 observations
--   colonnes_seches| 10       | 9
--   desenfumage    | 15       | 9
--   detection      | 15       | 10
--   extincteurs    | 15       | 10
--   portes_cf      | 10       | 9
--   ria            | 15       | 10
-- ═══════════════════════════════════════════════════════════════════════

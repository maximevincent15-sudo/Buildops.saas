-- ═══════════════════════════════════════════════════════════
-- Firovia — Seed des 6 templates APSAD restants
-- ═══════════════════════════════════════════════════════════
-- Idempotent : on delete puis insert pour les 6 familles.
-- Le template Extincteurs (R4) reste inchangé, il a été créé
-- lors de la migration 20260915120000_equipment_inventory.sql.


-- Cleanup safe des templates que l'on va (re)seeder
delete from public.family_templates
where family in ('ria', 'baes', 'portes_cf', 'desenfumage', 'detection', 'colonnes_seches');


-- ─── RIA (Robinet Incendie Armé) — APSAD R5 · NF EN 671-3 ────
insert into public.family_templates (
  family, name, reference_code, standard_ref, checklist, observation_types
) values (
  'ria',
  'Contrôle RIA (Robinet Incendie Armé)',
  'APSAD R5',
  'NF EN 671-3',
  '[
    {"id":"signaletique","label":"Signalétique en place et lisible"},
    {"id":"acces","label":"Accessibilité dégagée devant le RIA"},
    {"id":"dévidoir","label":"Intégrité du dévidoir et système de rotation"},
    {"id":"tuyau","label":"Tuyau sans coupure, sans craquelure, sans pincement"},
    {"id":"lance","label":"État de la lance et du diffuseur (mousse/jet)"},
    {"id":"raccord","label":"Raccords en bon état, joints présents"},
    {"id":"vanne","label":"Vanne d''isolement en position ouverte"},
    {"id":"pression","label":"Pression du réseau conforme (bar)"},
    {"id":"debit","label":"Débit à la lance conforme (min. 60 L/min)"},
    {"id":"etancheite","label":"Absence de fuite à tous les niveaux"},
    {"id":"deploiement","label":"Déploiement / enroulement fonctionnel"},
    {"id":"plombage","label":"Plombage / étiquette de contrôle apposée"}
  ]'::jsonb,
  '["Néant","Débit conforme","Pression insuffisante","Tuyau à remplacer","Épreuve décennale à prévoir","Fuite au raccord","Vanne à graisser","Joint remplacé"]'::jsonb
);


-- ─── BAES · Éclairage de sécurité — NF C 71-800 ─────────────
insert into public.family_templates (
  family, name, reference_code, standard_ref, checklist, observation_types
) values (
  'baes',
  'Contrôle BAES (Bloc Autonome d''Éclairage de Sécurité)',
  'NF C 71-800',
  'NF C 71-800',
  '[
    {"id":"presence","label":"Présence au bon emplacement (issue, cheminement, obstacle)"},
    {"id":"fixation","label":"Vérification des fixations et supports"},
    {"id":"capot","label":"Enlèvement du capot de protection translucide (contrôle)"},
    {"id":"puissance","label":"Prise par appareil de mesure de la puissance du BAES"},
    {"id":"source_sec","label":"Mesure de l''état d''usure de la source secondaire (batterie)"},
    {"id":"ampoules","label":"Témoin sur les ampoules et vérification de l''incandescence"},
    {"id":"nettoyage","label":"Nettoyage si nécessaire des parties translucides"},
    {"id":"ampoules_remp","label":"Remplacement d''ampoules si défectueuses"}
  ]'::jsonb,
  '["Néant","Ampoules remplacées","Bloc à remplacer (> 4 ans)","Capot cassé","Autonomie insuffisante","Batterie faible","Non fonctionnel"]'::jsonb
);


-- ─── Portes coupe-feu — APSAD R17 · NF EN 1634 ──────────────
insert into public.family_templates (
  family, name, reference_code, standard_ref, checklist, observation_types
) values (
  'portes_cf',
  'Contrôle porte coupe-feu',
  'APSAD R17',
  'NF EN 1634',
  '[
    {"id":"panneaux","label":"Examen du ou des panneaux (état, déformation)"},
    {"id":"paumelles","label":"Contrôle des paumelles (jeu, corrosion)"},
    {"id":"ferme_porte","label":"Tension du ou des ferme-portes"},
    {"id":"ventouses","label":"Ventouses électromagnétiques : câblage + branchement"},
    {"id":"electro_aimant_face","label":"Nettoyage de la face d''attraction de l''électro-aimant"},
    {"id":"electro_aimant_plaque","label":"Nettoyage de la plaque de retenue"},
    {"id":"joints","label":"État des joints intumescents (compartimentage)"},
    {"id":"chicane","label":"Examen de la chicane, butée et guides au sol"},
    {"id":"rails","label":"Nettoyage des rails de roulement (si coulissante)"},
    {"id":"detecteur","label":"Vérification des détecteurs ioniques associés"},
    {"id":"essai","label":"Essai de fermeture par déclenchement électromagnétique"},
    {"id":"signalisation","label":"Signalisation \"porte coupe-feu\" en place"}
  ]'::jsonb,
  '["Néant","Ferme-porte à régler","Joint intumescent HS","Ventouse à changer","Chicane manquante","Panneau déformé","Repeindre","Paumelles à graisser"]'::jsonb
);


-- ─── Désenfumage (exutoires / DENFC) — IT 246 · NF S 61-932 ─
-- Template générique regroupant les vérifications communes aux
-- exutoires, lanterneaux, châssis, volets et commandes CO².
insert into public.family_templates (
  family, name, reference_code, standard_ref, checklist, observation_types
) values (
  'desenfumage',
  'Contrôle désenfumage (exutoire / volet / commande)',
  'IT 246',
  'NF S 61-932',
  '[
    {"id":"ouverture","label":"Ouverture de l''appareil"},
    {"id":"ressorts","label":"Vérification de la tension des ressorts d''ouverture ou vérins"},
    {"id":"graissage","label":"Graissage des ressorts et pièces mobiles"},
    {"id":"articulations","label":"Vérification des articulations et points de fixation"},
    {"id":"joints","label":"Contrôle de l''état des joints"},
    {"id":"declenchement","label":"Réglage du système de déclenchement (mécanique + électrique)"},
    {"id":"fusibles","label":"Contrôle de l''état des fusibles thermiques"},
    {"id":"electro","label":"Nettoyage de la face d''attraction électro-aimant + plaque de retenue"},
    {"id":"contacts","label":"Vérification du bon fonctionnement des contacts de positionnement"},
    {"id":"fermeture","label":"Fermeture des appareils, contrôle enclenchement des gâches"},
    {"id":"vis","label":"Vérification et resserrage des vis de fixation"},
    {"id":"essai","label":"Essai d''ouverture en présence du service de sécurité"},
    {"id":"remise","label":"Remise en position d''attente après essais"}
  ]'::jsonb,
  '["Néant","Fusible thermique changé","Cartouche CO² fournie","Vérin à remplacer","Ressort détendu","Bris de glace remplacé","Nettoyage complet effectué","Câblage refait"]'::jsonb
);


-- ─── Détection incendie · SSI — APSAD R7 · NF S 61-931 ──────
insert into public.family_templates (
  family, name, reference_code, standard_ref, checklist, observation_types
) values (
  'detection',
  'Contrôle détection incendie / SSI',
  'APSAD R7',
  'NF S 61-931',
  '[
    {"id":"centrale","label":"Test de la centrale (voyants, alimentation secteur + batterie)"},
    {"id":"bris_glace","label":"Essai des boîtiers Bris de Glace (déclencheurs manuels)"},
    {"id":"buzzers","label":"Essai des buzzers / sirènes d''évacuation"},
    {"id":"repérage","label":"Repérage / listing du matériel actif en place"},
    {"id":"fin_ligne","label":"Vérification résistance fin de ligne sur dernier détecteur"},
    {"id":"branchements","label":"Vérification branchements électriques secteur + batterie secours"},
    {"id":"batterie","label":"Contrôle de la charge des batteries de secours"},
    {"id":"detecteurs","label":"Essai des détecteurs (fumée, chaleur) avec bombe test"},
    {"id":"asservissements","label":"Essai des asservissements (portes CF, désenfumage, alarme)"},
    {"id":"defaut_ligne","label":"Vérification affichage défaut ligne / alarme"},
    {"id":"remise","label":"Remise en situation de sécurité en présence du responsable"}
  ]'::jsonb,
  '["Néant","Batterie 3ème source remplacée","Détecteur défectueux à changer","Buzzer HS","Fusible remplacé","BBG démonté-remonté","Test complet OK","Défaut ligne signalé"]'::jsonb
);


-- ─── Colonnes sèches — NF S 61-750 ──────────────────────────
insert into public.family_templates (
  family, name, reference_code, standard_ref, checklist, observation_types
) values (
  'colonnes_seches',
  'Contrôle colonne sèche',
  'NF S 61-750',
  'NF S 61-750',
  '[
    {"id":"colonne","label":"Vérification générale de la colonne sèche"},
    {"id":"vanne","label":"Vérification de la vanne diamètre 65"},
    {"id":"pompe","label":"Branchement de la pompe sur le réseau d''eau commun"},
    {"id":"bouchons","label":"Vérification à chaque étage de la fermeture des bouchons"},
    {"id":"remplissage","label":"Remplissage de la colonne"},
    {"id":"etancheite_bouchons","label":"Vérification étanchéité bouchons diam 40 et 65"},
    {"id":"etancheite_vannes","label":"Vérification étanchéité des vannes"},
    {"id":"etancheite_soudures","label":"Vérification étanchéité des soudures"},
    {"id":"signaletique","label":"Vérification signalétique (raccord pompiers, plaques d''étage)"},
    {"id":"joints","label":"Remplacement systématique des joints en cas de fuite"},
    {"id":"filasses","label":"Remplacement des filasses si nécessaire"}
  ]'::jsonb,
  '["Néant","Bouchon remplacé","Joint remplacé","Vanne à changer","Signalétique refaite","Filasse remplacée","Épreuve hydraulique conforme","Fuite corrigée"]'::jsonb
);


-- ═══════════════════════════════════════════════════════════
-- FIN — 6 templates APSAD seedés
-- Total avec extincteurs (R4) : 7 familles opérationnelles.
-- ═══════════════════════════════════════════════════════════

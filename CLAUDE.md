# Firovia — application (app.firovia.fr)

Firovia est un logiciel en ligne pour les **entreprises françaises de maintenance (et d'installation) en sécurité incendie**, de 2 à 20 techniciens environ.

Activités couvertes : extincteurs, RIA, désenfumage, portes coupe-feu, BAES, colonnes sèches, détection / SSI.

Contexte commercial, prix et règles de formulation : skill `firovia` (`~/.claude/skills/firovia`).

## Logique du produit

Client → Site → Équipement → Intervention → Contrôle → Anomalie → Action corrective (devis, suite) → Échéance → Résolution → Rapport.

Toute nouvelle fonction se branche sur cette chaîne au lieu de créer un îlot isolé.

## Principes

- **Mobile d'abord pour les techniciens** (rapports, scan, journée) ; **ordinateur d'abord pour les gérants** (planning, devis, factures, pilotage).
- **Assez simple pour une entreprise qui quitte Excel et le papier.** Ne jamais ajouter de complexité sans valeur métier claire.
- **Réutiliser les composants existants** et **garder le design system** : Syne pour les titres, DM Sans pour le texte, accent `#3A5CA8`. Ne pas réinventer le style.
- **Ne pas inventer d'obligation réglementaire incendie.** **Ne jamais affirmer une conformité sans preuve.** Firovia n'est ni « conforme » ni « certifié » APSAD.
- Interface, messages et textes **en français**, sur le ton de l'existant : l'app tutoie l'utilisateur (« Tu as 4 rapports à finaliser »). Les documents envoyés aux clients finaux (rapports, devis, mails) restent au vouvoiement.

## Avant de coder

1. Lire les fichiers concernés (`src/features/<domaine>/`, `src/pages/`, `supabase/migrations/`).
2. Comprendre l'architecture en place : organisation par fonctionnalité, Zustand, react-hook-form + zod, Supabase.
3. Réutiliser les composants et les fonctions existants (`src/shared/`, `src/features/*/components`).
4. Repérer les régressions possibles : autres écrans qui utilisent le même code, droits administrateur / technicien, données existantes.
5. **Proposer le plan à Maxime et attendre son « go »** avant d'écrire le code.

## Après avoir codé

1. Vérifier les types : `npx tsc -b --noEmit`.
2. Lancer le lint : `npm run lint`. Il existe des erreurs anciennes : la règle est **aucune nouvelle erreur** (comparer avant / après).
3. Compiler : `npm run build`. Il n'y a pas encore de tests automatiques : vérifier dans le navigateur.
4. Vérifier sur **ordinateur** (`preview_start` « firovia-dev », port 5173).
5. Vérifier sur **mobile** (largeur 375).
6. Vérifier les **droits et la sécurité** : RLS, rôle `member` (technicien) contre `admin`, un compte ne voit jamais les données d'un autre.
7. Vérifier les états **vides, d'erreur et de chargement**.

Préfixer les commandes Node par `export PATH="$HOME/.nvm/versions/node/v24.15.0/bin:$PATH"`.

## Base de données (Supabase, projet `omqroiivaedafmwfeygt`, Paris)

- Chaque changement passe par un fichier dans `supabase/migrations/`. Pour l'appliquer :
  - `/opt/homebrew/bin/supabase db query --linked -f <fichier>` ;
  - puis `supabase migration repair --linked --status applied <version>`.
  - Ne jamais lancer `supabase db push`.
- Toute nouvelle table : RLS + `grant select, insert, update, delete … to authenticated` + `grant all … to service_role` dans la même migration.
- Tester les règles RLS dans `BEGIN … ROLLBACK` (avec `set_config('request.jwt.claims', …)` et `set local role authenticated`).
- Les écritures de **données** en production (UPDATE / INSERT / DELETE) passent par Maxime : préparer le fichier `.sql`, il le lance.
- Fonctions serveur : `supabase functions deploy <nom> --project-ref omqroiivaedafmwfeygt --use-api`.

## Publication et sécurité

- **Ne committer et pousser que sur « go publie ».** Jamais de force push. Un push sur `main` déploie sur Vercel.
- Ce dépôt est **public** : jamais de clé, de `.env`, ni de données de clients ou de prospects.
- Nouveau domaine appelé par le navigateur : l'ajouter à la CSP (`connect-src` dans `vercel.json`) et toucher `index.html` (commentaire daté) pour que les navigateurs prennent les nouveaux en-têtes.
- Le scanner ne lit que les QR codes. La connexion est protégée par Cloudflare Turnstile.

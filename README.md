# BuildOps — SaaS

Application de gestion pour les entreprises de maintenance en sécurité incendie (3 à 20 techniciens).

Gère les interventions (extincteurs, RIA, désenfumage, SSI), les rapports terrain mobiles et les fiches clients multi-sites.

## Stack

- **Build** : Vite 8 + React 19 + TypeScript (strict)
- **Style** : Tailwind CSS v3 + CSS variables (design system partagé avec la vitrine)
- **Routing** : React Router v7
- **State** : Zustand
- **Backend** : Supabase — auth, PostgreSQL, Storage, RLS multi-tenant
- **Forms** : react-hook-form + zod
- **Dates** : date-fns

## Démarrage

```bash
# Installer les dépendances
npm install

# Copier le template d'env et remplir avec les clés Supabase
cp .env.example .env.local

# Lancer le dev server
npm run dev
```

Le serveur Vite tournera sur http://localhost:5173.

## Scripts

| Commande | Description |
|---|---|
| `npm run dev` | Dev server avec HMR |
| `npm run build` | Build de production (`dist/`) |
| `npm run preview` | Preview du build |
| `npm run lint` | ESLint |

## Structure

```
src/
├── main.tsx          # Entry point (React + BrowserRouter)
├── App.tsx           # Définition des routes
├── index.css         # Tailwind + CSS variables du design system
├── vite-env.d.ts     # Typage des env vars (VITE_SUPABASE_*)
│
├── app/              # Setup global
│   └── layouts/
│       ├── PublicLayout.tsx     # /auth
│       └── DashboardLayout.tsx  # /dashboard et routes protégées
│
├── pages/            # Composants de route
│   ├── AuthPage.tsx
│   ├── DashboardPage.tsx
│   └── NotFoundPage.tsx
│
├── features/         # Modules métier self-contained (à créer)
│   ├── auth/         # Connexion / inscription Supabase
│   ├── planning/     # Module 1 — Planning des interventions
│   ├── rapports/     # Module 2 — Rapport mobile + PDF
│   └── clients/      # Module 3 — Fiches clients + sites
│
└── shared/           # Code partagé
    ├── ui/           # Primitives (Button, Input, Badge...) — à créer
    ├── lib/
    │   └── supabase.ts   # Client Supabase
    └── types/        # Types globaux (database, domain) — à créer
```

## Design system

Les couleurs et typographies sont définies en **CSS variables** dans `src/index.css` et exposées à Tailwind dans `tailwind.config.js`. Classes disponibles :

- `text-acc`, `text-ink`, `text-ink-2`, `text-ink-3`
- `bg-bg`, `bg-wht`, `bg-acc`, `bg-ink`
- `bg-grn-lt`, `bg-org-lt`, `bg-red-lt` (et leurs variantes sémantiques)
- `font-display` (Syne), `font-sans` (DM Sans)
- `rounded` (10px), `rounded-lg` (18px)

## Repos liés

- **Vitrine / marketing** : https://github.com/maximevincent15-sudo/Buildops-site
- **SaaS (ce repo)** : https://github.com/maximevincent15-sudo/Buildops.saas

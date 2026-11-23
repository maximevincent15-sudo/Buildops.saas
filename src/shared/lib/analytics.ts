type PostHogClient = (typeof import('posthog-js'))['default']

/**
 * Mesure d'usage de l'app (PostHog, région UE).
 *
 * Actif en production uniquement, et seulement si une clé est connue.
 * Vie privée :
 * - aucun cookie ni stockage dans le navigateur (persistence « memory ») ;
 * - aucun texte de l'écran ni saisie : seules les pages vues sont envoyées
 *   (pas de capture automatique des clics, pas d'enregistrement de session) ;
 * - les adresses sont nettoyées avant envoi (jetons, identifiants, n° de dossier,
 *   paramètres et #) ; l'utilisateur n'est connu que par son identifiant technique ;
 * - les requêtes passent par /relais (même domaine), aucun script n'est chargé
 *   depuis PostHog ; l'adresse IP n'est pas conservée (réglage du projet).
 */

// Clé publique par conception (projet Firovia, région UE). VITE_POSTHOG_KEY permet
// de la surcharger, ou de désactiver la mesure avec une valeur vide.
const DEFAULT_KEY = 'phc_vsPw7HjAvXjbVfDCoaUBXdtPKrHMLpTLTGqcahYrQ3MV'
const KEY = (import.meta.env.VITE_POSTHOG_KEY as string | undefined) ?? DEFAULT_KEY

type AnalyticsUser = { id: string; organizationId: string | null }

let posthog: PostHogClient | null = null
// Utilisateur connu avant la fin du chargement de PostHog (connexion rapide)
let pendingUser: AnalyticsUser | null | undefined

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi

/** Adresse sans jeton, identifiant, n° de dossier, paramètres ni #. */
export function scrubAnalyticsUrl(url: string): string {
  return url
    .replace(/[?#].*$/, '')
    .replace(/(\/(?:client|registre|e)\/)[^/]+/g, '$1:jeton')
    .replace(/(\/dossiers\/)[^/]+/g, '$1:numero')
    .replace(UUID, ':id')
}

/** Nettoie toute propriété qui contient une adresse (url, chemin, provenance). */
function scrubProperties(props: Record<string, unknown> | undefined): void {
  if (!props) return
  for (const key of Object.keys(props)) {
    const value = props[key]
    if (typeof value === 'string' && /(url|pathname|referrer|href)$/i.test(key)) props[key] = scrubAnalyticsUrl(value)
  }
}

export async function initAnalytics(): Promise<void> {
  if (!KEY || !import.meta.env.PROD) return
  const mod = await import('posthog-js')
  const client = mod.default
  client.init(KEY, {
    api_host: '/relais',
    ui_host: 'https://eu.posthog.com',
    persistence: 'memory',
    person_profiles: 'identified_only',
    capture_pageview: 'history_change',
    capture_pageleave: true,
    autocapture: false,
    rageclick: false,
    capture_heatmaps: false,
    capture_dead_clicks: false,
    capture_exceptions: false, // Sentry s'en charge
    capture_performance: false,
    disable_session_recording: true,
    disable_surveys: true,
    disable_product_tours: true,
    disable_web_experiments: true,
    advanced_disable_flags: true,
    disable_external_dependency_loading: true,
    respect_dnt: true,
    before_send: (event) => {
      if (!event) return null
      scrubProperties(event.properties)
      scrubProperties(event.$set as Record<string, unknown> | undefined)
      scrubProperties(event.$set_once as Record<string, unknown> | undefined)
      return event
    },
  })
  posthog = client
  if (pendingUser !== undefined) setAnalyticsUser(pendingUser)
}

/** Associe les pages vues à l'utilisateur connecté (identifiants techniques uniquement). */
export function setAnalyticsUser(user: AnalyticsUser | null): void {
  if (!posthog) {
    pendingUser = user
    return
  }
  if (user) posthog.identify(user.id, { organization_id: user.organizationId ?? 'aucune' })
  else posthog.reset()
}

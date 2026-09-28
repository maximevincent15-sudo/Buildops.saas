type SentryModule = typeof import('@sentry/react')

/**
 * Suivi des erreurs en production (Sentry, région UE).
 *
 * Inactif tant que VITE_SENTRY_DSN n'est pas défini, et toujours inactif en
 * développement. Vie privée : aucune collecte automatique (dataCollection),
 * seul l'identifiant technique de l'utilisateur et de son organisation est
 * joint ; les jetons présents dans les URL sont masqués avant envoi.
 */

const DSN = import.meta.env.VITE_SENTRY_DSN as string | undefined
// Chargé à la demande : le SDK n'est téléchargé que si le suivi est actif
let Sentry: SentryModule | null = null

/** Masque les jetons : /client/<token>, /registre/<token>, query string et #hash (liens de connexion). */
export function scrubUrl(url: string | undefined): string | undefined {
  if (!url) return url
  return url
    .replace(/(\/(?:client|registre)\/)[^/?#]+/g, '$1[jeton]')
    .replace(/[?#].*$/, '')
}

export async function initMonitoring(): Promise<void> {
  if (!DSN || !import.meta.env.PROD) return
  const mod = await import('@sentry/react')
  mod.init({
    dsn: DSN,
    environment: import.meta.env.MODE,
    // Aucune donnée personnelle collectée automatiquement (IP, cookies, en-têtes,
    // contenus de requêtes, paramètres d'URL) : seul l'id technique est ajouté.
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: false,
      httpBodies: [],
      urlQueryParams: false,
    },
    tracesSampleRate: 0,
    ignoreErrors: ['ResizeObserver loop limit exceeded', 'ResizeObserver loop completed with undelivered notifications'],
    beforeSend(event) {
      if (event.request) {
        event.request.url = scrubUrl(event.request.url)
        delete event.request.query_string
        delete event.request.cookies
      }
      return event
    },
    beforeBreadcrumb(crumb) {
      if (crumb.category === 'navigation' && crumb.data) {
        crumb.data.from = scrubUrl(crumb.data.from as string | undefined)
        crumb.data.to = scrubUrl(crumb.data.to as string | undefined)
      }
      if ((crumb.category === 'fetch' || crumb.category === 'xhr') && crumb.data) {
        crumb.data.url = scrubUrl(crumb.data.url as string | undefined)
      }
      return crumb
    },
  })
  Sentry = mod
}

/** Envoie une erreur attrapée (ErrorBoundary, try/catch critiques). */
export function captureError(error: unknown, extra?: Record<string, unknown>): void {
  Sentry?.captureException(error, extra ? { extra } : undefined)
}

/** Associe les erreurs à l'utilisateur connecté (identifiants techniques uniquement). */
export function setMonitoringUser(user: { id: string; organizationId: string | null } | null): void {
  if (!Sentry) return
  Sentry.setUser(user ? { id: user.id } : null)
  Sentry.setTag('organization_id', user?.organizationId ?? 'aucune')
}

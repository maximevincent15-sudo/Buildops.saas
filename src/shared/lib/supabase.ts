import { createClient } from '@supabase/supabase-js'
import { createOfflineFetch } from './offline/fetch'
import { configureOfflineSync } from './offline/sync'

const url = import.meta.env.VITE_SUPABASE_URL
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

if (!url || !publishableKey) {
  throw new Error(
    'Variables d\'environnement Supabase manquantes. Créez un fichier .env.local avec VITE_SUPABASE_URL et VITE_SUPABASE_PUBLISHABLE_KEY (voir .env.example).',
  )
}

// Couche hors ligne : lectures gardées sur l'appareil, écritures en file sans réseau
export const supabase = createClient(url, publishableKey, {
  global: { fetch: createOfflineFetch(url) },
})

configureOfflineSync({
  url,
  apiKey: publishableKey,
  getToken: async () => (await supabase.auth.getSession()).data.session?.access_token ?? null,
})

/**
 * Session gardée sur l'appareil, même expirée : sans réseau, supabase-js ne
 * peut pas la rafraîchir et la considère absente, alors que le technicien
 * doit pouvoir continuer à travailler. Elle sert seulement à l'écran ; les
 * envois attendent une vraie session au retour du réseau.
 */
export function readStoredSession(): import('@supabase/supabase-js').Session | null {
  try {
    const key = (supabase.auth as unknown as { storageKey?: string }).storageKey
    if (!key) return null
    const raw = localStorage.getItem(key)
    if (!raw) return null
    const s = JSON.parse(raw) as import('@supabase/supabase-js').Session
    return s?.access_token && s.user?.id ? s : null
  } catch {
    return null
  }
}

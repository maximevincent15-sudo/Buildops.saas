// @ts-nocheck — Deno (Supabase Edge)
//
// Firovia — Appels internes (base de données ou autre fonction → fonction)
//
// notify-signup, notify-lifecycle et stripe-sync-seats sont déployées sans
// contrôle de connexion (--no-verify-jwt), car la base les appelle via
// pg_net. Elles n'acceptent donc que deux types d'appel :
//   1. l'en-tête « x-internal-secret » égal au secret rangé dans le coffre
//      de la base (vault, nom « internal_hook_secret »). Le secret est créé
//      au hasard par la migration 20261124180000 : personne ne le voit, et
//      les fonctions le lisent via public.internal_hook_secret(), réservée
//      au rôle service ;
//   2. la clé service de Supabase (appel depuis une autre fonction, par
//      exemple stripe-webhook → notify-lifecycle).
// Tout autre appel reçoit une erreur 401.

/** Comparaison en temps constant (évite de deviner le secret caractère par caractère) */
function safeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder()
  const x = enc.encode(a)
  const y = enc.encode(b)
  if (x.length !== y.length) return false
  let diff = 0
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i]
  return diff === 0
}

let cached: { value: string; at: number } | null = null

/** Secret partagé lu dans le coffre de la base (gardé 5 minutes en mémoire) */
async function hookSecret(admin: any): Promise<string> {
  if (cached && Date.now() - cached.at < 5 * 60_000) return cached.value
  const { data, error } = await admin.rpc('internal_hook_secret')
  if (error || typeof data !== 'string') {
    if (error) console.warn('[internal-auth] lecture du secret impossible', error.message)
    return ''
  }
  cached = { value: data, at: Date.now() }
  return data
}

/** Vrai seulement pour un appel de la base (secret) ou d'une autre fonction (clé service) */
export async function isInternalCall(req: Request, admin: any): Promise<boolean> {
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  const auth = req.headers.get('authorization') ?? ''
  if (serviceKey && safeEqual(auth, `Bearer ${serviceKey}`)) return true

  const given = req.headers.get('x-internal-secret') ?? ''
  if (given.length < 32) return false
  const secret = await hookSecret(admin)
  return secret.length >= 32 && safeEqual(given, secret)
}

export function unauthorized(): Response {
  return new Response(JSON.stringify({ error: 'unauthorized' }), {
    status: 401,
    headers: { 'Content-Type': 'application/json' },
  })
}

/** Échappe le texte inséré dans un mail HTML */
export function escapeHtml(v: unknown): string {
  return String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
}

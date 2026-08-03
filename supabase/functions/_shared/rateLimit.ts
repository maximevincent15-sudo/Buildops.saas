// @ts-nocheck — Deno (Supabase Edge)
//
// Firovia — Helper rate limiting pour les Edge Functions
//
// Usage :
//   import { checkRateLimit } from '../_shared/rateLimit.ts'
//
//   const rl = await checkRateLimit(supabaseAdmin, {
//     bucket: `stripe-checkout:user:${user.id}`,
//     limit: 5,
//     windowSeconds: 60,
//   })
//   if (!rl.ok) return jsonResponse({ error: 'rate_limited', retryAfter: rl.retryAfterS }, 429, corsHeaders)

interface RateLimitOpts {
  bucket: string
  limit: number
  windowSeconds: number
}

interface RateLimitResult {
  ok: boolean
  remaining: number
  retryAfterS?: number
}

export async function checkRateLimit(
  supabaseAdmin: any,
  opts: RateLimitOpts,
): Promise<RateLimitResult> {
  const { data, error } = await supabaseAdmin.rpc('check_rate_limit', {
    p_bucket: opts.bucket,
    p_limit: opts.limit,
    p_window_s: opts.windowSeconds,
  })

  if (error) {
    // En cas d'erreur DB, on ne bloque PAS l'utilisateur (fail open).
    // Mieux vaut laisser passer une requête que de bloquer le service entier.
    console.warn('[rate-limit] check failed, allowing', error)
    return { ok: true, remaining: opts.limit }
  }

  // Cleanup opportuniste
  supabaseAdmin.rpc('rate_limits_maybe_cleanup').then(() => {}, () => {})

  return {
    ok: !!data?.ok,
    remaining: data?.remaining ?? 0,
    retryAfterS: data?.retry_after_s,
  }
}

/**
 * Extrait l'IP du client depuis les headers Vercel/Supabase.
 * Retourne 'unknown' si aucun header trouvé (edge case).
 */
export function getClientIp(req: Request): string {
  const forwarded = req.headers.get('x-forwarded-for')
  if (forwarded) return forwarded.split(',')[0].trim()
  return req.headers.get('x-real-ip') ?? 'unknown'
}

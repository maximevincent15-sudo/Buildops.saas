// Deno (Supabase Edge)
//
// Firovia — Fichier du portail client
//
// Le portail client s'ouvre sans compte, avec un lien secret (jeton). Les
// PDF des rapports et des factures sont privés : cette fonction vérifie le
// jeton (actif, non révoqué, non expiré), vérifie que le document est bien
// celui du client du jeton, puis renvoie un lien temporaire (10 min).
//
// Déploiement : supabase functions deploy portal-file --no-verify-jwt

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'
import { checkRateLimit } from '../_shared/rateLimit.ts'

const ALLOWED_ORIGINS = [
  'https://app.firovia.fr',
  'https://firovia.fr',
  'http://localhost:5173',
  'http://localhost:4173',
]

function buildCorsHeaders(origin: string | null): Record<string, string> {
  const allowedOrigin = origin && (
    ALLOWED_ORIGINS.includes(origin) ||
    /^https:\/\/[a-z0-9-]+-firovia[a-z0-9-]*\.vercel\.app$/.test(origin) ||
    /^https:\/\/buildops-saas[a-z0-9-]*\.vercel\.app$/.test(origin)
  ) ? origin : ALLOWED_ORIGINS[0]
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  }
}

const SIGNED_TTL_SECONDS = 600

function json(body: unknown, status: number, headers: Record<string, string>): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...headers, 'Content-Type': 'application/json' } })
}

/** Bucket et chemin d'une adresse du stockage de ce projet */
function storageLocation(u: unknown, projectHost: string): { bucket: string; path: string; isPublic: boolean } | null {
  if (typeof u !== 'string') return null
  try {
    const url = new URL(u)
    if (url.protocol !== 'https:' || url.host !== projectHost) return null
    const m = /^\/storage\/v1\/object\/(?:public|authenticated)\/([^/]+)\/(.+)$/.exec(url.pathname)
    return m ? { bucket: m[1], path: decodeURIComponent(m[2]), isPublic: url.pathname.includes('/object/public/') } : null
  } catch {
    return null
  }
}

serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req.headers.get('origin'))
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405, corsHeaders)

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
  const admin = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '')

  let body: { token?: unknown; kind?: unknown; id?: unknown } | null
  try {
    body = await req.json()
  } catch {
    return json({ error: 'invalid_body' }, 400, corsHeaders)
  }
  const token = typeof body?.token === 'string' ? body.token.trim() : ''
  const kind = typeof body?.kind === 'string' ? body.kind : ''
  const id = typeof body?.id === 'string' ? body.id : ''
  if (!token || token.length > 200 || !['report', 'invoice'].includes(kind) || !/^[0-9a-f-]{36}$/i.test(id)) {
    return json({ error: 'invalid_request' }, 400, corsHeaders)
  }

  // Limite : 60 ouvertures par minute et par jeton
  const rl = await checkRateLimit(admin, { bucket: `portal-file:${token.slice(0, 16)}`, limit: 60, windowSeconds: 60 })
  if (!rl.ok) return json({ error: 'rate_limited', retryAfter: rl.retryAfterS }, 429, corsHeaders)

  const { data: tok } = await admin
    .from('client_portal_tokens')
    .select('client_id, organization_id')
    .eq('token', token)
    .is('revoked_at', null)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle()
  if (!tok) return json({ error: 'invalid_or_expired' }, 403, corsHeaders)

  // Le document doit appartenir au client du jeton, comme dans le portail
  let pdfUrl: string | null = null
  if (kind === 'report') {
    const { data } = await admin
      .from('reports')
      .select('pdf_url, completed_at, interventions!inner(client_id)')
      .eq('id', id)
      .eq('interventions.client_id', tok.client_id)
      .maybeSingle()
    if (data?.completed_at) pdfUrl = data.pdf_url
  } else {
    const { data } = await admin
      .from('invoices')
      .select('pdf_url, status')
      .eq('id', id)
      .eq('client_id', tok.client_id)
      .maybeSingle()
    if (data && data.status !== 'draft' && data.status !== 'cancelled') pdfUrl = data.pdf_url
  }

  const projectHost = (() => { try { return new URL(supabaseUrl).host } catch { return '' } })()
  const loc = storageLocation(pdfUrl, projectHost)
  if (!loc) return json({ error: 'not_found' }, 404, corsHeaders)
  // Ancien PDF encore public : son adresse suffit
  if (loc.isPublic) return json({ url: pdfUrl }, 200, corsHeaders)

  const { data: signed, error } = await admin.storage.from(loc.bucket).createSignedUrl(loc.path, SIGNED_TTL_SECONDS)
  if (error || !signed?.signedUrl) return json({ error: 'unavailable' }, 500, corsHeaders)
  return json({ url: signed.signedUrl }, 200, corsHeaders)
})

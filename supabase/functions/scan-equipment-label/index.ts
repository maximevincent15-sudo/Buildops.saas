// @ts-nocheck — Cette fonction tourne dans Deno (Supabase Edge), pas dans le bundle Vite/TS
//
// Firovia — Edge Function : lecture d'une étiquette / plaque signalétique
// d'équipement incendie (extincteur, RIA, BAES…) à partir d'une photo.
//
// La photo est envoyée à Claude (vision) qui renvoie les champs lus :
// famille, type, marque, modèle, année de fabrication, n° de série fabricant…
// La photo n'est PAS stockée : elle transite uniquement pour la lecture.
//
// Setup (UNE fois) :
//   1. Créer une clé API sur https://console.anthropic.com (Settings → API Keys)
//   2. Supabase Dashboard → Edge Functions → Secrets → ANTHROPIC_API_KEY
//      (optionnel : SCAN_MODEL pour changer de modèle)
//   3. supabase functions deploy scan-equipment-label --no-verify-jwt
//      (--no-verify-jwt car l'auth est vérifiée manuellement ci-dessous)

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'
import { checkRateLimit } from '../_shared/rateLimit.ts'

const ALLOWED_ORIGINS = [
  'https://app.firovia.fr',
  'https://firovia.fr',
  'http://localhost:5173',
  'http://localhost:4173',
]

function buildCorsHeaders(origin) {
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

const FAMILIES = ['extincteurs', 'ria', 'baes', 'portes_cf', 'desenfumage', 'detection', 'colonnes_seches']
const MEDIA_TYPES = ['image/jpeg', 'image/png', 'image/webp']
// ~4 Mo d'image une fois décodée : largement assez pour une photo redimensionnée côté front
const MAX_BASE64_LENGTH = 5_500_000

const PROMPT = `Tu lis la photo d'une étiquette, d'une plaque signalétique ou d'un équipement de sécurité incendie installé en France (extincteur, RIA, BAES, porte coupe-feu, désenfumage, détection incendie, colonne sèche).

Extrais UNIQUEMENT les informations réellement lisibles sur la photo. N'invente rien : si une information n'est pas visible ou pas lisible avec certitude, mets null.

Conventions pour "subtype" (format court usuel des techniciens) :
- Extincteurs : "EP 6L" (eau pulvérisée), "EPA 6L" / "EPA 9L" (eau + additif), "CO2 2kg" / "CO2 5kg", "PP 6kg ABC" (poudre ABC), "PP 9kg BC", "Mousse 6L"…
- BAES : "BAES évacuation", "BAES ambiance", "BAEH", "BAES + BAEH"…
- RIA : "RIA DN 25", "RIA DN 33"…
- Autres familles : désignation courte lisible sur l'étiquette.

"manufacture_year" = année de fabrication (souvent écrite près de "Année", "Fab.", "Date de fabrication", ou poinçonnée). Année sur 4 chiffres.
"serial_number" = numéro de série fabricant tel qu'imprimé (pas un numéro d'inventaire manuscrit).
"extra" = autres infos utiles et lisibles en une ligne courte (pression, norme NF EN 3, n° d'agrément, dernière révision…), ou null.`

const TOOL = {
  name: 'record_equipment_label',
  description: "Enregistre les informations lues sur l'étiquette de l'équipement.",
  input_schema: {
    type: 'object',
    properties: {
      readable: { type: 'boolean', description: "false si la photo ne montre pas d'étiquette exploitable" },
      family: { type: ['string', 'null'], enum: [...FAMILIES, null] },
      subtype: { type: ['string', 'null'] },
      brand: { type: ['string', 'null'], description: 'Fabricant / marque' },
      model: { type: ['string', 'null'], description: 'Référence ou modèle' },
      manufacture_year: { type: ['integer', 'null'] },
      serial_number: { type: ['string', 'null'] },
      extra: { type: ['string', 'null'] },
    },
    required: ['readable', 'family', 'subtype', 'brand', 'model', 'manufacture_year', 'serial_number', 'extra'],
  },
}

function json(body, status, corsHeaders, extra = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json', ...extra },
  })
}

serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req.headers.get('Origin'))
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405, corsHeaders)

  try {
    const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')
    const MODEL = Deno.env.get('SCAN_MODEL') ?? 'claude-sonnet-5'
    if (!ANTHROPIC_API_KEY) {
      return json({ error: 'scan_not_configured', message: "Le scan d'étiquette n'est pas encore activé." }, 503, corsHeaders)
    }

    // ─── Auth ───
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'unauthenticated' }, 401, corsHeaders)
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } },
    )
    const { data: { user }, error: userErr } = await supabaseClient.auth.getUser()
    if (userErr || !user) return json({ error: 'unauthenticated' }, 401, corsHeaders)

    // ─── Rate limit : 20/min et 300/jour par utilisateur (maîtrise des coûts IA) ───
    const adminClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    )
    for (const [suffix, limit, windowSeconds] of [['1m', 20, 60], ['1d', 300, 86400]]) {
      const rl = await checkRateLimit(adminClient, {
        bucket: `scan-label:user:${user.id}:${suffix}`,
        limit,
        windowSeconds,
      })
      if (!rl.ok) {
        return json(
          { error: 'rate_limited', retry_after_s: rl.retryAfterS },
          429,
          corsHeaders,
          { 'Retry-After': String(rl.retryAfterS ?? windowSeconds) },
        )
      }
    }

    // ─── Validation entrée ───
    const { image, mediaType } = await req.json()
    if (typeof image !== 'string' || image.length === 0 || image.length > MAX_BASE64_LENGTH) {
      return json({ error: 'invalid_image' }, 400, corsHeaders)
    }
    if (!MEDIA_TYPES.includes(mediaType)) {
      return json({ error: 'invalid_media_type' }, 400, corsHeaders)
    }

    // ─── Appel Claude (vision + tool forcé = JSON structuré) ───
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1024,
        tools: [TOOL],
        tool_choice: { type: 'tool', name: TOOL.name },
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mediaType, data: image } },
            { type: 'text', text: PROMPT },
          ],
        }],
      }),
    })

    if (!res.ok) {
      console.error('[scan-label] Anthropic error', res.status, await res.text())
      return json({ error: 'ai_failed' }, 502, corsHeaders)
    }

    const data = await res.json()
    const toolUse = (data.content ?? []).find((c) => c.type === 'tool_use')
    if (!toolUse?.input) return json({ error: 'ai_failed' }, 502, corsHeaders)

    const r = toolUse.input
    const str = (v) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, 120) : null)
    const year = Number.isInteger(r.manufacture_year)
      && r.manufacture_year >= 1950
      && r.manufacture_year <= new Date().getFullYear() + 1
      ? r.manufacture_year
      : null

    return json({
      readable: r.readable !== false,
      family: FAMILIES.includes(r.family) ? r.family : null,
      subtype: str(r.subtype),
      brand: str(r.brand),
      model: str(r.model),
      manufacture_year: year,
      serial_number: str(r.serial_number),
      extra: str(r.extra),
    }, 200, corsHeaders)
  } catch (err) {
    console.error('[scan-label] unexpected', err)
    return json({ error: 'internal_error' }, 500, corsHeaders)
  }
})

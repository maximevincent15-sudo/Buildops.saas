// @ts-nocheck — Cette fonction tourne dans Deno (Supabase Edge), pas dans le bundle Vite/TS
//
// Firovia — Edge Function : notifications de l'équipe par mail (Resend)
//
//   intervention_assigned : le technicien reçoit le détail de l'intervention
//                           qu'on vient de lui attribuer (ou de déplacer)
//   report_completed      : les administrateurs sont prévenus qu'un rapport
//                           est terminé (conformité, anomalies, lien)
//
// Appelée par l'application avec le JWT de l'utilisateur : l'intervention est
// relue avec ses droits (RLS), les destinataires sont résolus côté serveur.
// Réglages par organisation : organizations.notify_technicians et
// notify_admins_reports. Secrets partagés avec send-document-email (RESEND_*).

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

const APP_URL = 'https://app.firovia.fr'
const EMAIL_RE = /^[^\s@<>",;]+@[^\s@<>",;]+\.[^\s@<>",;]+$/

const EQUIPMENT_LABELS = {
  extincteurs: 'Extincteurs',
  ria: 'RIA',
  baes: 'BAES',
  desenfumage: 'Désenfumage',
  portes_cf: 'Portes coupe-feu',
  ssi: 'SSI / Alarme incendie',
  colonnes_seches: 'Colonnes sèches',
  extinction_auto: 'Extinction automatique',
}

function senderName(orgName, fallback) {
  const clean = (orgName ?? '').replace(/["<>\\\r\n]/g, '').replace(/\s+/g, ' ').trim().slice(0, 60)
  return clean ? `"${clean} via Firovia"` : fallback
}

function frDate(iso) {
  if (!iso) return null
  const d = new Date(`${iso}T12:00:00Z`)
  return d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Paris' })
}

const hm = (t) => (t ? String(t).slice(0, 5).replace(':', 'h') : null)

function durationLabel(min) {
  if (!min) return null
  const h = Math.floor(min / 60)
  const m = min % 60
  return h ? `${h} h${m ? ` ${String(m).padStart(2, '0')}` : ''}` : `${m} min`
}

const line = (label, value) => (value ? `• ${label} : ${value}` : null)

function respond(body, status, cors) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })
}

serve(async (req) => {
  const cors = buildCorsHeaders(req.headers.get('Origin'))
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  try {
    const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')
    const RESEND_FROM_EMAIL = Deno.env.get('RESEND_FROM_EMAIL') ?? 'onboarding@resend.dev'
    const RESEND_FROM_NAME = Deno.env.get('RESEND_FROM_NAME') ?? 'Firovia'
    if (!RESEND_API_KEY) return respond({ error: 'resend_not_configured' }, 503, cors)

    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return respond({ error: 'unauthenticated' }, 401, cors)

    const userClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } },
    )
    const { data: { user }, error: userErr } = await userClient.auth.getUser()
    if (userErr || !user) return respond({ error: 'unauthenticated' }, 401, cors)

    const admin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    )
    const rl = await checkRateLimit(admin, { bucket: `notify-team:user:${user.id}:1m`, limit: 30, windowSeconds: 60 })
    if (!rl.ok) return respond({ error: 'rate_limited', retry_after_s: rl.retryAfterS }, 429, cors)

    const payload = await req.json()
    const event = payload?.event
    const interventionId = payload?.interventionId
    if (!['intervention_assigned', 'report_completed'].includes(event) || typeof interventionId !== 'string') {
      return respond({ error: 'invalid_request' }, 400, cors)
    }

    // Intervention relue avec les droits de l'utilisateur (même organisation)
    const { data: i } = await userClient.from('interventions').select('*').eq('id', interventionId).maybeSingle()
    if (!i) return respond({ error: 'intervention_not_found' }, 404, cors)

    const { data: org } = await admin
      .from('organizations')
      .select('name, notify_technicians, notify_admins_reports')
      .eq('id', i.organization_id)
      .maybeSingle()
    const { data: settings } = await admin
      .from('organization_invoicing_settings')
      .select('legal_email')
      .eq('organization_id', i.organization_id)
      .maybeSingle()
    const replyTo = [settings?.legal_email?.trim(), user.email].find((e) => e && EMAIL_RE.test(e)) ?? undefined
    const orgName = org?.name ?? 'Votre entreprise'
    const place = i.site_name || i.client_name || i.reference
    const equipments = (i.equipment_types?.length ? i.equipment_types : [i.equipment_type])
      .filter(Boolean).map((t) => EQUIPMENT_LABELS[t] ?? t).join(', ')

    let to = []
    let subject = ''
    let text = ''

    if (event === 'intervention_assigned') {
      if (org?.notify_technicians === false) return respond({ skipped: 'disabled' }, 200, cors)
      if (!i.technician_id || !i.scheduled_date) return respond({ skipped: 'not_assigned' }, 200, cors)
      const { data: tech } = await admin
        .from('technicians')
        .select('first_name, email, user_id')
        .eq('id', i.technician_id)
        .eq('organization_id', i.organization_id)
        .maybeSingle()
      if (!tech) return respond({ skipped: 'no_technician' }, 200, cors)
      if (tech.user_id && tech.user_id === user.id) return respond({ skipped: 'self' }, 200, cors)
      let email = tech.email?.trim()
      if ((!email || !EMAIL_RE.test(email)) && tech.user_id) {
        const { data: u } = await admin.auth.admin.getUserById(tech.user_id)
        email = u?.user?.email ?? null
      }
      if (!email || !EMAIL_RE.test(email)) return respond({ skipped: 'no_email' }, 200, cors)
      to = [email]

      const changed = payload?.changed === true
      const when = [frDate(i.scheduled_date), hm(i.start_time) && `à ${hm(i.start_time)}`].filter(Boolean).join(' ')
      const address = [i.chantier_address, [i.chantier_postal_code, i.chantier_city].filter(Boolean).join(' ')].filter(Boolean).join(', ') || i.address
      const access = [
        i.chantier_access_building && `bâtiment ${i.chantier_access_building}`,
        i.chantier_access_digicode && `digicode ${i.chantier_access_digicode}`,
        i.chantier_access_hours && `horaires ${i.chantier_access_hours}`,
        i.chantier_access_parking && `parking : ${i.chantier_access_parking}`,
      ].filter(Boolean).join(' · ')
      const contact = [i.chantier_contact_name, i.chantier_contact_phone].filter(Boolean).join(' — ')

      subject = `${changed ? 'Intervention modifiée' : 'Nouvelle intervention'} : ${place} — ${frDate(i.scheduled_date)}${hm(i.start_time) ? ` à ${hm(i.start_time)}` : ''}`
      text = [
        `Bonjour${tech.first_name ? ` ${tech.first_name}` : ''},`,
        '',
        changed ? 'Une intervention qui vous est attribuée a été modifiée :' : 'Une intervention vous a été attribuée :',
        '',
        line('Quand', `${when}${durationLabel(i.duration_minutes) ? ` (durée prévue : ${durationLabel(i.duration_minutes)})` : ''}`),
        line('Client', i.client_name),
        i.site_name && i.site_name !== i.client_name ? line('Site', i.site_name) : null,
        line('Adresse', address),
        line('Équipements', equipments),
        line('Accès', access),
        line('Contact sur place', contact),
        line('Matériel à prévoir', (i.material_needed ?? []).join(', ')),
        line('Notes', i.notes),
        '',
        `Retrouvez-la dans « Ma journée » : ${APP_URL}/dashboard`,
        '',
        `— ${orgName}, via Firovia`,
      ].filter((l) => l !== null).join('\n')
    } else {
      if (org?.notify_admins_reports === false) return respond({ skipped: 'disabled' }, 200, cors)
      const { data: profiles } = await admin
        .from('profiles')
        .select('id, user_role')
        .eq('organization_id', i.organization_id)
      const adminIds = (profiles ?? [])
        .filter((p) => (p.user_role ?? 'admin') === 'admin' && p.id !== user.id)
        .map((p) => p.id)
      for (const id of adminIds.slice(0, 10)) {
        const { data: u } = await admin.auth.admin.getUserById(id)
        const email = u?.user?.email
        if (email && EMAIL_RE.test(email)) to.push(email)
      }
      if (to.length === 0) return respond({ skipped: 'no_admin' }, 200, cors)

      const { data: report } = await userClient
        .from('reports')
        .select('id, is_conform, anomaly_count, pdf_url, signed_by_name, signature_status, completed_at')
        .eq('intervention_id', i.id)
        .maybeSingle()
      const anomalies = Number(report?.anomaly_count ?? 0)
      const result = anomalies > 0
        ? `${anomalies} anomalie${anomalies > 1 ? 's' : ''} à traiter`
        : report?.is_conform === false ? 'non conforme' : 'conforme'
      const signature = report?.signature_status === 'client_absent' ? 'client absent'
        : report?.signature_status === 'client_refused' ? 'signature refusée par le client'
        : report?.signature_status === 'not_required' ? 'signature non requise'
        : report?.signed_by_name ? `signé par ${report.signed_by_name}` : null

      subject = `Rapport terminé : ${place} — ${result}`
      text = [
        'Bonjour,',
        '',
        `${i.technician_name || 'Un technicien'} a terminé le rapport de l'intervention ${i.reference} :`,
        '',
        line('Client', i.client_name),
        i.site_name && i.site_name !== i.client_name ? line('Site', i.site_name) : null,
        line('Équipements', equipments),
        line('Résultat', result),
        line('Signature', signature),
        '',
        `Voir le rapport : ${APP_URL}/rapports/${i.id}`,
        report?.pdf_url ? `PDF : ${report.pdf_url}` : null,
        anomalies > 0 ? '\nLes anomalies sont à décider dans Planning → « Suites à décider » (devis ou repasse).' : null,
        '',
        `— Firovia`,
      ].filter((l) => l !== null).join('\n')
    }

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: `${senderName(orgName, RESEND_FROM_NAME)} <${RESEND_FROM_EMAIL}>`,
        reply_to: replyTo,
        to,
        subject: subject.slice(0, 200),
        text,
      }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) return respond({ error: 'resend_failed', status: res.status, details: data }, 502, cors)
    return respond({ success: true, emailId: data.id, sentTo: to.length }, 200, cors)
  } catch (err) {
    console.error('notify-team error:', err)
    return respond({ error: 'internal_error' }, 500, cors)
  }
})

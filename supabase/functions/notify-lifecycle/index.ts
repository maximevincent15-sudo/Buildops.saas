// @ts-nocheck — Deno (Supabase Edge)
//
// Firovia — Edge Function : notif email à Maxime pour les événements
// de cycle de vie subscription (trial expirant, paiement, résiliation…).
// Pour trial_ending_soon (J-3) et trial_expired, un email est AUSSI envoyé
// aux administrateurs de l'organisation cliente (lien vers /abonnement).
//
// Appelée depuis :
//   1. stripe-webhook (pour les events Stripe : payment, cancellation…)
//   2. cron pg_cron (pour les trials J-3 et expirés)
//
// Payload attendu :
//   { kind: 'trial_ending_soon' | 'trial_expired' | 'subscription_activated'
//         | 'subscription_canceled' | 'payment_failed',
//     organization_id: string }

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'
import { checkRateLimit } from '../_shared/rateLimit.ts'

type EventKind =
  | 'trial_ending_soon'
  | 'trial_expired'
  | 'subscription_activated'
  | 'subscription_canceled'
  | 'payment_failed'

interface RequestBody {
  kind: EventKind
  organization_id: string
  /** Mode test : envoie l'email client uniquement à TEST_RECIPIENT */
  test?: boolean
}

// Seule adresse autorisée en mode test (jamais une adresse passée dans la requête)
const TEST_RECIPIENT = 'contact@firovia.fr'

const EVENT_META: Record<EventKind, {
  emoji: string
  subject: (org: string) => string
  color: string
  cta: string
}> = {
  trial_ending_soon: {
    emoji: '⏳',
    subject: (org) => `⏳ Trial expire bientôt — ${org}`,
    color: '#E67E22',
    cta: 'Relance recommandée : proposer un point 15 min pour lever les freins.',
  },
  trial_expired: {
    emoji: '🚨',
    subject: (org) => `🚨 Trial expiré — ${org}`,
    color: '#C0392B',
    cta: "Dernière chance : envoyer un breakup mail (\"je m'arrête là, un dernier mot ?\").",
  },
  subscription_activated: {
    emoji: '🎉',
    subject: (org) => `🎉 Nouveau client payant — ${org}`,
    color: '#0E7A3F',
    cta: 'Envoyer email de bienvenue + proposer un onboarding 30 min.',
  },
  subscription_canceled: {
    emoji: '💔',
    subject: (org) => `💔 Résiliation — ${org}`,
    color: '#8A4A00',
    cta: "Demander pourquoi (feedback = or). Proposer une pause plutôt qu'un stop.",
  },
  payment_failed: {
    emoji: '⚠️',
    subject: (org) => `⚠️ Paiement échoué — ${org}`,
    color: '#C0392B',
    cta: 'Stripe retente auto pendant 14j. Contacter le client si carte expirée.',
  },
}

// ─── Emails destinés au client (fin d'essai) ───────────────────────────
function escapeHtml(v: string): string {
  return v.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
}

function buildCustomerEmail(
  kind: 'trial_ending_soon' | 'trial_expired',
  p: { firstName: string | null; orgName: string; trialEnd: string; siteUrl: string },
): { subject: string; text: string; html: string } {
  const hello = p.firstName ? `Bonjour ${p.firstName},` : 'Bonjour,'
  const url = `${p.siteUrl}/abonnement`
  const ending = kind === 'trial_ending_soon'
  const subject = ending
    ? `Votre essai Firovia se termine le ${p.trialEnd}`
    : 'Votre essai Firovia est terminé — vos données sont conservées'
  const lines = ending
    ? [
        `Votre essai gratuit de Firovia pour ${p.orgName} se termine le ${p.trialEnd}.`,
        'Pour continuer sans interruption avec vos clients, équipements, rapports et plannings déjà saisis, il vous suffit de choisir votre formule. Cela prend 2 minutes.',
        "Tout ce que vous avez créé pendant l'essai est conservé.",
      ]
    : [
        `L'essai gratuit de Firovia pour ${p.orgName} est arrivé à son terme le ${p.trialEnd}.`,
        "Toutes vos données (clients, équipements, rapports, plannings) sont conservées. Pour retrouver l'accès à l'application, choisissez votre formule : l'accès est rétabli dès la validation du paiement.",
      ]
  const cta = ending ? 'Choisir ma formule' : "Retrouver l'accès"
  const outro = "Une question, un besoin particulier ou envie d'en parler avant ? Répondez simplement à cet email ou réservez 15 minutes : https://cal.com/firovia"

  const text = `${hello}

${lines.join('\n\n')}

${cta} : ${url}

${outro}

Maxime Vincent
Fondateur de Firovia — contact@firovia.fr`

  const html = `
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#1C2130;line-height:1.55;">
  <div style="font-size:22px;font-weight:800;margin-bottom:20px;"><span style="color:#3A5CA8;">Fir</span>ovia</div>
  <p style="margin:0 0 14px;">${escapeHtml(hello)}</p>
  ${lines.map((l) => `<p style="margin:0 0 14px;color:#3A4050;">${escapeHtml(l)}</p>`).join('')}
  <p style="margin:24px 0;">
    <a href="${url}" style="display:inline-block;background:#3A5CA8;color:#fff;text-decoration:none;font-weight:600;padding:12px 22px;border-radius:100px;">${cta}</a>
  </p>
  <p style="margin:0 0 14px;color:#5A6070;font-size:14px;">Une question, un besoin particulier ou envie d'en parler avant ? Répondez simplement à cet email ou <a href="https://cal.com/firovia" style="color:#3A5CA8;">réservez 15 minutes</a>.</p>
  <p style="margin:24px 0 0;color:#1C2130;">Maxime Vincent<br/><span style="color:#5A6070;font-size:14px;">Fondateur de Firovia</span></p>
  <p style="margin-top:28px;font-size:12px;color:#9AA0AE;">Firovia · Maxime Vincent EI · SIREN 106 429 749 · <a href="https://firovia.fr/cgv.html" style="color:#9AA0AE;">CGV</a></p>
</div>`
  return { subject, text, html }
}

async function sendToOrgAdmins(
  supabase: any,
  organizationId: string,
  kind: 'trial_ending_soon' | 'trial_expired',
  orgName: string,
  trialEndsAt: string | null,
  resend: { apiKey: string; from: string },
): Promise<number> {
  // Administrateurs de l'org (repli : tous les profils si aucun admin identifié)
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, first_name, user_role')
    .eq('organization_id', organizationId)
  const all = profiles ?? []
  const admins = all.filter((p) => p.user_role === 'admin')
  const targets = (admins.length > 0 ? admins : all).slice(0, 5)

  const trialEnd = trialEndsAt
    ? new Date(trialEndsAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', timeZone: 'Europe/Paris' })
    : 'bientôt'
  const siteUrl = Deno.env.get('SITE_URL') ?? 'https://app.firovia.fr'

  let sent = 0
  for (const p of targets) {
    const { data: userData } = await supabase.auth.admin.getUserById(p.id)
    const email = userData?.user?.email
    if (!email) continue
    const mail = buildCustomerEmail(kind, { firstName: p.first_name ?? null, orgName, trialEnd, siteUrl })
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${resend.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: resend.from,
        to: [email],
        reply_to: 'contact@firovia.fr',
        subject: mail.subject,
        text: mail.text,
        html: mail.html,
      }),
    })
    if (res.ok) sent++
    else console.error('[notify-lifecycle] customer email failed', res.status, await res.text())
  }
  return sent
}

serve(async (req) => {
  try {
    const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')
    const RESEND_FROM_EMAIL = Deno.env.get('RESEND_FROM_EMAIL') ?? 'contact@firovia.fr'
    const RESEND_FROM_NAME = Deno.env.get('RESEND_FROM_NAME') ?? 'Firovia'
    const NOTIFY_TO = Deno.env.get('NOTIFY_SIGNUP_TO') ?? 'contact@firovia.fr'

    if (!RESEND_API_KEY) {
      console.warn('[notify-lifecycle] RESEND_API_KEY manquant, skip')
      return new Response(JSON.stringify({ skipped: true }), { status: 200 })
    }

    const body = (await req.json()) as RequestBody

    // ─── Mode test : aperçu des emails client envoyé à contact@firovia.fr ───
    if (body?.test === true && (body.kind === 'trial_ending_soon' || body.kind === 'trial_expired')) {
      const admin = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      )
      const rl = await checkRateLimit(admin, { bucket: 'lifecycle-test', limit: 10, windowSeconds: 3600 })
      if (!rl.ok) return new Response(JSON.stringify({ error: 'rate_limited' }), { status: 429 })
      const end = new Date(Date.now() + (body.kind === 'trial_ending_soon' ? 3 : 0) * 86400_000)
      const mail = buildCustomerEmail(body.kind, {
        firstName: 'Maxime',
        orgName: 'Entreprise Test',
        trialEnd: end.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', timeZone: 'Europe/Paris' }),
        siteUrl: Deno.env.get('SITE_URL') ?? 'https://app.firovia.fr',
      })
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: `${RESEND_FROM_NAME} <${RESEND_FROM_EMAIL}>`,
          to: [TEST_RECIPIENT],
          reply_to: 'contact@firovia.fr',
          subject: `[TEST] ${mail.subject}`,
          text: mail.text,
          html: mail.html,
        }),
      })
      const out = await res.json()
      return new Response(JSON.stringify({ test: true, ok: res.ok, to: TEST_RECIPIENT, resend: out }), {
        status: res.ok ? 200 : 502,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    if (!body?.kind || !body?.organization_id) {
      return new Response(
        JSON.stringify({ error: 'invalid_payload' }),
        { status: 400 },
      )
    }
    const meta = EVENT_META[body.kind]
    if (!meta) {
      return new Response(
        JSON.stringify({ error: 'unknown_kind', kind: body.kind }),
        { status: 400 },
      )
    }

    // Client admin (bypass RLS)
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    )

    // Récupère les infos de l'org + subscription + contact principal
    const { data: org } = await supabase
      .from('organizations')
      .select('name, siret')
      .eq('id', body.organization_id)
      .single()

    const { data: sub } = await supabase
      .from('subscriptions')
      .select('status, plan, billing_period, trial_ends_at, current_period_end, stripe_customer_id, lifecycle_notified_trial_ending_at, lifecycle_notified_trial_expired_at')
      .eq('organization_id', body.organization_id)
      .single()

    const { data: profile } = await supabase
      .from('profiles')
      .select('id, first_name, last_name')
      .eq('organization_id', body.organization_id)
      .limit(1)
      .single()

    let userEmail = '(email inconnu)'
    if (profile?.id) {
      const { data: userData } = await supabase.auth.admin.getUserById(profile.id)
      userEmail = userData?.user?.email ?? '(email inconnu)'
    }

    const orgName = org?.name ?? '(entreprise inconnue)'
    const siret = org?.siret ?? '—'
    const contactName =
      [profile?.first_name, profile?.last_name].filter(Boolean).join(' ') || '(inconnu)'
    const planLabel = sub?.plan
      ? `${sub.plan} ${sub.billing_period === 'yearly' ? 'annuel' : 'mensuel'}`
      : '—'
    const trialEnd = sub?.trial_ends_at
      ? new Date(sub.trial_ends_at).toLocaleDateString('fr-FR')
      : '—'

    const subject = meta.subject(orgName)

    // Corps texte + HTML
    const textBody = `${meta.emoji} ${subject}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Entreprise : ${orgName}
SIRET      : ${siret}
Contact    : ${contactName}
Email      : ${userEmail}
Plan       : ${planLabel}
Statut     : ${sub?.status ?? '—'}
Fin trial  : ${trialEnd}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Action suggérée :
${meta.cta}

Notification automatique Firovia.`

    const htmlBody = `
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:600px;margin:0 auto;padding:20px;color:#333;">
  <div style="background:${meta.color};color:white;padding:20px;border-radius:8px 8px 0 0;">
    <h1 style="margin:0;font-size:22px;">${meta.emoji} ${subject.replace(meta.emoji + ' ', '')}</h1>
  </div>
  <div style="background:#F8F9FA;padding:20px;border-radius:0 0 8px 8px;border:1px solid #E1E5EA;border-top:none;">
    <table style="width:100%;border-collapse:collapse;">
      <tr><td style="padding:6px 0;color:#666;width:120px;">Entreprise</td><td style="padding:6px 0;font-weight:600;">${orgName}</td></tr>
      <tr><td style="padding:6px 0;color:#666;">SIRET</td><td style="padding:6px 0;">${siret}</td></tr>
      <tr><td style="padding:6px 0;color:#666;">Contact</td><td style="padding:6px 0;">${contactName}</td></tr>
      <tr><td style="padding:6px 0;color:#666;">Email</td><td style="padding:6px 0;"><a href="mailto:${userEmail}" style="color:#1E3A5F;">${userEmail}</a></td></tr>
      <tr><td style="padding:6px 0;color:#666;">Plan</td><td style="padding:6px 0;">${planLabel}</td></tr>
      <tr><td style="padding:6px 0;color:#666;">Statut</td><td style="padding:6px 0;">${sub?.status ?? '—'}</td></tr>
      <tr><td style="padding:6px 0;color:#666;">Fin trial</td><td style="padding:6px 0;">${trialEnd}</td></tr>
    </table>
  </div>
  <div style="margin-top:20px;padding:16px;background:#FFF9E6;border-left:3px solid ${meta.color};border-radius:4px;">
    <p style="margin:0 0 6px;font-weight:600;color:#1E3A5F;">🎯 Action suggérée</p>
    <p style="margin:0;color:#555;font-size:14px;">${meta.cta}</p>
  </div>
  <p style="margin-top:20px;font-size:12px;color:#999;text-align:center;">Notification automatique Firovia · ${new Date().toLocaleString('fr-FR', { timeZone: 'Europe/Paris' })}</p>
</div>`

    const resendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: `${RESEND_FROM_NAME} <${RESEND_FROM_EMAIL}>`,
        to: [NOTIFY_TO],
        subject,
        text: textBody,
        html: htmlBody,
      }),
    })

    // Email au client pour la fin d'essai (en plus de la notif interne)
    // Garde-fous (la fonction est appelable sans JWT par le cron) : on
    // n'écrit au client que si la base confirme l'état de l'essai ET que le
    // cron vient de marquer l'org (< 30 min), avec 1 email max / 3 jours.
    let customerEmails = 0
    const isTrialKind = body.kind === 'trial_ending_soon' || body.kind === 'trial_expired'
    const flaggedAt = body.kind === 'trial_ending_soon'
      ? sub?.lifecycle_notified_trial_ending_at
      : sub?.lifecycle_notified_trial_expired_at
    const endsAt = sub?.trial_ends_at ? new Date(sub.trial_ends_at).getTime() : null
    const stateOk = sub?.status === 'trialing' && endsAt !== null && (
      body.kind === 'trial_ending_soon'
        ? endsAt > Date.now() && endsAt <= Date.now() + 3 * 86400_000
        : endsAt < Date.now()
    )
    const freshlyFlagged = !!flaggedAt && Date.now() - new Date(flaggedAt).getTime() < 30 * 60_000
    let rateOk = false
    if (isTrialKind && stateOk && freshlyFlagged) {
      const rl = await checkRateLimit(supabase, {
        bucket: `lifecycle-customer:${body.organization_id}:${body.kind}`,
        limit: 1,
        windowSeconds: 3 * 86400,
      })
      rateOk = rl.ok
    }
    if (isTrialKind && stateOk && freshlyFlagged && rateOk) {
      try {
        customerEmails = await sendToOrgAdmins(
          supabase,
          body.organization_id,
          body.kind,
          orgName,
          sub?.trial_ends_at ?? null,
          { apiKey: RESEND_API_KEY, from: `${RESEND_FROM_NAME} <${RESEND_FROM_EMAIL}>` },
        )
      } catch (e) {
        console.error('[notify-lifecycle] customer email error', e)
      }
    }

    const resendData = await resendRes.json()
    if (!resendRes.ok) {
      console.error('[notify-lifecycle] Resend error', resendRes.status, resendData)
      return new Response(
        JSON.stringify({ error: 'resend_failed', details: resendData }),
        { status: 502 },
      )
    }

    return new Response(
      JSON.stringify({ success: true, kind: body.kind, orgName, customerEmails }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    )
  } catch (e) {
    console.error('[notify-lifecycle] internal error', e)
    return new Response(
      JSON.stringify({ error: 'internal_error', message: e instanceof Error ? e.message : String(e) }),
      { status: 500 },
    )
  }
})

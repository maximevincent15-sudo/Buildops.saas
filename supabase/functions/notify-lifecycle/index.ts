// @ts-nocheck — Deno (Supabase Edge)
//
// Firovia — Edge Function : notif email à Maxime pour les événements
// de cycle de vie subscription (trial expirant, paiement, résiliation…).
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

type EventKind =
  | 'trial_ending_soon'
  | 'trial_expired'
  | 'subscription_activated'
  | 'subscription_canceled'
  | 'payment_failed'

interface RequestBody {
  kind: EventKind
  organization_id: string
}

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
      .select('status, plan, billing_period, trial_ends_at, current_period_end, stripe_customer_id')
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

    const resendData = await resendRes.json()
    if (!resendRes.ok) {
      console.error('[notify-lifecycle] Resend error', resendRes.status, resendData)
      return new Response(
        JSON.stringify({ error: 'resend_failed', details: resendData }),
        { status: 502 },
      )
    }

    return new Response(
      JSON.stringify({ success: true, kind: body.kind, orgName }),
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

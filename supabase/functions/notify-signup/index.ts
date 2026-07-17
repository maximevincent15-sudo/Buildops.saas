// @ts-nocheck — Cette fonction tourne dans Deno (Supabase Edge), pas dans le bundle Vite/TS
//
// Firovia — Edge Function : notification email à Maxime lors d'une nouvelle inscription
//
// Flow :
//   1. Un prospect s'inscrit sur app.firovia.fr/register
//   2. Le trigger DB (voir migration associée) INSERT dans public.profiles
//   3. Supabase Database Webhook déclenche cette Edge Function avec le payload profile
//   4. Cette fonction récupère les infos de l'org (nom, SIRET) + email user
//   5. Elle envoie un email à contact@firovia.fr via Resend
//
// Setup (UNE fois) :
//   1. supabase functions deploy notify-signup --no-verify-jwt
//   2. Dans Supabase Dashboard → Database → Webhooks → Create a new hook :
//      - Name          : notify_signup
//      - Table         : public.profiles
//      - Events        : INSERT
//      - Type          : Supabase Edge Functions
//      - Edge Function : notify-signup
//      - HTTP Method   : POST
//   3. Save
//
// (--no-verify-jwt car appelé par la DB via webhook interne, pas par un user)

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'

serve(async (req) => {
  try {
    const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')
    const RESEND_FROM_EMAIL = Deno.env.get('RESEND_FROM_EMAIL') ?? 'contact@firovia.fr'
    const RESEND_FROM_NAME = Deno.env.get('RESEND_FROM_NAME') ?? 'Firovia'
    const NOTIFY_TO = Deno.env.get('NOTIFY_SIGNUP_TO') ?? 'contact@firovia.fr'

    if (!RESEND_API_KEY) {
      console.warn('[notify-signup] RESEND_API_KEY manquant, notif ignorée')
      return new Response(JSON.stringify({ skipped: true }), { status: 200 })
    }

    // Payload Supabase Database Webhook : { type, table, record, schema, old_record }
    const body = await req.json()
    const record = body?.record
    if (!record?.id || !record?.organization_id) {
      console.warn('[notify-signup] payload invalide', body)
      return new Response(JSON.stringify({ error: 'invalid_payload' }), { status: 400 })
    }

    // Client admin (bypass RLS) pour lire org + email user
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    )

    // Récupère les infos de l'organisation
    const { data: org } = await supabase
      .from('organizations')
      .select('name, siret')
      .eq('id', record.organization_id)
      .single()

    // Récupère l'email du user via auth.admin
    const { data: userData } = await supabase.auth.admin.getUserById(record.id)
    const userEmail = userData?.user?.email ?? '(email inconnu)'

    const firstName = record.first_name ?? ''
    const lastName = record.last_name ?? ''
    const fullName = [firstName, lastName].filter(Boolean).join(' ') || '(nom non renseigné)'
    const orgName = org?.name ?? '(entreprise non renseignée)'
    const siret = org?.siret ?? '(SIRET non renseigné)'
    const createdAt = new Date(record.created_at ?? Date.now()).toLocaleString('fr-FR', {
      timeZone: 'Europe/Paris',
      dateStyle: 'full',
      timeStyle: 'short',
    })

    // Corps du mail
    const subject = `🎉 Nouvelle inscription Firovia — ${orgName}`
    const textBody = `Un nouveau prospect vient de créer un compte sur Firovia.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
INFORMATIONS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Entreprise : ${orgName}
SIRET      : ${siret}
Contact    : ${fullName}
Email      : ${userEmail}
Inscrit le : ${createdAt}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PROCHAINES ÉTAPES SUGGÉRÉES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

• Jour 0 → Envoyer un email de bienvenue personnalisé
• Jour 3 → Vérifier l'usage du compte (Supabase Dashboard)
• Jour 7 → Email de suivi "comment ça se passe ?"
• Jour 12 → Proposer un point 15 min avant fin trial
• Jour 14 → Trial expire — envoyer le lien de paiement

Bonne journée,
Firovia`

    const htmlBody = `
<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #333;">
  <div style="background: #1E3A5F; color: white; padding: 20px; border-radius: 8px 8px 0 0;">
    <h1 style="margin: 0; font-size: 22px;">🎉 Nouvelle inscription Firovia</h1>
    <p style="margin: 8px 0 0; opacity: 0.9;">Un nouveau prospect vient de créer un compte.</p>
  </div>

  <div style="background: #F8F9FA; padding: 20px; border-radius: 0 0 8px 8px; border: 1px solid #E1E5EA; border-top: none;">
    <table style="width: 100%; border-collapse: collapse;">
      <tr><td style="padding: 6px 0; color: #666; width: 120px;">Entreprise</td><td style="padding: 6px 0; font-weight: 600;">${orgName}</td></tr>
      <tr><td style="padding: 6px 0; color: #666;">SIRET</td><td style="padding: 6px 0;">${siret}</td></tr>
      <tr><td style="padding: 6px 0; color: #666;">Contact</td><td style="padding: 6px 0;">${fullName}</td></tr>
      <tr><td style="padding: 6px 0; color: #666;">Email</td><td style="padding: 6px 0;"><a href="mailto:${userEmail}" style="color: #1E3A5F;">${userEmail}</a></td></tr>
      <tr><td style="padding: 6px 0; color: #666;">Inscrit le</td><td style="padding: 6px 0;">${createdAt}</td></tr>
    </table>
  </div>

  <div style="margin-top: 20px; padding: 16px; background: #FFF9E6; border-left: 3px solid #E67E22; border-radius: 4px;">
    <p style="margin: 0 0 8px; font-weight: 600; color: #1E3A5F;">🎯 Prochaines étapes suggérées</p>
    <ul style="margin: 0; padding-left: 20px; color: #555; font-size: 14px;">
      <li>Jour 0 → email de bienvenue personnalisé</li>
      <li>Jour 3 → vérifier l'usage du compte</li>
      <li>Jour 7 → email de suivi "comment ça se passe ?"</li>
      <li>Jour 12 → proposer un point 15 min avant fin trial</li>
      <li>Jour 14 → trial expire — envoyer le lien de paiement</li>
    </ul>
  </div>

  <p style="margin-top: 20px; font-size: 12px; color: #999; text-align: center;">
    Notification automatique Firovia
  </p>
</div>
`

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
      console.error('[notify-signup] Resend error', resendRes.status, resendData)
      return new Response(JSON.stringify({ error: 'resend_failed', details: resendData }), {
        status: 502,
      })
    }

    return new Response(
      JSON.stringify({ success: true, emailId: resendData.id, sentTo: NOTIFY_TO }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    )
  } catch (e) {
    console.error('[notify-signup] internal error', e)
    return new Response(
      JSON.stringify({ error: 'internal_error', message: e instanceof Error ? e.message : String(e) }),
      { status: 500 },
    )
  }
})

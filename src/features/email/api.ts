import { supabase } from '../../shared/lib/supabase'

export type DocumentKind = 'report' | 'quote' | 'invoice'

export type SendEmailInput = {
  kind: DocumentKind
  documentId: string
  recipientEmail: string
  subject: string
  body: string
  pdfUrl?: string | null
}

export type SendEmailResult =
  | { mode: 'resend'; success: true; emailId: string; attached: boolean }
  | { mode: 'mailto'; success: true; mailtoUrl: string }
  | { mode: 'error'; error: string }

/**
 * Tente l'envoi via l'Edge Function Supabase (Resend).
 * Si la fonction n'est pas déployée OU si Resend n'est pas configuré OU si
 * elle échoue, retombe sur un mailto: classique (l'utilisateur envoie depuis
 * sa propre messagerie).
 */
export async function sendDocumentEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const { kind, documentId, recipientEmail, subject, body, pdfUrl } = input

  // 1. Tentative via Resend (Edge Function)
  try {
    const { data, error } = await supabase.functions.invoke('send-document-email', {
      body: { kind, documentId, recipientEmail, subject, body, pdfUrl },
    })

    if (error) {
      // 404 = fonction non déployée → fallback silencieux
      // 503 = Resend pas configuré → fallback silencieux
      // Autre = on tente quand même le fallback mais on log l'erreur
      const status = (error as { status?: number; context?: { status?: number } }).status
        ?? (error as { context?: { status?: number } }).context?.status
      if (status && status !== 404 && status !== 503) {
        console.warn('Edge Function send-document-email a échoué:', error)
      }
      return fallbackToMailto(input)
    }

    if (data?.error) {
      // Cas typique : 'resend_not_configured' → fallback silencieux
      if (data.error === 'resend_not_configured') {
        return fallbackToMailto(input)
      }
      console.warn('Resend a échoué:', data)
      return fallbackToMailto(input)
    }

    return {
      mode: 'resend',
      success: true,
      emailId: data.emailId as string,
      attached: data.attached ?? false,
    }
  } catch (err) {
    console.warn('Erreur sendDocumentEmail, fallback mailto:', err)
    return fallbackToMailto(input)
  }
}

function fallbackToMailto(input: SendEmailInput): SendEmailResult {
  const params = new URLSearchParams()
  if (input.subject) params.set('subject', input.subject)
  if (input.body) params.set('body', input.body)
  const qs = params.toString().replace(/\+/g, '%20')
  const url = `mailto:${encodeURIComponent(input.recipientEmail)}?${qs}`
  // Ouvre la messagerie par défaut
  window.location.href = url
  return { mode: 'mailto', success: true, mailtoUrl: url }
}

/**
 * Test direct si l'Edge Function est déployée et Resend configuré.
 * Utile pour la page Paramètres.
 */
export async function testEmailConfig(testRecipient: string): Promise<{
  ok: boolean
  message: string
  mode: 'resend' | 'not_configured' | 'function_not_deployed' | 'error'
}> {
  try {
    const { data, error } = await supabase.functions.invoke('send-document-email', {
      body: {
        kind: 'report',
        documentId: '00000000-0000-0000-0000-000000000000',
        recipientEmail: testRecipient,
        subject: 'Test BuildOps — configuration email',
        body: 'Ceci est un test envoyé depuis BuildOps.\nSi tu reçois ce message, ta config Resend est OK ✓',
        pdfUrl: null,
      },
    })

    if (error) {
      const status = (error as { status?: number }).status
      if (status === 404) {
        return {
          ok: false,
          message: 'Edge Function non déployée. Voir instructions dans Paramètres.',
          mode: 'function_not_deployed',
        }
      }
      return {
        ok: false,
        message: `Erreur ${status ?? '?'}: ${(error as Error).message ?? 'inconnue'}`,
        mode: 'error',
      }
    }

    if (data?.error === 'resend_not_configured') {
      return {
        ok: false,
        message: 'La clé API Resend n\'est pas configurée côté Supabase.',
        mode: 'not_configured',
      }
    }

    if (data?.error === 'document_not_found_or_no_access') {
      // Normal en mode test : on passe un faux ID. Si on arrive ici, ça veut
      // dire que la chaîne fonctionne (Resend serait appelé sur un vrai doc).
      // En réalité, on ne peut pas vraiment tester sans vrai document — donc
      // on signale juste que la fonction est bien déployée.
      return {
        ok: true,
        message: 'Edge Function déployée. Test complet possible en envoyant un vrai document.',
        mode: 'resend',
      }
    }

    if (data?.success) {
      return {
        ok: true,
        message: `Email envoyé à ${testRecipient} via Resend ✓`,
        mode: 'resend',
      }
    }

    return {
      ok: false,
      message: 'Réponse inattendue de la fonction.',
      mode: 'error',
    }
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : 'Erreur',
      mode: 'error',
    }
  }
}

import { getClient } from './api'
import type { Client, ClientEmailRecipient } from './schemas'

export type DocumentRecipientKind = 'reports' | 'quotes' | 'invoices'

export const RECIPIENT_KIND_LABELS: Record<DocumentRecipientKind, string> = {
  reports: 'Rapports',
  quotes: 'Devis',
  invoices: 'Factures',
}

const EMAIL_RE = /^[^\s@<>",;]+@[^\s@<>",;]+\.[^\s@<>",;]+$/

export function isValidEmail(email: string): boolean {
  return EMAIL_RE.test(email.trim())
}

/** « a@x.fr, b@y.fr ; c@z.fr » → adresses distinctes (casse ignorée), dans l'ordre */
export function splitEmails(text: string | null | undefined): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of (text ?? '').split(/[,;\s]+/)) {
    const e = raw.trim()
    if (!e || seen.has(e.toLowerCase())) continue
    seen.add(e.toLowerCase())
    out.push(e)
  }
  return out
}

/** Destinataires d'un type de document : l'email principal, puis ceux qui ont coché ce type */
export function recipientsFor(
  client: Pick<Client, 'contact_email' | 'extra_emails'> | null | undefined,
  kind: DocumentRecipientKind,
  primaryOverride?: string | null,
): string[] {
  const extras = (client?.extra_emails ?? [])
    .filter((r: ClientEmailRecipient) => r[kind] && isValidEmail(r.email))
    .map((r) => r.email)
  return splitEmails([primaryOverride || client?.contact_email || '', ...extras].join(','))
}

/** Pareil, à partir de l'identifiant du client (fiche relue au moment de l'envoi) */
export async function recipientsForClientId(
  clientId: string | null | undefined,
  kind: DocumentRecipientKind,
  primaryOverride?: string | null,
): Promise<string[]> {
  const client = clientId ? await getClient(clientId).catch(() => null) : null
  return recipientsFor(client, kind, primaryOverride)
}

import { CheckCircle2, Mail, XCircle } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { MouseEvent } from 'react'
import { useAuthStore } from '../../auth/store'
import { formatAmount } from '../../devis/constants'
import { isValidEmail, recipientsForClientId } from '../../clients/recipients'
import { sendDocumentEmail } from '../../email/api'
import { issueInvoice, markInvoiceSent } from '../api'
import { displayReference } from '../constants'
import { buildInvoicePdf, invoiceEmail } from '../documentPdf'
import type { Invoice } from '../schemas'

type RowState = 'idle' | 'sending' | 'sent' | 'issued' | 'error'

type Row = {
  invoice: Invoice
  recipients: string[]
  selected: boolean
  state: RowState
  /** Numéro attribué, ou explication en cas d'échec */
  note: string | null
}

type Props = {
  /** Brouillons de factures (pas d'avoirs) */
  drafts: Invoice[]
  onClose: () => void
  /** Au moins une facture a été émise : la liste est à recharger */
  onDone: () => void
}

/**
 * Envoi groupé des brouillons (après « Facturer le mois ») : chaque facture
 * reçoit son numéro dans l'ordre de création, son PDF et son mail. Une
 * facture sans email client est laissée en brouillon.
 */
export function BulkSendModal({ drafts, onClose, onDone }: Props) {
  const profile = useAuthStore((s) => s.profile)
  // Liste figée à l'ouverture : la page se recharge pendant l'envoi
  const [ordered] = useState(() => [...drafts].sort((a, b) => a.created_at.localeCompare(b.created_at)))
  const [rows, setRows] = useState<Row[]>(() => ordered.map((invoice) => ({ invoice, recipients: [], selected: false, state: 'idle', note: null })))
  const [loading, setLoading] = useState(true)
  const [running, setRunning] = useState(false)
  const [finished, setFinished] = useState(false)

  // Destinataires « factures » de chaque client
  useEffect(() => {
    let alive = true
    void Promise.all(ordered.map((inv) =>
      recipientsForClientId(inv.client_id, 'invoices', inv.client_email ?? '').catch(() => [] as string[]),
    )).then((lists) => {
      if (!alive) return
      setRows(ordered.map((invoice, i) => {
        const recipients = (lists[i] ?? []).filter(isValidEmail)
        const ok = recipients.length > 0 && Number(invoice.total_ttc) > 0
        return { invoice, recipients, selected: ok, state: 'idle', note: null }
      }))
      setLoading(false)
    })
    return () => { alive = false }
  }, [ordered])

  const selected = rows.filter((r) => r.selected)
  const total = selected.reduce((s, r) => s + Number(r.invoice.total_ttc), 0)

  function patch(id: string, p: Partial<Row>) {
    setRows((prev) => prev.map((r) => (r.invoice.id === id ? { ...r, ...p } : r)))
  }

  async function sendAll() {
    if (!profile?.organization_id || selected.length === 0) return
    setRunning(true)
    const orgName = profile.organizations?.name ?? 'Maintenance'
    let issuedAny = false
    // Une par une, dans l'ordre de création : les numéros suivent cet ordre
    for (const row of selected) {
      const id = row.invoice.id
      const recipient = row.recipients.join(', ')
      patch(id, { state: 'sending', note: null })
      let reference: string | null = null
      let issued = false
      try {
        // Numéro et date du jour (base), puis PDF au numéro définitif
        reference = (await issueInvoice(id)).reference
        issued = true
        issuedAny = true
        const { doc, url, credited, depositQuote } = await buildInvoicePdf(id, profile.organization_id, orgName)
        const { subject, body } = invoiceEmail(doc, orgName, url, credited, depositQuote)
        // Envoi groupé : pas d'ouverture de la messagerie en secours
        const result = await sendDocumentEmail(
          { kind: 'invoice', documentId: id, recipientEmail: recipient, subject, body, pdfUrl: url },
          { mailtoFallback: false },
        )
        if (result.mode === 'resend') {
          // « Envoyée » seulement une fois le mail parti
          await markInvoiceSent(id, recipient)
          patch(id, { state: 'sent', note: `${doc.reference} envoyée à ${recipient}` })
        } else {
          patch(id, { state: 'issued', note: `${doc.reference} émise, mais le mail n'est pas parti : ouvrez-la et cliquez « Envoyer au client »` })
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Erreur'
        patch(id, {
          state: issued ? 'issued' : 'error',
          note: issued ? `${reference} émise, mais : ${msg}. Ouvrez-la pour la renvoyer.` : msg,
        })
      }
    }
    setRunning(false)
    setFinished(true)
    if (issuedAny) onDone()
  }

  function handleBackdrop(e: MouseEvent<HTMLDivElement>) {
    if (e.target === e.currentTarget && !running) onClose()
  }

  const sentCount = rows.filter((r) => r.state === 'sent').length
  const issuedCount = rows.filter((r) => r.state === 'issued').length
  const errorCount = rows.filter((r) => r.state === 'error').length

  return (
    <div className="overlay open" onClick={handleBackdrop}>
      <div className="modal" style={{ maxWidth: 720 }}>
        <div className="modal-head">
          <span className="modal-title" style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <Mail size={16} strokeWidth={2} /> Envoyer les brouillons
          </span>
          <button type="button" className="modal-x" onClick={onClose} aria-label="Fermer" disabled={running}>×</button>
        </div>

        <p className="text-ink-2 text-sm" style={{ margin: '0 0 .8rem', lineHeight: 1.5 }}>
          Chaque facture cochée reçoit son numéro et la date du jour, puis part au client avec son PDF.
          Les numéros suivent l'ordre de la liste. Une facture sans email client reste en brouillon.
        </p>

        {loading ? (
          <p className="text-ink-3 text-sm">Recherche des emails des clients…</p>
        ) : (
          <div style={{ maxHeight: '50vh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
            {rows.map((r) => {
              const canSend = r.recipients.length > 0 && Number(r.invoice.total_ttc) > 0
              return (
                <label
                  key={r.invoice.id}
                  style={{
                    display: 'flex', alignItems: 'flex-start', gap: 10, padding: '.6rem .75rem', borderRadius: 10,
                    border: '1px solid var(--brd2)', background: 'var(--wht)', cursor: canSend && !running && !finished ? 'pointer' : 'default',
                    opacity: canSend ? 1 : 0.65,
                  }}
                >
                  {r.state === 'sent' ? <CheckCircle2 size={16} style={{ color: 'var(--grn, #2E7D5E)', marginTop: 2, flexShrink: 0 }} />
                    : r.state === 'error' ? <XCircle size={16} style={{ color: 'var(--red, #A83A3A)', marginTop: 2, flexShrink: 0 }} />
                      : (
                        <input
                          type="checkbox"
                          checked={r.selected}
                          disabled={!canSend || running || finished}
                          onChange={(e) => patch(r.invoice.id, { selected: e.target.checked })}
                          style={{ marginTop: 3 }}
                        />
                      )}
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ fontWeight: 600 }}>{r.invoice.client_name}</span>
                    <span className="text-ink-3"> · {displayReference(r.invoice)}{r.invoice.site_name ? ` · ${r.invoice.site_name}` : ''}</span>
                    <span className="text-ink-3" style={{ display: 'block', fontSize: 12.5 }}>
                      {r.note
                        ?? (r.state === 'sending' ? 'Envoi…'
                          : Number(r.invoice.total_ttc) <= 0 ? 'Montant à zéro : à compléter avant envoi'
                            : r.recipients.length > 0 ? `À : ${r.recipients.join(', ')}`
                              : 'Pas d\'email sur la fiche client : reste en brouillon')}
                    </span>
                  </span>
                  <strong style={{ whiteSpace: 'nowrap' }}>{formatAmount(Number(r.invoice.total_ttc))}</strong>
                </label>
              )
            })}
          </div>
        )}

        {finished && (
          <p className="text-sm" style={{ margin: '.8rem 0 0' }}>
            {sentCount} facture{sentCount > 1 ? 's' : ''} envoyée{sentCount > 1 ? 's' : ''}
            {issuedCount > 0 && <> · {issuedCount} émise{issuedCount > 1 ? 's' : ''} sans mail (à renvoyer depuis la facture)</>}
            {errorCount > 0 && <> · {errorCount} en erreur, restée{errorCount > 1 ? 's' : ''} en brouillon</>}.
          </p>
        )}

        <div className="modal-foot" style={{ marginTop: '1rem' }}>
          <button type="button" className="mf out" onClick={onClose} disabled={running}>{finished ? 'Fermer' : 'Annuler'}</button>
          {!finished && (
            <button type="button" className="mf prim" onClick={() => void sendAll()} disabled={running || loading || selected.length === 0}>
              {running ? 'Envoi en cours…' : `Envoyer ${selected.length} facture${selected.length > 1 ? 's' : ''} (${formatAmount(total)})`}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

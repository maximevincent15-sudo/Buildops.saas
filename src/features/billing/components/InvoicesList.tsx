import { Download, ExternalLink, FileText } from 'lucide-react'
import { useEffect, useState } from 'react'
import { listStripeInvoices } from '../api'
import type { StripeInvoice } from '../api'

const STATUS: Record<StripeInvoice['status'], { label: string; bg: string; fg: string }> = {
  paid: { label: 'Payée', bg: '#E6F4EB', fg: '#0E7A3F' },
  open: { label: 'À régler', bg: '#FDF3EC', fg: '#C45A1A' },
  uncollectible: { label: 'Impayée', bg: '#FDECEC', fg: '#9B1C1C' },
  void: { label: 'Annulée', bg: '#EEF0F3', fg: '#5A6070' },
}

function formatDate(unix: number | null): string {
  if (!unix) return '—'
  return new Date(unix * 1000).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })
}

function formatAmount(cents: number, currency: string): string {
  return (cents / 100).toLocaleString('fr-FR', { style: 'currency', currency: currency.toUpperCase() })
}

/** Rubrique « Mes factures » de la page Abonnement (factures Stripe). */
export function InvoicesList() {
  const [invoices, setInvoices] = useState<StripeInvoice[] | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    let cancelled = false
    listStripeInvoices()
      .then((list) => { if (!cancelled) setInvoices(list) })
      .catch(() => { if (!cancelled) setError(true) })
    return () => { cancelled = true }
  }, [])

  return (
    <div className="card" style={{ marginBottom: '1.5rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: '.8rem' }}>
        <FileText size={16} strokeWidth={2} style={{ color: 'var(--acc, #3A5CA8)' }} />
        <div style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--ink, #1C2130)' }}>Mes factures</div>
      </div>

      {error ? (
        <p style={{ fontSize: '.85rem', color: 'var(--ink2, #5A6070)', margin: 0 }}>
          Impossible de charger vos factures pour le moment. Elles restent disponibles via « Gérer mon abonnement ».
        </p>
      ) : invoices === null ? (
        <p style={{ fontSize: '.85rem', color: 'var(--ink3, #8A8F9A)', margin: 0 }}>Chargement…</p>
      ) : invoices.length === 0 ? (
        <p style={{ fontSize: '.85rem', color: 'var(--ink2, #5A6070)', margin: 0 }}>
          Aucune facture pour l'instant. Vos factures apparaîtront ici après chaque paiement.
        </p>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.85rem' }}>
            <thead>
              <tr style={{ textAlign: 'left', color: 'var(--ink3, #8A8F9A)', fontSize: '.75rem', textTransform: 'uppercase', letterSpacing: '.4px' }}>
                <th style={th}>Date</th>
                <th style={th}>N° de facture</th>
                <th style={th}>Période</th>
                <th style={{ ...th, textAlign: 'right' }}>Montant</th>
                <th style={th}>Statut</th>
                <th style={th} />
              </tr>
            </thead>
            <tbody>
              {invoices.map((inv) => {
                const st = STATUS[inv.status] ?? STATUS.void
                return (
                  <tr key={inv.id} style={{ borderTop: '1px solid var(--brd, #E1E5EA)' }}>
                    <td style={td}>{formatDate(inv.created)}</td>
                    <td style={{ ...td, fontFamily: 'ui-monospace, monospace', fontSize: '.8rem' }}>{inv.number ?? '—'}</td>
                    <td style={{ ...td, color: 'var(--ink2, #5A6070)' }}>
                      {formatDate(inv.period_start)} → {formatDate(inv.period_end)}
                    </td>
                    <td style={{ ...td, textAlign: 'right', fontWeight: 600 }}>{formatAmount(inv.total, inv.currency)}</td>
                    <td style={td}>
                      <span style={{ background: st.bg, color: st.fg, padding: '2px 8px', borderRadius: 100, fontSize: '.75rem', fontWeight: 600, whiteSpace: 'nowrap' }}>
                        {st.label}
                      </span>
                    </td>
                    <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                      {inv.status === 'open' && inv.hosted_invoice_url && (
                        <a href={inv.hosted_invoice_url} target="_blank" rel="noreferrer" style={{ ...link, marginRight: 12 }}>
                          <ExternalLink size={13} /> Régler
                        </a>
                      )}
                      {inv.invoice_pdf && (
                        <a href={inv.invoice_pdf} target="_blank" rel="noreferrer" style={link}>
                          <Download size={13} /> PDF
                        </a>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

const th: React.CSSProperties = { padding: '.4rem .5rem', fontWeight: 600 }
const td: React.CSSProperties = { padding: '.6rem .5rem', color: 'var(--ink, #1C2130)' }
const link: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
  color: 'var(--acc, #3A5CA8)',
  fontWeight: 500,
  textDecoration: 'none',
}

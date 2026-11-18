import { useEffect, useState } from 'react'
import { getNextNumbers, setNextDocumentNumber } from '../api'
import type { NextNumbers } from '../api'

type Props = {
  organizationId: string
  quotePrefix: string
  invoicePrefix: string
}

const pad = (n: number) => String(n).padStart(4, '0')
const pad3 = (n: number) => String(n).padStart(3, '0')

/**
 * Prochain numéro de devis et de facture : pour continuer la numérotation
 * d'un ancien logiciel (MEG, Sage…) au lieu de repartir de 0001.
 */
export function NextNumberFields({ organizationId, quotePrefix, invoicePrefix }: Props) {
  const [info, setInfo] = useState<NextNumbers | null>(null)
  const [quote, setQuote] = useState('')
  const [invoice, setInvoice] = useState('')
  const [reception, setReception] = useState('')
  const [busy, setBusy] = useState<'quote' | 'invoice' | 'reception' | null>(null)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)

  function show(n: NextNumbers) {
    setInfo(n)
    setQuote(String(n.nextQuote))
    setInvoice(String(n.nextInvoice))
    setReception(String(n.nextReception))
  }

  async function load() {
    show(await getNextNumbers(organizationId))
  }

  useEffect(() => {
    let alive = true
    getNextNumbers(organizationId)
      .then((n) => { if (alive) show(n) })
      .catch(() => { /* compteurs illisibles : bloc masqué */ })
    return () => { alive = false }
  }, [organizationId])

  async function apply(kind: 'quote' | 'invoice' | 'reception') {
    const value = Number(kind === 'quote' ? quote : kind === 'invoice' ? invoice : reception)
    if (!Number.isInteger(value) || value < 1) {
      setMessage({ ok: false, text: 'Indiquez un numéro entier (ex : 154).' })
      return
    }
    setBusy(kind)
    setMessage(null)
    try {
      await setNextDocumentNumber(kind, value)
      const next = kind === 'quote'
        ? `le prochain devis sera ${quotePrefix}-${info?.year}-${pad(value)}`
        : kind === 'invoice'
          ? `la prochaine facture sera ${invoicePrefix}-${info?.year}-${pad(value)}`
          : `le prochain procès-verbal sera PV-${info?.year}-${pad3(value)}`
      setMessage({ ok: true, text: `C'est noté : ${next}.` })
      await load()
    } catch (e) {
      setMessage({ ok: false, text: e instanceof Error ? e.message : 'Numéro refusé.' })
    } finally {
      setBusy(null)
    }
  }

  if (!info) return null

  return (
    <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '.5px solid var(--brd)' }}>
      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Continuer la numérotation de votre ancien logiciel</div>
      <p className="text-ink-3 text-xs font-light" style={{ margin: '0 0 .8rem', lineHeight: 1.5 }}>
        Votre dernier devis était le n°153 ? Indiquez 154 : Firovia continue la suite au lieu de repartir de 0001.
        Valable pour {info.year}, la numérotation repart à 0001 chaque année.
      </p>
      <div className="mrow">
        <div className="fg">
          <label>Prochain numéro de devis</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <input type="number" inputMode="numeric" min={info.nextQuote} value={quote}
              onChange={(e) => setQuote(e.target.value)} style={{ flex: 1, minWidth: 0 }} />
            <button type="button" className="btn-sm" disabled={!!busy || Number(quote) === info.nextQuote} onClick={() => void apply('quote')}>
              {busy === 'quote' ? '…' : 'Appliquer'}
            </button>
          </div>
          <span className="text-ink-3 text-xs font-light" style={{ marginTop: 4 }}>
            Prochain devis : <strong>{quotePrefix}-{info.year}-{pad(Number(quote) || info.nextQuote)}</strong>
          </span>
        </div>
        <div className="fg">
          <label>Prochain numéro de facture</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <input type="number" inputMode="numeric" min={1} value={invoice} disabled={info.invoicesThisYear}
              onChange={(e) => setInvoice(e.target.value)} style={{ flex: 1, minWidth: 0 }} />
            <button type="button" className="btn-sm" disabled={!!busy || info.invoicesThisYear || Number(invoice) === info.nextInvoice} onClick={() => void apply('invoice')}>
              {busy === 'invoice' ? '…' : 'Appliquer'}
            </button>
          </div>
          <span className="text-ink-3 text-xs font-light" style={{ marginTop: 4, lineHeight: 1.4 }}>
            {info.invoicesThisYear
              ? 'Des factures existent déjà cette année : la suite doit rester continue.'
              : <>Prochaine facture : <strong>{invoicePrefix}-{info.year}-{pad(Number(invoice) || info.nextInvoice)}</strong></>}
          </span>
        </div>
      </div>
      <div className="mrow" style={{ marginTop: '.6rem' }}>
        <div className="fg">
          <label>Prochain numéro de procès-verbal (PV)</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <input type="number" inputMode="numeric" min={info.nextReception} value={reception}
              onChange={(e) => setReception(e.target.value)} style={{ flex: 1, minWidth: 0 }} />
            <button type="button" className="btn-sm" disabled={!!busy || Number(reception) === info.nextReception} onClick={() => void apply('reception')}>
              {busy === 'reception' ? '…' : 'Appliquer'}
            </button>
          </div>
          <span className="text-ink-3 text-xs font-light" style={{ marginTop: 4 }}>
            Prochain PV : <strong>PV-{info.year}-{pad3(Number(reception) || info.nextReception)}</strong>
          </span>
        </div>
        <div className="fg" />
      </div>
      {message && (
        <p className={message.ok ? 'text-grn text-sm' : 'text-red text-sm'} style={{ margin: '.6rem 0 0' }}>{message.text}</p>
      )}
    </div>
  )
}

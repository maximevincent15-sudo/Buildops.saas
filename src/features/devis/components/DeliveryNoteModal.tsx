import { PenLine, Printer } from 'lucide-react'
import { useState } from 'react'
import { SignaturePad } from '../../../shared/ui/SignaturePad'
import { isOffline } from '../../../shared/lib/offline/state'
import { createDeliveryNote, deliveryProgress, signDeliveryNote } from '../deliveryNotes'
import { buildDeliveryNotePdf } from '../pdf/deliveryNoteFile'
import { DELIVERY_MODE_LABELS } from '../schemas'
import type { DeliveryMode, DeliveryNoteWithLines, QuoteWithLines } from '../schemas'
import { formatNumber } from '../constants'

type Props = {
  quote: QuoteWithLines
  /** Bons déjà faits pour ce devis (reste à livrer) */
  notes: DeliveryNoteWithLines[]
  /** Bon existant non signé : on passe directement à la signature */
  toSign?: DeliveryNoteWithLines | null
  organizationId: string
  organizationName: string
  onClose: () => void
  /** Bon créé ou signé (avec son PDF si la création du PDF a réussi) */
  onSaved: (note: DeliveryNoteWithLines) => void
}

const todayIso = () => new Date().toISOString().slice(0, 10)
const qtyLabel = (n: number) => formatNumber(n, n % 1 === 0 ? 0 : 2)
const firstLine = (s: string) => s.split('\n')[0]

/** Bon de livraison d'un devis accepté : quantités livrées cette fois, signature sur place */
export function DeliveryNoteModal({ quote, notes, toSign, organizationId, organizationName, onClose, onSaved }: Props) {
  const progress = deliveryProgress(quote.lines, notes)
  const [quantities, setQuantities] = useState<string[]>(() => progress.map((p) => (p.remaining > 0 ? String(p.remaining) : '0')))
  const [deliveryDate, setDeliveryDate] = useState(todayIso())
  const [mode, setMode] = useState<DeliveryMode>('delivered')
  const [observations, setObservations] = useState('')
  const [step, setStep] = useState<'form' | 'sign'>(toSign ? 'sign' : 'form')
  const [signName, setSignName] = useState(quote.client_contact_name?.trim() ?? '')
  const [signData, setSignData] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const parsed = quantities.map((q) => Number(String(q).replace(',', '.')))
  const chosen = quote.lines
    .map((l, i) => ({ line: l, index: i, qty: parsed[i] }))
    .filter((x) => Number.isFinite(x.qty) && x.qty > 0)
  const tooMuch = quote.lines.findIndex((_, i) => Number.isFinite(parsed[i]) && parsed[i] > progress[i].remaining + 1e-9)
  const invalid = quote.lines.findIndex((_, i) => !Number.isFinite(parsed[i]) || parsed[i] < 0)
  const effectiveMode = toSign?.mode ?? mode

  function checkForm(): boolean {
    if (invalid >= 0) { setError(`Quantité invalide : « ${firstLine(quote.lines[invalid].description)} ».`); return false }
    if (tooMuch >= 0) { setError(`« ${firstLine(quote.lines[tooMuch].description)} » : il reste ${qtyLabel(progress[tooMuch].remaining)} à livrer.`); return false }
    if (chosen.length === 0) { setError('Indiquez au moins une quantité à livrer.'); return false }
    if (!deliveryDate) { setError('Indiquez la date.'); return false }
    setError(null)
    return true
  }

  async function makePdf(note: DeliveryNoteWithLines): Promise<DeliveryNoteWithLines> {
    try {
      const url = await buildDeliveryNotePdf(note, organizationId, organizationName, quote.id)
      return { ...note, pdf_url: url }
    } catch {
      // Le bon existe : le PDF pourra être refait depuis la liste
      return note
    }
  }

  async function save(withSignature: boolean) {
    if (isOffline()) { setError('Sans réseau : le bon de livraison sera possible dès le retour du réseau.'); return }
    if (!toSign && !checkForm()) return
    const signature = withSignature && signName.trim() && signData ? { name: signName.trim(), dataUrl: signData } : null
    if (withSignature && !signature) return
    setSaving(true)
    setError(null)
    try {
      let note: DeliveryNoteWithLines
      if (toSign && signature) {
        const signedAt = await signDeliveryNote(toSign.id, signature)
        note = { ...toSign, signed_by_name: signature.name, signature_data_url: signature.dataUrl, signed_at: signedAt }
      } else {
        note = await createDeliveryNote({
          quote,
          delivery_date: deliveryDate,
          mode,
          observations: observations.trim() || null,
          lines: chosen.map((x) => ({
            quote_position: x.index,
            description: x.line.description,
            format: x.line.format ?? null,
            quantity: x.qty,
          })),
          signature,
        }, organizationId)
      }
      onSaved(await makePdf(note))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur lors de l\'enregistrement')
    } finally {
      setSaving(false)
    }
  }

  const recapLines = toSign
    ? toSign.lines.map((l) => ({ key: l.id, text: firstLine(l.description), qty: Number(l.quantity) }))
    : chosen.map((x) => ({ key: String(x.index), text: firstLine(x.line.description), qty: x.qty }))

  return (
    <div className="overlay open" style={{ zIndex: 9999 }}>
      <div className="modal" style={{ maxWidth: 680 }}>
        <div className="modal-head">
          <span className="modal-title">
            {toSign ? `Signature · ${toSign.reference}` : `Bon de livraison · devis ${quote.reference}`}
          </span>
          <button type="button" className="modal-x" onClick={onClose} disabled={saving} aria-label="Fermer">×</button>
        </div>

        {step === 'form' ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '.9rem' }}>
            <div className="mrow">
              <div className="fg">
                <label>Date</label>
                <input type="date" value={deliveryDate} onChange={(e) => setDeliveryDate(e.target.value)} />
              </div>
              <div className="fg">
                <label>Type</label>
                <select value={mode} onChange={(e) => setMode(e.target.value as DeliveryMode)}>
                  <option value="delivered">{DELIVERY_MODE_LABELS.delivered}</option>
                  <option value="pickup">{DELIVERY_MODE_LABELS.pickup} (prêt à être récupéré)</option>
                </select>
              </div>
            </div>

            <div>
              <div className="dn-head">
                <span>Désignation</span>
                <span>Devis</span>
                <span>Déjà livré</span>
                <span>Cette fois</span>
              </div>
              {quote.lines.map((l, i) => {
                const p = progress[i]
                const done = p.remaining <= 0
                return (
                  <div key={l.id ?? i} className={done ? 'dn-row done' : 'dn-row'}>
                    <span className="dn-desc" title={l.description}>{firstLine(l.description)}</span>
                    <span>{qtyLabel(p.ordered)}</span>
                    <span>{p.delivered > 0 ? qtyLabel(p.delivered) : '—'}</span>
                    <span>
                      {done ? (
                        <span className="text-grn text-xs">Livré</span>
                      ) : (
                        <input
                          type="number"
                          inputMode="decimal"
                          min={0}
                          max={p.remaining}
                          step="any"
                          value={quantities[i]}
                          onChange={(e) => setQuantities((prev) => prev.map((q, k) => (k === i ? e.target.value : q)))}
                          aria-label={`Quantité livrée : ${firstLine(l.description)}`}
                        />
                      )}
                    </span>
                  </div>
                )
              })}
              <p className="text-ink-3 text-xs" style={{ margin: '6px 0 0' }}>
                Mettez 0 pour une ligne qui n'est pas livrée cette fois : elle restera à livrer.
              </p>
            </div>

            <div className="fg">
              <label>Observations et réserves <span className="text-ink-3 text-xs font-light">(facultatif)</span></label>
              <textarea
                className="report-textarea"
                style={{ minHeight: 60 }}
                value={observations}
                onChange={(e) => setObservations(e.target.value)}
                placeholder="Ex : un carton abîmé, colis complet"
              />
            </div>

            {error && <span className="ferr on">{error}</span>}

            <div className="modal-foot" style={{ flexWrap: 'wrap' }}>
              <button type="button" className="mf out" onClick={onClose} disabled={saving}>Annuler</button>
              <button
                type="button"
                className="mf out"
                onClick={() => void save(false)}
                disabled={saving}
                title="Crée le bon sans signature, pour l'imprimer ou le faire signer plus tard"
                style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
              >
                <Printer size={14} /> {saving ? 'Création…' : 'Créer sans signature'}
              </button>
              <button
                type="button"
                className="mf prim"
                onClick={() => { if (checkForm()) setStep('sign') }}
                disabled={saving}
                style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
              >
                <PenLine size={14} /> Faire signer
              </button>
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '.8rem' }}>
            <div className="quote-sign-recap">
              <div className="quote-sign-ref">
                {toSign ? toSign.reference : 'Bon de livraison'} · {quote.client_name}
              </div>
              <ul className="quote-sign-lines">
                {recapLines.map((l) => (
                  <li key={l.key}>
                    <span>{l.text}</span>
                    <span>× {qtyLabel(l.qty)}</span>
                  </li>
                ))}
              </ul>
            </div>
            <p className="text-ink-2 text-sm" style={{ margin: 0 }}>
              {effectiveMode === 'pickup'
                ? <><strong>Bon pour enlèvement.</strong> En signant, je reconnais avoir récupéré les éléments ci-dessus.</>
                : <><strong>Reçu.</strong> En signant, je reconnais avoir reçu les éléments ci-dessus, sous réserve des observations notées.</>}
            </p>
            <div className="fg">
              <label>Nom et fonction du signataire</label>
              <input type="text" value={signName} onChange={(e) => setSignName(e.target.value)} placeholder="Ex : Jean Dupont, chef de chantier" autoComplete="off" />
            </div>
            <SignaturePad value={signData} onChange={setSignData} />
            {error && <span className="ferr on">{error}</span>}
            <div className="modal-foot">
              <button type="button" className="mf out" onClick={() => (toSign ? onClose() : setStep('form'))} disabled={saving}>
                {toSign ? 'Annuler' : 'Retour'}
              </button>
              <button
                type="button"
                className="mf prim"
                onClick={() => void save(true)}
                disabled={saving || !signName.trim() || !signData}
              >
                {saving ? 'Enregistrement…' : 'Valider la signature'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

import { useState } from 'react'
import { isOffline } from '../../../shared/lib/offline/state'
import { DEFAULT_STANDARDS } from '../../rapports/workOrder'
import { buildReceptionReportPdf } from '../pdf/receptionReportFile'
import { createReceptionReport } from '../receptionReports'
import type { ReceptionReport } from '../receptionReports'
import type { DeliveryNoteWithLines, QuoteWithLines } from '../schemas'

type Props = {
  quote: QuoteWithLines
  /** Bons de livraison du devis : la dernière livraison pré-remplit « Livraison le » */
  deliveryNotes: DeliveryNoteWithLines[]
  /** Dernier PV de l'entreprise : ses référentiels servent de point de départ */
  previous: ReceptionReport | null
  /** Ville de l'entreprise (Paramètres), imprimée devant la date */
  defaultCity: string | null
  signatoryName: string | null
  organizationId: string
  organizationName: string
  onClose: () => void
  onSaved: (report: ReceptionReport) => void
}

const todayIso = () => new Date().toISOString().slice(0, 10)
const toggle = (list: string[], x: string) => (list.includes(x) ? list.filter((y) => y !== x) : [...list, x])

/** Procès-verbal de réception d'un devis accepté (installation terminée) */
export function ReceptionReportModal({ quote, deliveryNotes, previous, defaultCity, signatoryName, organizationId, organizationName, onClose, onSaved }: Props) {
  const lastDelivery = [...deliveryNotes].map((n) => n.delivery_date).sort().pop() ?? ''
  const defaults: string[] = [...DEFAULT_STANDARDS]
  const [issueDate, setIssueDate] = useState(todayIso())
  const [city, setCity] = useState(defaultCity?.trim() ?? '')
  const [clientName, setClientName] = useState(quote.client_name)
  const [contact, setContact] = useState(quote.client_contact_name?.trim() ?? '')
  const [affair, setAffair] = useState(quote.site_address?.trim() ?? '')
  const [dossier, setDossier] = useState(quote.dossier_number?.trim() ?? '')
  const [description, setDescription] = useState(() =>
    quote.lines.map((l) => l.description.split('\n')[0]!.trim()).filter(Boolean).slice(0, 4).join('\n'))
  const [standards, setStandards] = useState<string[]>(() => (previous?.standards ?? []).filter((x) => defaults.includes(x)))
  const [otherStandards, setOtherStandards] = useState(previous?.other_standards ?? '')
  const [note, setNote] = useState('')
  const [deliveryDate, setDeliveryDate] = useState(lastDelivery)
  const [signatory, setSignatory] = useState(signatoryName?.trim() ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save() {
    if (isOffline()) { setError('Sans réseau : le PV sera possible dès le retour du réseau.'); return }
    if (!clientName.trim()) { setError('Indiquez à qui le PV est adressé.'); return }
    if (!issueDate) { setError('Indiquez la date du PV.'); return }
    setSaving(true)
    setError(null)
    try {
      const created = await createReceptionReport(quote, {
        issue_date: issueDate,
        issue_city: city.trim() || null,
        client_name: clientName.trim(),
        client_contact_name: contact.trim() || null,
        site_address: affair.trim() || null,
        dossier_number: dossier.trim() || null,
        description: description.trim() || null,
        standards: defaults.filter((x) => standards.includes(x)),
        other_standards: otherStandards.trim() || null,
        standards_note: note.trim() || null,
        delivery_date: deliveryDate || null,
        signatory_name: signatory.trim() || null,
      }, organizationId)
      let report = created
      try {
        report = { ...created, pdf_url: await buildReceptionReportPdf(created, organizationName, signatory.trim() || null) }
      } catch (e) {
        // Le PV existe : son PDF pourra être refait depuis le devis
        console.warn('PDF du PV échoué', e)
      }
      onSaved(report)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur lors de l\'enregistrement')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="overlay open" style={{ zIndex: 9999 }}>
      <div className="modal" style={{ maxWidth: 680 }}>
        <div className="modal-head">
          <span className="modal-title">Procès-verbal de réception · devis {quote.reference}</span>
          <button type="button" className="modal-x" onClick={onClose} disabled={saving} aria-label="Fermer">×</button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '.9rem' }}>
          <p className="text-ink-3 text-xs font-light" style={{ margin: 0 }}>
            Numéro attribué à la création, à la suite des précédents (reprise d'une ancienne série : Paramètres → Numérotation).
          </p>
          <div className="mrow">
            <div className="fg">
              <label>Date du PV</label>
              <input type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} />
            </div>
            <div className="fg">
              <label>Fait à <span className="text-ink-3 text-xs font-light">(ville)</span></label>
              <input type="text" value={city} onChange={(e) => setCity(e.target.value)} placeholder="Ville de l'entreprise" />
            </div>
          </div>
          <div className="mrow">
            <div className="fg">
              <label>Adressé à</label>
              <input type="text" value={clientName} onChange={(e) => setClientName(e.target.value)} />
            </div>
            <div className="fg">
              <label>À l'attention de <span className="text-ink-3 text-xs font-light">(facultatif)</span></label>
              <input type="text" value={contact} onChange={(e) => setContact(e.target.value)} placeholder="Nom du contact" />
            </div>
          </div>
          <div className="mrow">
            <div className="fg" style={{ flex: 2 }}>
              <label>Affaire <span className="text-ink-3 text-xs font-light">(adresse du chantier)</span></label>
              <input type="text" value={affair} onChange={(e) => setAffair(e.target.value)} />
            </div>
            <div className="fg">
              <label>N° de dossier</label>
              <input type="text" value={dossier} onChange={(e) => setDossier(e.target.value)} />
            </div>
          </div>
          <div className="fg">
            <label>Descriptif</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} placeholder="Travaux réalisés" />
          </div>
          <div className="fg">
            <label>Référentiels <span className="text-ink-3 text-xs font-light">(cochés sur le PV ; les autres apparaissent décochés)</span></label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
              {defaults.map((x) => (
                <button key={x} type="button" className={`filter-pill${standards.includes(x) ? ' on' : ''}`} onClick={() => setStandards((l) => toggle(l, x))}>
                  {x}
                </button>
              ))}
            </div>
            <input
              type="text"
              value={otherStandards}
              onChange={(e) => setOtherStandards(e.target.value)}
              placeholder="Autres référentiels, séparés par des virgules (repris au prochain PV)"
              style={{ marginTop: 6 }}
            />
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Précision sous les référentiels (facultatif)"
              style={{ marginTop: 6 }}
            />
          </div>
          <div className="mrow">
            <div className="fg">
              <label>Livraison le <span className="text-ink-3 text-xs font-light">(facultatif)</span></label>
              <input type="date" value={deliveryDate} onChange={(e) => setDeliveryDate(e.target.value)} />
            </div>
            <div className="fg">
              <label>Signé pour l'entreprise par</label>
              <input type="text" value={signatory} onChange={(e) => setSignatory(e.target.value)} placeholder="Nom du signataire" />
            </div>
          </div>

          {error && <span className="ferr on">{error}</span>}

          <div className="modal-foot">
            <button type="button" className="mf out" onClick={onClose} disabled={saving}>Annuler</button>
            <button type="button" className="mf prim" onClick={() => void save()} disabled={saving}>
              {saving ? 'Création…' : 'Créer le PV'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

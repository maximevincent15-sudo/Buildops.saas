import { FileText, PenLine } from 'lucide-react'
import { useEffect, useState } from 'react'
import { ModalPortal } from '../../../shared/ui/ModalPortal'
import { SignaturePad } from '../../../shared/ui/SignaturePad'
import { isOffline } from '../../../shared/lib/offline/state'
import { EQUIPMENT_TYPES, formatEquipmentTypes } from '../../../shared/constants/interventions'
import { INTERVENTION_TYPE_LABELS, technicianLabel } from '../../planning/schemas'
import type { Intervention } from '../../planning/schemas'
import { interventionAddress } from '../../planning/address'
import { listAnomaliesForIntervention } from '../../anomalies/api'
import { ACTIVE_ANOMALY_STATUSES, ANOMALY_ACTION_LABELS } from '../../anomalies/schemas'
import { listEquipmentUnitsByIds } from '../../equipment/api'
import { unitRepere } from '../../equipment/identification'
import { getInvoicingSettings } from '../../parametres/api'
import { linkDossierDocument } from '../../dossiers/api'
import { supabase } from '../../../shared/lib/supabase'
import { clientInfoLines } from '../pdf/clientInfo'
import { loadReportClientInfo } from '../pdf/loadClientInfo'
import { renderAndStoreReportPdf } from '../pdf/generateReportPdf'
import { WorkOrderPdf } from '../pdf/WorkOrderPdf'
import type { WorkOrderPdfData } from '../pdf/WorkOrderPdf'
import { DEFAULT_STANDARDS, SAFETY_ITEMS, WORK_NATURES, WORK_NATURE_LABELS, natureFromType, saveWorkOrder, standardsFor } from '../workOrder'
import type { WorkNature, WorkOrder } from '../workOrder'

type Props = {
  intervention: Intervention
  reportId: string
  /** Types d'équipements de la visite (domaines cochés) */
  equipmentTypes: string[]
  initial: WorkOrder | null
  /** Signature déjà prise sur le rapport : reprise telle quelle */
  reportSignature: { name: string; dataUrl: string } | null
  completedAt: string | null
  organizationId: string
  organizationName: string
  createdByName: string | null
  onClose: () => void
  onSaved: (workOrder: WorkOrder) => void
}

const todayIso = () => new Date().toISOString().slice(0, 10)
const toggle = (list: string[], v: string) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v])

/**
 * Bon d'intervention de la visite : rempli à partir du rapport (heures,
 * domaines, travaux restants), complété par le technicien, signé par le client.
 */
export function WorkOrderModal({
  intervention, reportId, equipmentTypes, initial, reportSignature, completedAt,
  organizationId, organizationName, createdByName, onClose, onSaved,
}: Props) {
  const [nature, setNature] = useState<WorkNature>(initial?.nature ?? natureFromType(intervention.intervention_type))
  const [description, setDescription] = useState(initial?.description ?? '')
  const [safety, setSafety] = useState<string[]>(initial?.safety ?? [])
  const [standards, setStandards] = useState<string[]>(initial?.standards ?? [])
  const [otherStandards, setOtherStandards] = useState(initial?.other_standards ?? '')
  // Référentiels proposés : ceux de l'entreprise (Paramètres), sinon la liste par défaut
  const [standardOptions, setStandardOptions] = useState<string[]>([...DEFAULT_STANDARDS])
  const [finished, setFinished] = useState(initial?.finished ?? true)
  const [finishedDate, setFinishedDate] = useState(initial?.finished_date ?? (completedAt ?? new Date().toISOString()).slice(0, 10))
  const [remaining, setRemaining] = useState(initial?.remaining ?? '')
  const [prefilling, setPrefilling] = useState(!initial)
  const [step, setStep] = useState<'form' | 'sign'>('form')
  const [signName, setSignName] = useState(initial?.signed_by_name ?? '')
  const [signData, setSignData] = useState<string | null>(initial?.signature_data_url ?? null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    void getInvoicingSettings(organizationId)
      .then((s) => { if (alive) setStandardOptions(standardsFor(s?.standards_list)) })
      .catch(() => {})
    return () => { alive = false }
  }, [organizationId])

  // Premier bon : description et travaux restants préremplis depuis le rapport
  useEffect(() => {
    if (initial) return
    let cancelled = false
    void (async () => {
      try {
        const [anomalies, checks] = await Promise.all([
          listAnomaliesForIntervention(intervention.id).catch(() => []),
          supabase.from('equipment_checks').select('verdict').eq('intervention_id', intervention.id).neq('verdict', 'non_verifie'),
        ])
        const active = anomalies.filter((a) => ACTIVE_ANOMALY_STATUSES.includes(a.status))
        const units = active.length ? await listEquipmentUnitsByIds(active.map((a) => a.equipment_unit_id)).catch(() => []) : []
        const unitById = new Map(units.map((u) => [u.id, u]))
        const count = (checks.data ?? []).length
        const typeLabel = intervention.intervention_type ? INTERVENTION_TYPE_LABELS[intervention.intervention_type] : 'Intervention'
        const what = formatEquipmentTypes(equipmentTypes as never)
        const lines = active.map((a) => {
          const u = a.equipment_unit_id ? unitById.get(a.equipment_unit_id) : undefined
          return `${u ? `${unitRepere(u)} · ` : ''}${a.title}${a.action ? ` (${ANOMALY_ACTION_LABELS[a.action].toLowerCase()})` : ''}`
        })
        if (cancelled) return
        setDescription(`${typeLabel}${what !== '—' ? ` · ${what}` : ''}${count ? ` : ${count} équipement${count > 1 ? 's' : ''} contrôlé${count > 1 ? 's' : ''}.` : '.'}`)
        setRemaining(lines.join('\n'))
        setFinished(lines.length === 0)
      } finally {
        if (!cancelled) setPrefilling(false)
      }
    })()
    return () => { cancelled = true }
  }, [initial, intervention.id, intervention.intervention_type, equipmentTypes])

  // Signature : celle du rapport, sinon celle prise sur le bon
  const ownSignature = signName.trim() && signData ? { name: signName.trim(), dataUrl: signData } : null
  const signatureToUse = reportSignature ?? ownSignature

  async function save(withOwnSignature: boolean) {
    if (isOffline()) { setError('Sans réseau : le bon d\'intervention sera possible dès le retour du réseau.'); return }
    if (withOwnSignature && !ownSignature) return
    setSaving(true)
    setError(null)
    try {
      const signed = reportSignature ?? (withOwnSignature ? ownSignature : initial?.signature_data_url && initial.signed_by_name ? { name: initial.signed_by_name, dataUrl: initial.signature_data_url } : null)
      const signedAt = reportSignature ? completedAt : withOwnSignature ? new Date().toISOString() : initial?.signed_at ?? null
      const [settings, clientInfo] = await Promise.all([
        getInvoicingSettings(organizationId).catch(() => null),
        loadReportClientInfo(intervention.client_id).catch(() => null),
      ])
      const extra = otherStandards.split(/[,;\n]/).map((x) => x.trim()).filter(Boolean)
      const data: WorkOrderPdfData = {
        reference: intervention.reference,
        visitDate: completedAt ?? intervention.scheduled_date ?? todayIso(),
        clientName: clientInfo?.name ?? intervention.client_name,
        clientLines: clientInfo ? clientInfoLines(clientInfo) : [],
        siteName: intervention.site_name,
        siteAddress: interventionAddress(intervention) || null,
        dossierNumber: intervention.dossier_number?.trim() || null,
        // Binôme : « Karim Benali + Julien Moreau »
        technicianName: technicianLabel(intervention),
        arrivalAt: intervention.started_at ?? null,
        departureAt: completedAt ?? new Date().toISOString(),
        // Libellés courts sur le PDF (« BAES » et non « BAES (éclairage de sécurité) »)
        domains: Object.entries(EQUIPMENT_TYPES).map(([k, label]) => ({ label: label.replace(/\s*\(.*\)$/, ''), checked: equipmentTypes.includes(k) })),
        natures: WORK_NATURES.map((n) => ({ label: WORK_NATURE_LABELS[n], checked: n === nature })),
        description,
        safety: SAFETY_ITEMS.map((x) => ({ label: x, checked: safety.includes(x) })),
        standards: [...standardOptions.filter((x) => standards.includes(x)), ...standards.filter((x) => !standardOptions.includes(x)), ...extra],
        finished,
        finishedDate: finished ? finishedDate : null,
        remaining,
        signedByName: signed?.name ?? null,
        signatureDataUrl: signed?.dataUrl ?? null,
        signedAt,
      }
      const stored = await renderAndStoreReportPdf(
        <WorkOrderPdf data={data} organizationName={organizationName} settings={settings} />,
        organizationId, intervention.id, intervention.reference, '', 'bon-intervention',
      )
      const workOrder: WorkOrder = {
        nature,
        description,
        safety,
        standards,
        other_standards: otherStandards,
        finished,
        finished_date: finished ? finishedDate : null,
        remaining,
        // Signature propre au bon (celle du rapport n'est pas recopiée)
        signed_by_name: reportSignature ? null : signed?.name ?? null,
        signature_data_url: reportSignature ? null : signed?.dataUrl ?? null,
        signed_at: reportSignature ? null : signedAt,
        pdf_url: stored.url,
        pdf_path: stored.path,
        updated_at: new Date().toISOString(),
      }
      await saveWorkOrder(reportId, workOrder)
      const dossier = intervention.dossier_number?.trim()
      if (dossier) {
        await linkDossierDocument({
          organizationId,
          dossierNumber: dossier,
          kind: 'report',
          title: `Bon d'intervention ${intervention.reference}`,
          filePath: stored.path,
          fileUrl: stored.url,
          fileName: stored.fileName,
          sizeBytes: stored.size,
          createdByName,
        }).catch((e) => console.warn('Rangement du bon d\'intervention dans le dossier échoué', e))
      }
      onSaved(workOrder)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur lors de la création du bon d\'intervention.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <ModalPortal>
      <div className="overlay open" style={{ zIndex: 9999 }}>
        <div className="modal" style={{ maxWidth: 680 }}>
          <div className="modal-head">
            <span className="modal-title">Bon d'intervention · {intervention.reference}</span>
            <button type="button" className="modal-x" onClick={onClose} disabled={saving} aria-label="Fermer">×</button>
          </div>

          {step === 'form' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '.9rem' }}>
              <p className="text-ink-3 text-xs" style={{ margin: 0 }}>
                Date, client, lieu, technicien, heures d'arrivée et de départ et domaines sont repris de l'intervention et du rapport.
              </p>

              <div className="fg">
                <label>Nature de l'intervention</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                  {WORK_NATURES.map((n) => (
                    <button key={n} type="button" className={`filter-pill${nature === n ? ' on' : ''}`} onClick={() => setNature(n)}>
                      {WORK_NATURE_LABELS[n]}
                    </button>
                  ))}
                </div>
              </div>

              <div className="fg">
                <label>Description des travaux</label>
                <textarea
                  className="report-textarea"
                  style={{ minHeight: 70 }}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder={prefilling ? 'Préparation…' : 'Ex : Vérification annuelle du désenfumage'}
                />
              </div>

              <div className="fg">
                <label>Sécurité sur place <span className="text-ink-3 text-xs font-light">(facultatif)</span></label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                  {SAFETY_ITEMS.map((x) => (
                    <button key={x} type="button" className={`filter-pill${safety.includes(x) ? ' on' : ''}`} onClick={() => setSafety((l) => toggle(l, x))}>
                      {x}
                    </button>
                  ))}
                </div>
              </div>

              <div className="fg">
                <label>Référentiels <span className="text-ink-3 text-xs font-light">(facultatif)</span></label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                  {standardOptions.map((x) => (
                    <button key={x} type="button" className={`filter-pill${standards.includes(x) ? ' on' : ''}`} onClick={() => setStandards((l) => toggle(l, x))}>
                      {x}
                    </button>
                  ))}
                </div>
                <input
                  type="text"
                  value={otherStandards}
                  onChange={(e) => setOtherStandards(e.target.value)}
                  placeholder="Autres référentiels ou certifications, séparés par des virgules"
                  style={{ marginTop: 6 }}
                />
              </div>

              <div className="mrow">
                <div className="fg">
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <input type="checkbox" checked={finished} onChange={(e) => setFinished(e.target.checked)} style={{ width: 'auto' }} />
                    Travaux finis et testés (RAS)
                  </label>
                  {finished && <input type="date" value={finishedDate} onChange={(e) => setFinishedDate(e.target.value)} />}
                </div>
                <div className="fg">
                  <label>Travaux restants à faire</label>
                  <textarea
                    className="report-textarea"
                    style={{ minHeight: 60 }}
                    value={remaining}
                    onChange={(e) => setRemaining(e.target.value)}
                    placeholder="Aucun"
                  />
                </div>
              </div>

              <div className="text-ink-2 text-sm">
                {reportSignature
                  ? <>Signature du client : celle du rapport ({reportSignature.name || 'client'}), reprise sans la demander une deuxième fois.</>
                  : initial?.signature_data_url
                    ? <>Déjà signé par {initial.signed_by_name}.</>
                    : <>Le rapport n'est pas signé : vous pouvez faire signer le bon maintenant, ou le créer sans signature.</>}
              </div>

              {error && <span className="ferr on">{error}</span>}

              <div className="modal-foot" style={{ flexWrap: 'wrap' }}>
                <button type="button" className="mf out" onClick={onClose} disabled={saving}>Annuler</button>
                {!signatureToUse && !initial?.signature_data_url && (
                  <button
                    type="button"
                    className="mf out"
                    onClick={() => setStep('sign')}
                    disabled={saving || prefilling}
                    style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                  >
                    <PenLine size={14} /> Faire signer
                  </button>
                )}
                <button
                  type="button"
                  className="mf prim"
                  onClick={() => void save(false)}
                  disabled={saving || prefilling}
                  style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                >
                  <FileText size={14} /> {saving ? 'Création…' : 'Créer le PDF'}
                </button>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '.8rem' }}>
              <p className="text-ink-2 text-sm" style={{ margin: 0 }}>
                En signant, le client atteste du passage du technicien et des travaux décrits sur le bon.
              </p>
              <div className="fg">
                <label>Nom et fonction du signataire</label>
                <input type="text" value={signName} onChange={(e) => setSignName(e.target.value)} placeholder="Ex : Jean Dupont, gardien" autoComplete="off" />
              </div>
              <SignaturePad value={signData} onChange={setSignData} />
              {error && <span className="ferr on">{error}</span>}
              <div className="modal-foot">
                <button type="button" className="mf out" onClick={() => setStep('form')} disabled={saving}>Retour</button>
                <button type="button" className="mf prim" onClick={() => void save(true)} disabled={saving || !ownSignature}>
                  {saving ? 'Création…' : 'Valider et créer le PDF'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </ModalPortal>
  )
}

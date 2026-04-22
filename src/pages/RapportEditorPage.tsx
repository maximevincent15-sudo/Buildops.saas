import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import {
  AlertTriangle,
  ArrowLeft,
  CalendarPlus,
  CheckCircle2,
  Download,
  FileText,
  XCircle,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAuthStore } from '../features/auth/store'
import { InterventionModal } from '../features/planning/components/InterventionModal'
import { setInterventionStatus } from '../features/planning/api'
import { normalizeIntervention } from '../features/planning/schemas'
import type { Intervention } from '../features/planning/schemas'
import {
  finalizeReport,
  getReportByIntervention,
  saveDraftReport,
  setReportPdfUrl,
} from '../features/rapports/api'
import { CHECKLISTS } from '../features/rapports/checklists'
import { ChecklistSection } from '../features/rapports/components/ChecklistSection'
import { generateAndUploadReportPdf } from '../features/rapports/pdf/generateReportPdf'
import { ReportPdf } from '../features/rapports/pdf/ReportPdf'
import {
  RECOMMENDED_ACTION_LABEL,
  computeReportSummary,
} from '../features/rapports/schemas'
import type { ChecklistResponse, Report } from '../features/rapports/schemas'
import {
  EQUIPMENT_TYPES,
  formatEquipmentTypes,
  resolveEquipmentTypes,
} from '../shared/constants/interventions'
import type { EquipmentType } from '../shared/constants/interventions'
import type { StoredPhoto } from '../shared/lib/storage'
import { supabase } from '../shared/lib/supabase'
import { PhotoUploader } from '../shared/ui/PhotoUploader'
import { SignaturePad } from '../shared/ui/SignaturePad'

export function RapportEditorPage() {
  const { interventionId } = useParams<{ interventionId: string }>()
  const navigate = useNavigate()
  const profile = useAuthStore((s) => s.profile)

  const [intervention, setIntervention] = useState<Intervention | null>(null)
  const [equipmentType, setEquipmentType] = useState<EquipmentType | null>(null)
  const [checklist, setChecklist] = useState<ChecklistResponse[]>([])
  const [observations, setObservations] = useState('')
  const [signedBy, setSignedBy] = useState('')
  const [signature, setSignature] = useState<string | null>(null)
  const [photos, setPhotos] = useState<StoredPhoto[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [generatingPdf, setGeneratingPdf] = useState(false)
  const [completedAt, setCompletedAt] = useState<string | null>(null)
  const [pdfUrl, setPdfUrl] = useState<string | null>(null)
  const [reportId, setReportId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [flash, setFlash] = useState<string | null>(null)
  const [correctiveOpen, setCorrectiveOpen] = useState(false)

  useEffect(() => {
    if (!interventionId) return
    let alive = true
    ;(async () => {
      setLoading(true)
      try {
        const { data: interv, error: intervErr } = await supabase
          .from('interventions')
          .select('*')
          .eq('id', interventionId)
          .single()
        if (intervErr) throw intervErr
        if (!alive) return
        const normalized = normalizeIntervention(interv as Intervention)
        setIntervention(normalized)
        const types = resolveEquipmentTypes(normalized) as EquipmentType[]
        if (types.length > 0 && !equipmentType) {
          setEquipmentType(types[0]!)
        }

        const report = await getReportByIntervention(interventionId)
        if (!alive) return
        if (report) {
          setReportId(report.id)
          setChecklist((report.checklist ?? []) as ChecklistResponse[])
          setObservations(report.observations ?? '')
          setSignedBy(report.signed_by_name ?? '')
          setSignature(report.signature_data_url ?? null)
          setPhotos((report.photos ?? []) as StoredPhoto[])
          setCompletedAt(report.completed_at)
          setPdfUrl(report.pdf_url ?? null)
          if (report.equipment_type) {
            setEquipmentType(report.equipment_type as EquipmentType)
          }
        }
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : 'Erreur inconnue')
      } finally {
        if (alive) setLoading(false)
      }
    })()
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [interventionId])

  const availableTypes = useMemo<EquipmentType[]>(() => {
    if (!intervention) return []
    return resolveEquipmentTypes(intervention) as EquipmentType[]
  }, [intervention])

  if (loading) {
    return (
      <div className="card">
        <p className="text-ink-2 text-sm font-light">Chargement du rapport…</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="card">
        <p className="text-red text-sm">Erreur : {error}</p>
        <Link to="/planning" className="btn-sm" style={{ marginTop: '1rem', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <ArrowLeft size={14} /> Retour au planning
        </Link>
      </div>
    )
  }

  if (!intervention || !interventionId || !profile?.organization_id) {
    return (
      <div className="card">
        <p className="text-ink-2 text-sm font-light">Intervention introuvable.</p>
        <Link to="/planning" className="btn-sm" style={{ marginTop: '1rem' }}>← Retour au planning</Link>
      </div>
    )
  }

  const items = equipmentType ? CHECKLISTS[equipmentType] ?? [] : []
  const summary = computeReportSummary(checklist, items.length)
  const isCompleted = !!completedAt
  const orgId = profile.organization_id
  const iid = interventionId
  const orgName = profile.organizations?.name ?? ''

  // Items NOK sans photo ni justification
  const nokWithoutPhoto = items.filter((it) => {
    const r = checklist.find((c) => c.id === it.id)
    if (!r || r.value !== 'nok') return false
    const hasPhoto = (r.photos ?? []).length > 0
    const hasReason = !!r.noPhotoReason && r.noPhotoReason.trim().length > 0
    return !hasPhoto && !hasReason
  })
  const nokWithoutAction = items.filter((it) => {
    const r = checklist.find((c) => c.id === it.id)
    return r?.value === 'nok' && !r.action
  })

  // Anomalies pour la synthèse
  const anomalies = items.flatMap((it) => {
    const r = checklist.find((c) => c.id === it.id)
    if (r?.value !== 'nok') return []
    return [{ label: it.label, action: r.action, note: r.note }]
  })

  function currentReportSnapshot(): Report {
    return {
      id: reportId ?? '',
      intervention_id: iid,
      organization_id: orgId,
      equipment_type: equipmentType,
      checklist,
      observations: observations || null,
      signed_by_name: signedBy || null,
      signature_data_url: signature,
      photos,
      pdf_url: pdfUrl,
      completed_at: completedAt ?? new Date().toISOString(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
  }

  async function regeneratePdfFromCurrent(): Promise<string> {
    const snapshot = currentReportSnapshot()
    const element = (
      <ReportPdf
        intervention={intervention!}
        report={snapshot}
        checklistItems={items}
        organizationName={orgName}
      />
    )
    return generateAndUploadReportPdf(element, orgId, iid, intervention!.reference)
  }

  async function handleSaveDraft() {
    setSaving(true)
    setFlash(null)
    try {
      const saved = await saveDraftReport(iid, orgId, {
        checklist,
        equipment_type: equipmentType ?? undefined,
        observations,
        signed_by_name: signedBy,
        signature_data_url: signature,
        photos,
      })
      setReportId(saved.id)
      setFlash('Brouillon enregistré.')
      setTimeout(() => setFlash(null), 2500)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur inconnue')
    } finally {
      setSaving(false)
    }
  }

  async function handleFinalize() {
    // Gardes obligatoires avant finalisation
    if (nokWithoutPhoto.length > 0) {
      alert(
        `${nokWithoutPhoto.length} anomalie(s) sans photo ni justification :\n\n` +
          nokWithoutPhoto.map((it) => `• ${it.label}`).join('\n') +
          `\n\nAjoute une photo ou clique sur "Impossible de prendre une photo ? Justifier" avant de finaliser.`,
      )
      return
    }
    if (nokWithoutAction.length > 0) {
      alert(
        `${nokWithoutAction.length} anomalie(s) sans action recommandée :\n\n` +
          nokWithoutAction.map((it) => `• ${it.label}`).join('\n') +
          `\n\nChoisis Remplacement / Réparation / Vérification pour chaque anomalie.`,
      )
      return
    }
    const unanswered = items.length - summary.answered
    if (unanswered > 0) {
      const ok = window.confirm(
        `${unanswered} point(s) de contrôle non renseigné(s).\n\nFinaliser quand même ?`,
      )
      if (!ok) return
    }
    if (!signedBy.trim()) {
      const ok = window.confirm(
        `Aucun nom de signataire renseigné.\n\nFinaliser quand même ?`,
      )
      if (!ok) return
    }
    setSaving(true)
    setError(null)
    try {
      const saved = await finalizeReport(iid, orgId, {
        checklist,
        equipment_type: equipmentType ?? undefined,
        observations,
        signed_by_name: signedBy,
        signature_data_url: signature,
        photos,
      })
      setReportId(saved.id)
      setCompletedAt(saved.completed_at)

      try {
        const newPdfUrl = await regeneratePdfFromCurrent()
        await setReportPdfUrl(saved.id, newPdfUrl)
      } catch (pdfErr) {
        console.error('Génération PDF échouée', pdfErr)
      }

      await setInterventionStatus(iid, 'terminee')
      navigate('/planning')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur inconnue')
    } finally {
      setSaving(false)
    }
  }

  async function handleRegeneratePdf() {
    setGeneratingPdf(true)
    setError(null)
    setFlash(null)
    try {
      const newUrl = await regeneratePdfFromCurrent()
      if (reportId) {
        await setReportPdfUrl(reportId, newUrl)
      }
      setPdfUrl(newUrl)
      setFlash('PDF généré.')
      setTimeout(() => setFlash(null), 2500)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur lors de la génération du PDF.')
    } finally {
      setGeneratingPdf(false)
    }
  }

  // Pré-remplit une intervention corrective avec les anomalies
  const correctiveSeed = useMemo(() => {
    if (!intervention) return null
    const anomaliesText = anomalies.length > 0
      ? 'Anomalies à traiter :\n' +
        anomalies.map((a) =>
          `• ${a.label}${a.action ? ` (${RECOMMENDED_ACTION_LABEL[a.action]})` : ''}${a.note ? ` — ${a.note}` : ''}`,
        ).join('\n')
      : ''
    const notes =
      `Intervention corrective suite au rapport ${intervention.reference}` +
      (anomaliesText ? '\n\n' + anomaliesText : '')
    return {
      client_name: intervention.client_name,
      client_id: intervention.client_id ?? '',
      site_name: intervention.site_name ?? '',
      address: intervention.address ?? '',
      equipment_types: equipmentType ? [equipmentType] : [],
      technician_name: intervention.technician_name ?? '',
      technician_id: intervention.technician_id ?? '',
      scheduled_date: '',
      priority: 'urgente' as const,
      notes,
    }
  }, [intervention, anomalies, equipmentType])

  const scheduledLabel = intervention.scheduled_date
    ? format(new Date(intervention.scheduled_date), 'd MMMM yyyy', { locale: fr })
    : '—'
  const equipmentsLabel = formatEquipmentTypes(intervention.equipment_types)

  return (
    <>
      <div className="dash-top">
        <div>
          <div className="dash-title" style={{ display: 'flex', alignItems: 'center', gap: '.7rem' }}>
            Rapport {intervention.reference}
            {isCompleted && (
              <span className="badge b-grn" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <CheckCircle2 size={11} /> Finalisé
              </span>
            )}
          </div>
          <div className="dash-sub">
            {intervention.client_name} · {equipmentsLabel} · prévu le {scheduledLabel}
          </div>
        </div>
        <div className="dash-acts">
          {pdfUrl && (
            <a
              href={pdfUrl}
              target="_blank"
              rel="noreferrer"
              className="btn-sm acc"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
            >
              <Download size={14} /> Télécharger PDF
            </a>
          )}
          <Link to="/planning" className="btn-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <ArrowLeft size={14} /> Planning
          </Link>
        </div>
      </div>

      {/* Sélecteur d'équipement si l'intervention en a plusieurs */}
      {availableTypes.length > 1 && (
        <div className="card" style={{ marginBottom: '1rem' }}>
          <div className="card-top">
            <span className="card-title">Équipement contrôlé dans ce rapport</span>
          </div>
          <div className="equip-pills" style={{ marginTop: '.4rem' }}>
            {availableTypes.map((t) => (
              <button
                key={t}
                type="button"
                className={`equip-pill${equipmentType === t ? ' on' : ''}`}
                onClick={() => {
                  if (isCompleted) return
                  if (checklist.length > 0 && t !== equipmentType) {
                    const ok = window.confirm(
                      'Changer de type va vider la checklist en cours. Continuer ?',
                    )
                    if (!ok) return
                    setChecklist([])
                  }
                  setEquipmentType(t)
                }}
                disabled={isCompleted}
              >
                {EQUIPMENT_TYPES[t]}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Bandeau synthèse / conformité */}
      {items.length > 0 && (
        <div className={`report-summary ${
          summary.isConform === true ? 'conform' :
          summary.isConform === false ? 'non-conform' :
          'partial'
        }`}>
          <div className="report-summary-badge">
            {summary.isConform === true && (
              <>
                <CheckCircle2 size={22} strokeWidth={2.2} />
                <span>CONFORME</span>
              </>
            )}
            {summary.isConform === false && (
              <>
                <XCircle size={22} strokeWidth={2.2} />
                <span>NON CONFORME</span>
              </>
            )}
            {summary.isConform === null && (
              <>
                <AlertTriangle size={22} strokeWidth={2.2} />
                <span>INCOMPLET</span>
              </>
            )}
          </div>
          <div className="report-summary-body">
            {summary.isConform === true && (
              <div className="report-summary-title">
                Tous les points de contrôle sont conformes.
              </div>
            )}
            {summary.isConform === false && (
              <>
                <div className="report-summary-title">
                  {summary.nokCount} anomalie{summary.nokCount > 1 ? 's' : ''} détectée{summary.nokCount > 1 ? 's' : ''}
                </div>
                <ul className="report-summary-list">
                  {anomalies.slice(0, 5).map((a, i) => (
                    <li key={i}>
                      <strong>{a.label}</strong>
                      {a.action && <span className="report-anom-action"> · {RECOMMENDED_ACTION_LABEL[a.action]}</span>}
                    </li>
                  ))}
                  {anomalies.length > 5 && (
                    <li className="text-ink-3">… et {anomalies.length - 5} autre{anomalies.length - 5 > 1 ? 's' : ''}</li>
                  )}
                </ul>
              </>
            )}
            {summary.isConform === null && (
              <div className="report-summary-title">
                {summary.answered} / {summary.total} points renseignés
              </div>
            )}
          </div>
          {summary.isConform === false && !isCompleted && (
            <button
              type="button"
              className="btn-sm"
              onClick={() => setCorrectiveOpen(true)}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}
            >
              <CalendarPlus size={13} strokeWidth={2} />
              Planifier une intervention corrective
            </button>
          )}
        </div>
      )}

      {items.length === 0 && (
        <div className="card">
          <p className="text-ink-2 text-sm font-light">
            Aucun type d'équipement défini pour cette intervention. Va l'éditer depuis le planning pour en ajouter.
          </p>
        </div>
      )}

      {items.length > 0 && (
        <div className="card">
          <div className="card-top">
            <span className="card-title">Checklist de contrôle — {equipmentType ? EQUIPMENT_TYPES[equipmentType] : ''}</span>
            <span className="text-ink-3 text-xs font-light">
              {summary.answered}/{summary.total} renseignés
            </span>
          </div>
          <ChecklistSection
            items={items}
            responses={checklist}
            onChange={setChecklist}
            organizationId={orgId}
            interventionId={iid}
            readOnly={isCompleted}
          />
        </div>
      )}

      <div className="card" style={{ marginTop: '1rem' }}>
        <div className="card-top">
          <span className="card-title">Observations générales</span>
        </div>
        <textarea
          value={observations}
          onChange={(e) => setObservations(e.target.value)}
          placeholder="Ex: remarques globales sur l'état du site, accès, informations pour la prochaine visite…"
          disabled={isCompleted}
          className="report-textarea"
        />
      </div>

      <div className="card" style={{ marginTop: '1rem' }}>
        <div className="card-top">
          <span className="card-title">Client qui valide sur place</span>
        </div>
        <input
          type="text"
          value={signedBy}
          onChange={(e) => setSignedBy(e.target.value)}
          placeholder="Nom du responsable signataire"
          disabled={isCompleted}
          className="report-input"
          style={{ marginBottom: '1rem' }}
        />
        <SignaturePad
          value={signature}
          onChange={setSignature}
          readOnly={isCompleted}
        />
      </div>

      <div className="card" style={{ marginTop: '1rem' }}>
        <div className="card-top">
          <span className="card-title">Photos complémentaires</span>
          {photos.length > 0 && (
            <span className="text-ink-3 text-xs font-light">{photos.length} photo{photos.length > 1 ? 's' : ''}</span>
          )}
        </div>
        <p className="text-ink-3 text-xs font-light" style={{ marginTop: '-.4rem', marginBottom: '.8rem' }}>
          Photos globales du site ou de contexte. Les photos d'anomalies sont gérées directement sur chaque ligne de la checklist.
        </p>
        <PhotoUploader
          photos={photos}
          onChange={setPhotos}
          organizationId={orgId}
          interventionId={iid}
          readOnly={isCompleted}
        />
      </div>

      {error && (
        <p className="text-red text-sm" style={{ marginTop: '1rem' }}>Erreur : {error}</p>
      )}

      {flash && (
        <p className="text-grn text-sm" style={{ marginTop: '1rem' }}>{flash}</p>
      )}

      {!isCompleted && (
        <div style={{ display: 'flex', gap: '.7rem', marginTop: '1.5rem', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          <button type="button" className="btn-sm" onClick={() => void handleSaveDraft()} disabled={saving}>
            {saving ? 'Enregistrement…' : 'Enregistrer brouillon'}
          </button>
          <button type="button" className="btn-sm acc" onClick={() => void handleFinalize()} disabled={saving}>
            {saving ? 'Finalisation + PDF…' : 'Finaliser + générer PDF'}
          </button>
        </div>
      )}

      {isCompleted && (
        <div style={{ display: 'flex', gap: '.7rem', marginTop: '1.5rem', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap' }}>
          <p className="text-ink-3 text-xs font-light" style={{ margin: 0 }}>
            Ce rapport a été finalisé le {format(new Date(completedAt!), 'd MMMM yyyy à HH:mm', { locale: fr })}.
          </p>
          <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap' }}>
            {summary.isConform === false && (
              <button
                type="button"
                className="btn-sm"
                onClick={() => setCorrectiveOpen(true)}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
              >
                <CalendarPlus size={13} /> Planifier une correction
              </button>
            )}
            <button
              type="button"
              className="btn-sm"
              onClick={() => void handleRegeneratePdf()}
              disabled={generatingPdf}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
            >
              <FileText size={14} />
              {generatingPdf ? 'Génération…' : pdfUrl ? 'Régénérer le PDF' : 'Générer le PDF'}
            </button>
          </div>
        </div>
      )}

      {/* Modale intervention corrective */}
      {correctiveOpen && correctiveSeed && (
        <InterventionModal
          open={correctiveOpen}
          onClose={() => setCorrectiveOpen(false)}
          seed={correctiveSeed}
          onChanged={() => {
            setCorrectiveOpen(false)
            setFlash('Intervention corrective créée.')
            setTimeout(() => setFlash(null), 3000)
          }}
        />
      )}
    </>
  )
}

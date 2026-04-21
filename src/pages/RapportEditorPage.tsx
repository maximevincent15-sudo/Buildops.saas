import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import { ArrowLeft, CheckCircle2, Download, FileText } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAuthStore } from '../features/auth/store'
import { setInterventionStatus } from '../features/planning/api'
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
import type { ChecklistResponse, Report } from '../features/rapports/schemas'
import { EQUIPMENT_TYPES } from '../shared/constants/interventions'
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
        setIntervention(interv as Intervention)

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
        }
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : 'Erreur inconnue')
      } finally {
        if (alive) setLoading(false)
      }
    })()
    return () => { alive = false }
  }, [interventionId])

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

  const items = CHECKLISTS[intervention.equipment_type as EquipmentType] ?? []
  const isCompleted = !!completedAt
  const answeredCount = items.filter((it) => checklist.some((r) => r.id === it.id && r.value !== null)).length
  const orgId = profile.organization_id
  const iid = interventionId
  const orgName = profile.organizations?.name ?? ''

  function currentReportSnapshot(): Report {
    return {
      id: reportId ?? '',
      intervention_id: iid,
      organization_id: orgId,
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
    const unanswered = items.length - answeredCount
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
        observations,
        signed_by_name: signedBy,
        signature_data_url: signature,
        photos,
      })
      setReportId(saved.id)
      setCompletedAt(saved.completed_at)

      // Génère et upload le PDF en parallèle de la mise à jour du statut
      try {
        const newPdfUrl = await regeneratePdfFromCurrent()
        await setReportPdfUrl(saved.id, newPdfUrl)
      } catch (pdfErr) {
        // Le rapport est finalisé même si le PDF échoue — on notifie juste
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

  const equipmentLabel = EQUIPMENT_TYPES[intervention.equipment_type as EquipmentType] ?? intervention.equipment_type
  const scheduledLabel = intervention.scheduled_date
    ? format(new Date(intervention.scheduled_date), 'd MMMM yyyy', { locale: fr })
    : '—'

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
            {intervention.client_name} · {equipmentLabel} · prévu le {scheduledLabel}
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

      <div className="card">
        <div className="card-top">
          <span className="card-title">Checklist de contrôle</span>
          <span className="text-ink-3 text-xs font-light">
            {answeredCount}/{items.length} renseignés
          </span>
        </div>
        <ChecklistSection
          items={items}
          responses={checklist}
          onChange={setChecklist}
          readOnly={isCompleted}
        />
      </div>

      <div className="card" style={{ marginTop: '1rem' }}>
        <div className="card-top">
          <span className="card-title">Observations et anomalies</span>
        </div>
        <textarea
          value={observations}
          onChange={(e) => setObservations(e.target.value)}
          placeholder="Ex: un extincteur manquant au RDC, remplacement à prévoir. Plombage à refaire sur l'extincteur du palier 2e étage…"
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
          <span className="card-title">Photos</span>
          {photos.length > 0 && (
            <span className="text-ink-3 text-xs font-light">{photos.length} photo{photos.length > 1 ? 's' : ''}</span>
          )}
        </div>
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
      )}
    </>
  )
}

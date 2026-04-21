import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import { ArrowLeft, CheckCircle2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAuthStore } from '../features/auth/store'
import { setInterventionStatus } from '../features/planning/api'
import type { Intervention } from '../features/planning/schemas'
import { finalizeReport, getReportByIntervention, saveDraftReport } from '../features/rapports/api'
import { CHECKLISTS } from '../features/rapports/checklists'
import { ChecklistSection } from '../features/rapports/components/ChecklistSection'
import type { ChecklistResponse } from '../features/rapports/schemas'
import { EQUIPMENT_TYPES } from '../shared/constants/interventions'
import type { EquipmentType } from '../shared/constants/interventions'
import { supabase } from '../shared/lib/supabase'
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
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [completedAt, setCompletedAt] = useState<string | null>(null)
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
          setChecklist((report.checklist ?? []) as ChecklistResponse[])
          setObservations(report.observations ?? '')
          setSignedBy(report.signed_by_name ?? '')
          setSignature(report.signature_data_url ?? null)
          setCompletedAt(report.completed_at)
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

  async function handleSaveDraft() {
    setSaving(true)
    setFlash(null)
    try {
      await saveDraftReport(iid, orgId, {
        checklist,
        observations,
        signed_by_name: signedBy,
        signature_data_url: signature,
      })
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
      await finalizeReport(iid, orgId, {
        checklist,
        observations,
        signed_by_name: signedBy,
        signature_data_url: signature,
      })
      await setInterventionStatus(iid, 'terminee')
      navigate('/planning')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur inconnue')
    } finally {
      setSaving(false)
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
            {saving ? 'Finalisation…' : 'Finaliser le rapport'}
          </button>
        </div>
      )}

      {isCompleted && (
        <div style={{ marginTop: '1.5rem' }}>
          <p className="text-ink-3 text-xs font-light">
            Ce rapport a été finalisé le {format(new Date(completedAt!), 'd MMMM yyyy à HH:mm', { locale: fr })}.
            L'intervention est marquée "Terminée".
          </p>
        </div>
      )}
    </>
  )
}

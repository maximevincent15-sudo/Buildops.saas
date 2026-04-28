import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import {
  AlertTriangle,
  ArrowLeft,
  CalendarPlus,
  CheckCircle2,
  Download,
  FileText,
  Mail,
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
import { ReportHistoryList } from '../features/rapports/components/ReportHistoryList'
import { SendToClientModal } from '../features/rapports/components/SendToClientModal'
import { generateAndUploadReportPdf } from '../features/rapports/pdf/generateReportPdf'
import { ReportPdf } from '../features/rapports/pdf/ReportPdf'
import {
  RECOMMENDED_ACTION_LABEL,
  byTypeToResponses,
  computeGlobalSummary,
  computeReportSummary,
  responsesToByType,
} from '../features/rapports/schemas'
import type { ChecklistByType, ChecklistResponse, Report } from '../features/rapports/schemas'
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
  // Checklist par équipement : Record<type, ChecklistResponse[]>
  // On garde TOUTES les checklists en mémoire pour que changer de type ne perde rien.
  const [checklistByType, setChecklistByType] = useState<ChecklistByType>({})
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
  const [sendOpen, setSendOpen] = useState(false)
  const [sentToEmail, setSentToEmail] = useState<string | null>(null)
  const [sentAt, setSentAt] = useState<string | null>(null)

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
          // Décodage : array plat → Record<type, responses>
          const byType = responsesToByType(
            (report.checklist ?? []) as ChecklistResponse[],
            report.equipment_type ?? null,
          )
          setChecklistByType(byType)
          setObservations(report.observations ?? '')
          setSignedBy(report.signed_by_name ?? '')
          setSignature(report.signature_data_url ?? null)
          setPhotos((report.photos ?? []) as StoredPhoto[])
          setCompletedAt(report.completed_at)
          setPdfUrl(report.pdf_url ?? null)
          setSentToEmail(report.sent_to_email ?? null)
          setSentAt(report.sent_at ?? null)
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

  // Pré-remplit une intervention corrective avec les anomalies.
  // Ce useMemo DOIT être déclaré avant les early returns pour respecter la règle
  // des hooks React (même nombre de hooks à chaque render).
  const correctiveSeed = useMemo(() => {
    if (!intervention) return null
    // Parcourt TOUS les types contrôlés et leurs anomalies
    const allAnomalies: Array<{ label: string; action?: string; note?: string; type: string }> = []
    for (const [type, responses] of Object.entries(checklistByType)) {
      const itemsForType = CHECKLISTS[type as EquipmentType] ?? []
      for (const it of itemsForType) {
        const r = responses.find((c) => c.id === it.id)
        if (r?.value === 'nok') {
          allAnomalies.push({
            label: it.label,
            action: r.action,
            note: r.note,
            type: EQUIPMENT_TYPES[type as EquipmentType] ?? type,
          })
        }
      }
    }
    const affectedTypes = Array.from(new Set(allAnomalies.map((a) => a.type)))
    const anomaliesText = allAnomalies.length > 0
      ? 'Anomalies à traiter :\n' +
        allAnomalies.map((a) =>
          `• [${a.type}] ${a.label}${a.action ? ` (${RECOMMENDED_ACTION_LABEL[a.action as keyof typeof RECOMMENDED_ACTION_LABEL]})` : ''}${a.note ? ` — ${a.note}` : ''}`,
        ).join('\n')
      : ''
    const notes =
      `Intervention corrective suite au rapport ${intervention.reference}` +
      (anomaliesText ? '\n\n' + anomaliesText : '')
    // Types d'équipement à contrôler = ceux qui ont des anomalies
    const interventionTypes = resolveEquipmentTypes(intervention) as EquipmentType[]
    const seedTypes = interventionTypes.filter((t) =>
      affectedTypes.includes(EQUIPMENT_TYPES[t] ?? t),
    )
    return {
      client_name: intervention.client_name,
      client_id: intervention.client_id ?? '',
      site_name: intervention.site_name ?? '',
      address: intervention.address ?? '',
      equipment_types: seedTypes.length > 0 ? seedTypes : (equipmentType ? [equipmentType] : []),
      technician_name: intervention.technician_name ?? '',
      technician_id: intervention.technician_id ?? '',
      scheduled_date: '',
      priority: 'urgente' as const,
      notes,
    }
  }, [intervention, equipmentType, checklistByType])

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

  // Items du type actuellement affiché (pour la section checklist visible)
  const items = equipmentType ? CHECKLISTS[equipmentType] ?? [] : []
  // Checklist du type actuellement affiché
  const currentChecklist: ChecklistResponse[] = equipmentType
    ? (checklistByType[equipmentType] ?? [])
    : []
  // Synthèse du type affiché (pour compteur haut de section)
  const summary = computeReportSummary(currentChecklist, items.length)

  // Synthèse GLOBALE couvrant tous les types (pour tampon + bouton correctif)
  const totalByType: Record<string, number> = {}
  for (const t of availableTypes) {
    totalByType[t] = (CHECKLISTS[t] ?? []).length
  }
  const globalSummary = computeGlobalSummary(checklistByType, totalByType)

  const isCompleted = !!completedAt
  const orgId = profile.organization_id
  const iid = interventionId
  const orgName = profile.organizations?.name ?? ''

  // Items NOK sans photo ni justification — PARCOURT TOUS LES TYPES
  const nokWithoutPhoto: Array<{ type: EquipmentType; label: string }> = []
  const nokWithoutAction: Array<{ type: EquipmentType; label: string }> = []
  for (const t of availableTypes) {
    const itemsForType = CHECKLISTS[t] ?? []
    const responsesForType = checklistByType[t] ?? []
    for (const it of itemsForType) {
      const r = responsesForType.find((c) => c.id === it.id)
      if (r?.value !== 'nok') continue
      const hasPhoto = (r.photos ?? []).length > 0
      const hasReason = !!r.noPhotoReason && r.noPhotoReason.trim().length > 0
      if (!hasPhoto && !hasReason) {
        nokWithoutPhoto.push({ type: t, label: it.label })
      }
      if (!r.action) {
        nokWithoutAction.push({ type: t, label: it.label })
      }
    }
  }

  // Anomalies GLOBALES pour la synthèse (tous types)
  const anomalies: Array<{ label: string; action?: string; note?: string; typeLabel: string }> = []
  for (const t of availableTypes) {
    const itemsForType = CHECKLISTS[t] ?? []
    const responsesForType = checklistByType[t] ?? []
    for (const it of itemsForType) {
      const r = responsesForType.find((c) => c.id === it.id)
      if (r?.value === 'nok') {
        anomalies.push({
          label: it.label,
          action: r.action,
          note: r.note,
          typeLabel: EQUIPMENT_TYPES[t],
        })
      }
    }
  }

  function currentReportSnapshot(): Report {
    return {
      id: reportId ?? '',
      intervention_id: iid,
      organization_id: orgId,
      equipment_type: equipmentType,
      checklist: byTypeToResponses(checklistByType),
      observations: observations || null,
      signed_by_name: signedBy || null,
      signature_data_url: signature,
      photos,
      pdf_url: pdfUrl,
      sent_to_email: sentToEmail,
      sent_at: sentAt,
      completed_at: completedAt ?? new Date().toISOString(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
  }

  async function regeneratePdfFromCurrent(): Promise<string> {
    const snapshot = currentReportSnapshot()
    // Sections PDF : une par type contrôlé (au moins un OK/NOK/NA) OU par type
    // planifié dans l'intervention — on affiche tout pour être exhaustif.
    const sections = availableTypes.map((t) => ({
      type: t,
      label: EQUIPMENT_TYPES[t] ?? t,
      items: CHECKLISTS[t] ?? [],
      responses: checklistByType[t] ?? [],
    }))
    const element = (
      <ReportPdf
        intervention={intervention!}
        report={snapshot}
        sections={sections}
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
        checklist: byTypeToResponses(checklistByType),
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
    // Gardes obligatoires avant finalisation — sur TOUS les types contrôlés
    if (nokWithoutPhoto.length > 0) {
      alert(
        `${nokWithoutPhoto.length} anomalie(s) sans photo ni justification :\n\n` +
          nokWithoutPhoto.map((it) => `• [${EQUIPMENT_TYPES[it.type]}] ${it.label}`).join('\n') +
          `\n\nAjoute une photo ou clique sur "Impossible de prendre une photo ? Justifier" avant de finaliser.`,
      )
      return
    }
    if (nokWithoutAction.length > 0) {
      alert(
        `${nokWithoutAction.length} anomalie(s) sans action recommandée :\n\n` +
          nokWithoutAction.map((it) => `• [${EQUIPMENT_TYPES[it.type]}] ${it.label}`).join('\n') +
          `\n\nChoisis Remplacement / Réparation / Vérification pour chaque anomalie.`,
      )
      return
    }
    const unanswered = globalSummary.total - globalSummary.answered
    if (unanswered > 0) {
      const ok = window.confirm(
        `${unanswered} point(s) de contrôle non renseigné(s) (toutes équipements confondus).\n\nFinaliser quand même ?`,
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
        checklist: byTypeToResponses(checklistByType),
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

  // correctiveSeed est déclaré plus haut (avant les early returns, règle des hooks)

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
            <span className="text-ink-3 text-xs font-light">
              Chaque équipement a sa propre checklist, tes réponses sont conservées.
            </span>
          </div>
          <div className="equip-pills" style={{ marginTop: '.4rem' }}>
            {availableTypes.map((t) => {
              const doneCount = (checklistByType[t] ?? []).filter((r) => r.value).length
              const totalCount = (CHECKLISTS[t] ?? []).length
              const hasNok = (checklistByType[t] ?? []).some((r) => r.value === 'nok')
              return (
                <button
                  key={t}
                  type="button"
                  className={`equip-pill${equipmentType === t ? ' on' : ''}`}
                  onClick={() => setEquipmentType(t)}
                >
                  {EQUIPMENT_TYPES[t]}
                  <span className="equip-pill-count">
                    {doneCount}/{totalCount}
                  </span>
                  {hasNok && <span className="equip-pill-dot" title="Anomalie détectée" />}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Bandeau synthèse / conformité GLOBALE (tous types confondus) */}
      {globalSummary.total > 0 && (
        <div className={`report-summary ${
          globalSummary.isConform === true ? 'conform' :
          globalSummary.isConform === false ? 'non-conform' :
          'partial'
        }`}>
          <div className="report-summary-badge">
            {globalSummary.isConform === true && (
              <>
                <CheckCircle2 size={22} strokeWidth={2.2} />
                <span>CONFORME</span>
              </>
            )}
            {globalSummary.isConform === false && (
              <>
                <XCircle size={22} strokeWidth={2.2} />
                <span>NON CONFORME</span>
              </>
            )}
            {globalSummary.isConform === null && (
              <>
                <AlertTriangle size={22} strokeWidth={2.2} />
                <span>INCOMPLET</span>
              </>
            )}
          </div>
          <div className="report-summary-body">
            {globalSummary.isConform === true && (
              <div className="report-summary-title">
                Tous les points de contrôle sont conformes ({globalSummary.okCount} OK{globalSummary.naCount > 0 ? ` · ${globalSummary.naCount} N/A` : ''}).
              </div>
            )}
            {globalSummary.isConform === false && (
              <>
                <div className="report-summary-title">
                  {globalSummary.nokCount} anomalie{globalSummary.nokCount > 1 ? 's' : ''} détectée{globalSummary.nokCount > 1 ? 's' : ''}
                </div>
                <ul className="report-summary-list">
                  {anomalies.slice(0, 5).map((a, i) => (
                    <li key={i}>
                      <span className="text-ink-3 text-xs">[{a.typeLabel}]</span> <strong>{a.label}</strong>
                      {a.action && <span className="report-anom-action"> · {RECOMMENDED_ACTION_LABEL[a.action as keyof typeof RECOMMENDED_ACTION_LABEL]}</span>}
                    </li>
                  ))}
                  {anomalies.length > 5 && (
                    <li className="text-ink-3">… et {anomalies.length - 5} autre{anomalies.length - 5 > 1 ? 's' : ''}</li>
                  )}
                </ul>
              </>
            )}
            {globalSummary.isConform === null && (
              <div className="report-summary-title">
                {globalSummary.answered} / {globalSummary.total} points renseignés
              </div>
            )}
          </div>
          {globalSummary.isConform === false && !isCompleted && (
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

      {/* Historique des rapports précédents — utile pour le tech sur place
          (a-t-on déjà signalé un problème ?) */}
      {!isCompleted && intervention.client_id && (
        <div style={{ marginBottom: '1rem' }}>
          <ReportHistoryList
            clientId={intervention.client_id}
            clientName={intervention.client_name}
            siteName={intervention.site_name}
            excludeReportId={reportId}
            limit={3}
            title={`Rapports précédents${intervention.site_name ? ` sur ${intervention.site_name}` : ` chez ${intervention.client_name}`}`}
            emptyMessage="Aucun rapport antérieur — c'est la première intervention enregistrée ici."
            hideIfEmpty
          />
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
            responses={currentChecklist}
            onChange={(newResponses) => {
              if (!equipmentType) return
              setChecklistByType((prev) => ({
                ...prev,
                [equipmentType]: newResponses,
              }))
            }}
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
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <p className="text-ink-3 text-xs font-light" style={{ margin: 0 }}>
              Ce rapport a été finalisé le {format(new Date(completedAt!), 'd MMMM yyyy à HH:mm', { locale: fr })}.
            </p>
            {sentAt && sentToEmail && (
              <p className="text-grn text-xs" style={{ margin: 0, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <Mail size={11} strokeWidth={2} />
                Envoyé à {sentToEmail} le {format(new Date(sentAt), 'd MMMM à HH:mm', { locale: fr })}
              </p>
            )}
          </div>
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
            <button
              type="button"
              className="btn-sm acc"
              onClick={() => setSendOpen(true)}
              disabled={!pdfUrl}
              title={pdfUrl ? 'Envoyer le rapport au client' : 'Génère le PDF d\'abord'}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
            >
              <Mail size={13} strokeWidth={2} />
              {sentAt ? 'Renvoyer au client' : 'Envoyer au client'}
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

      {/* Modale envoi au client */}
      {reportId && intervention && (
        <SendToClientModal
          open={sendOpen}
          onClose={() => setSendOpen(false)}
          reportId={reportId}
          pdfUrl={pdfUrl}
          reference={intervention.reference}
          clientId={intervention.client_id}
          clientName={intervention.client_name}
          equipmentLabel={equipmentType ? EQUIPMENT_TYPES[equipmentType] : formatEquipmentTypes(intervention.equipment_types)}
          organizationName={orgName}
          scheduledDate={intervention.scheduled_date}
          isConform={summary.isConform}
          nokCount={summary.nokCount}
          previousEmail={sentToEmail}
          onSent={() => {
            setSentToEmail((prev) => prev) // le modal rappelle avec l'email ; on rafraîchit via re-fetch
            // Simple refresh des infos d'envoi depuis la DB
            void (async () => {
              const { data } = await supabase
                .from('reports')
                .select('sent_to_email, sent_at')
                .eq('id', reportId)
                .maybeSingle()
              if (data) {
                setSentToEmail((data as { sent_to_email: string | null }).sent_to_email)
                setSentAt((data as { sent_at: string | null }).sent_at)
              }
            })()
            setFlash('Rapport marqué comme envoyé.')
            setTimeout(() => setFlash(null), 2500)
          }}
        />
      )}
    </>
  )
}

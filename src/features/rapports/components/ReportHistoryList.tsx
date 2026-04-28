import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import { AlertTriangle, CheckCircle2, ClipboardCheck, Download, ExternalLink } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { formatEquipmentTypesShort } from '../../../shared/constants/interventions'
import { listReportsForClient } from '../api'
import type { ReportWithIntervention } from '../api'
import { computeReportSummary } from '../schemas'
import type { ChecklistResponse } from '../schemas'

type Props = {
  /** Filtre principal — fournir au moins un client */
  clientId?: string | null
  clientName?: string | null
  /** Restreindre à un site précis (optionnel) */
  siteName?: string | null
  /** Exclure un rapport (pour ne pas afficher le rapport courant dans son propre historique) */
  excludeReportId?: string | null
  /** Limite d'affichage (par défaut 5). 0 = illimité. */
  limit?: number
  /** Titre custom de la section. Par défaut : "Historique des rapports" */
  title?: string
  /** Texte si aucun rapport. Par défaut : "Aucun rapport antérieur." */
  emptyMessage?: string
  /** Si true, n'affiche RIEN si pas de rapport (pour intégrations subtiles) */
  hideIfEmpty?: boolean
}

function formatDate(d: string | null): string {
  if (!d) return '—'
  try {
    return format(new Date(d), 'd MMM yyyy', { locale: fr })
  } catch {
    return d
  }
}

export function ReportHistoryList({
  clientId,
  clientName,
  siteName,
  excludeReportId,
  limit = 5,
  title = 'Historique des rapports',
  emptyMessage = 'Aucun rapport antérieur sur ce client.',
  hideIfEmpty = false,
}: Props) {
  const [reports, setReports] = useState<ReportWithIntervention[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showAll, setShowAll] = useState(false)

  useEffect(() => {
    let alive = true
    setLoading(true)
    setError(null)
    listReportsForClient({
      clientId,
      clientName,
      siteName,
      excludeReportId,
      limit: limit > 0 ? Math.max(limit + 5, 20) : undefined,
    })
      .then((data) => {
        if (!alive) return
        setReports(data)
      })
      .catch((e) => {
        if (!alive) return
        setError(e instanceof Error ? e.message : 'Erreur de chargement')
      })
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId, clientName, siteName, excludeReportId])

  if (hideIfEmpty && !loading && reports.length === 0 && !error) return null

  const visible = showAll || limit === 0 ? reports : reports.slice(0, limit)
  const hiddenCount = reports.length - visible.length

  return (
    <div className="card history-card">
      <div className="card-top">
        <span className="card-title" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <ClipboardCheck size={14} strokeWidth={1.8} />
          {title}
        </span>
        {!loading && reports.length > 0 && (
          <span className="text-ink-3 text-xs font-light">
            {reports.length} rapport{reports.length > 1 ? 's' : ''}
          </span>
        )}
      </div>

      {loading && (
        <p className="text-ink-3 text-xs font-light" style={{ margin: 0 }}>
          Chargement…
        </p>
      )}

      {error && !loading && (
        <p className="text-red text-xs">Erreur : {error}</p>
      )}

      {!loading && !error && reports.length === 0 && (
        <p className="text-ink-3 text-xs font-light" style={{ margin: 0 }}>
          {emptyMessage}
        </p>
      )}

      {!loading && !error && visible.length > 0 && (
        <div className="history-list">
          {visible.map((r) => {
            const interv = r.intervention
            if (!interv) return null
            // Calcule synthèse à la volée
            const summary = computeReportSummary(
              (r.checklist ?? []) as ChecklistResponse[],
              (r.checklist ?? []).length || 1, // approximation : on n'a pas le total des items mais on a le décompte
            )
            const conform = summary.nokCount === 0
            const isFinalized = !!r.completed_at
            const equipLabel = formatEquipmentTypesShort({
              equipment_types: interv.equipment_types,
              equipment_type: interv.equipment_type,
            })
            return (
              <Link
                key={r.id}
                to={`/rapports/${interv.id}`}
                className={`history-row ${isFinalized ? (conform ? 'conform' : 'non-conform') : 'draft'}`}
              >
                <div className="history-icon">
                  {!isFinalized ? (
                    <ClipboardCheck size={14} strokeWidth={2} />
                  ) : conform ? (
                    <CheckCircle2 size={14} strokeWidth={2} />
                  ) : (
                    <AlertTriangle size={14} strokeWidth={2} />
                  )}
                </div>
                <div className="history-main">
                  <div className="history-title">
                    {interv.reference}
                    <span className="history-equip"> · {equipLabel}</span>
                  </div>
                  <div className="history-meta">
                    {formatDate(interv.scheduled_date ?? r.completed_at ?? r.created_at)}
                    {interv.site_name && <> · {interv.site_name}</>}
                    {interv.technician_name && <> · {interv.technician_name}</>}
                    {isFinalized && summary.nokCount > 0 && (
                      <span className="history-anomalies">
                        {' · '}
                        {summary.nokCount} anomalie{summary.nokCount > 1 ? 's' : ''}
                      </span>
                    )}
                    {!isFinalized && (
                      <span className="history-draft">{' · brouillon'}</span>
                    )}
                  </div>
                </div>
                {r.pdf_url && (
                  <a
                    href={r.pdf_url}
                    target="_blank"
                    rel="noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="history-pdf"
                    title="Télécharger le PDF"
                  >
                    <Download size={11} strokeWidth={2} />
                  </a>
                )}
                <ExternalLink size={11} strokeWidth={2} className="history-arrow" />
              </Link>
            )
          })}

          {hiddenCount > 0 && (
            <button
              type="button"
              className="history-show-more"
              onClick={() => setShowAll(true)}
            >
              Voir les {hiddenCount} précédents
            </button>
          )}
        </div>
      )}
    </div>
  )
}

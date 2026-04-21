import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import { AlertCircle, Calendar, CheckCircle2, Clock } from 'lucide-react'
import { useEffect, useState } from 'react'
import { classifyAlert, computeRegulatoryAlerts } from '../features/alertes/api'
import type { AlertSeverity, RegulatoryAlert } from '../features/alertes/api'
import { INSPECTION_FREQUENCIES_LABEL } from '../features/alertes/frequencies'
import { EQUIPMENT_TYPES } from '../shared/constants/interventions'
import type { EquipmentType } from '../shared/constants/interventions'

function formatDate(d: string): string {
  try {
    return format(new Date(d), 'd MMM yyyy', { locale: fr })
  } catch {
    return d
  }
}

function formatDaysLabel(days: number): string {
  if (days < 0) {
    const abs = Math.abs(days)
    return `En retard de ${abs} jour${abs > 1 ? 's' : ''}`
  }
  if (days === 0) return "Aujourd'hui"
  if (days === 1) return 'Demain'
  return `Dans ${days} jours`
}

const SEVERITY_META: Record<AlertSeverity, { label: string; cls: string; icon: typeof AlertCircle }> = {
  overdue: { label: 'En retard', cls: 'sev-overdue', icon: AlertCircle },
  urgent: { label: 'Urgent (≤ 30 jours)', cls: 'sev-urgent', icon: Clock },
  soon: { label: 'Bientôt (≤ 90 jours)', cls: 'sev-soon', icon: Calendar },
  ok: { label: 'Dans + de 90 jours', cls: 'sev-ok', icon: CheckCircle2 },
}

export function AlertesPage() {
  const [alerts, setAlerts] = useState<RegulatoryAlert[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<AlertSeverity | 'all'>('all')

  useEffect(() => {
    let alive = true
    computeRegulatoryAlerts()
      .then((data) => { if (alive) setAlerts(data) })
      .catch((e) => { if (alive) setError(e instanceof Error ? e.message : 'Erreur inconnue') })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [])

  const counts = {
    overdue: alerts.filter((a) => classifyAlert(a.daysUntilDue) === 'overdue').length,
    urgent: alerts.filter((a) => classifyAlert(a.daysUntilDue) === 'urgent').length,
    soon: alerts.filter((a) => classifyAlert(a.daysUntilDue) === 'soon').length,
    ok: alerts.filter((a) => classifyAlert(a.daysUntilDue) === 'ok').length,
  }

  const filtered = alerts.filter((a) => {
    if (filter === 'all') return true
    return classifyAlert(a.daysUntilDue) === filter
  })

  return (
    <>
      <div className="dash-top">
        <div>
          <div className="dash-title">Alertes réglementaires</div>
          <div className="dash-sub">
            Calcul automatique des prochaines échéances par client et équipement.
            Basé sur les dates des interventions terminées.
          </div>
        </div>
      </div>

      {alerts.length > 0 && (
        <div style={{ display: 'flex', gap: '.5rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
          <button
            type="button"
            className={`filter-pill${filter === 'all' ? ' on' : ''}`}
            onClick={() => setFilter('all')}
          >
            Toutes ({alerts.length})
          </button>
          <button
            type="button"
            className={`filter-pill${filter === 'overdue' ? ' on' : ''}`}
            onClick={() => setFilter('overdue')}
          >
            En retard ({counts.overdue})
          </button>
          <button
            type="button"
            className={`filter-pill${filter === 'urgent' ? ' on' : ''}`}
            onClick={() => setFilter('urgent')}
          >
            Urgent ({counts.urgent})
          </button>
          <button
            type="button"
            className={`filter-pill${filter === 'soon' ? ' on' : ''}`}
            onClick={() => setFilter('soon')}
          >
            Bientôt ({counts.soon})
          </button>
          <button
            type="button"
            className={`filter-pill${filter === 'ok' ? ' on' : ''}`}
            onClick={() => setFilter('ok')}
          >
            Ok ({counts.ok})
          </button>
        </div>
      )}

      <div className="card">
        {loading && <p className="text-ink-2 text-sm font-light">Calcul en cours…</p>}

        {error && !loading && (
          <p className="text-red text-sm">Erreur : {error}</p>
        )}

        {!loading && !error && alerts.length === 0 && (
          <div style={{ textAlign: 'center', padding: '3rem 1rem' }}>
            <p className="text-ink-2 font-light" style={{ marginBottom: '.5rem' }}>
              Aucune alerte pour le moment.
            </p>
            <p className="text-ink-3 text-xs font-light" style={{ maxWidth: 420, margin: '0 auto' }}>
              Les alertes sont calculées à partir des interventions que tu as finalisées.
              Dès que tu termines ton premier rapport, la prochaine échéance apparaîtra ici
              automatiquement.
            </p>
          </div>
        )}

        {!loading && !error && filtered.length > 0 && (
          <div className="alerts-list">
            {filtered.map((a) => {
              const sev = classifyAlert(a.daysUntilDue)
              const meta = SEVERITY_META[sev]
              const Icon = meta.icon
              const equipLabel =
                EQUIPMENT_TYPES[a.equipmentType as EquipmentType] ?? a.equipmentType
              const freqLabel =
                INSPECTION_FREQUENCIES_LABEL[a.equipmentType as EquipmentType] ?? 'Annuel'
              return (
                <div key={a.key} className={`alert-row ${meta.cls}`}>
                  <div className="alert-icon">
                    <Icon size={18} strokeWidth={2} />
                  </div>
                  <div className="alert-main">
                    <div className="alert-title">
                      {a.clientName}
                      {a.siteName && <span className="alert-site"> — {a.siteName}</span>}
                    </div>
                    <div className="alert-meta">
                      {equipLabel} · contrôle {freqLabel.toLowerCase()} · dernière interv. {formatDate(a.lastInterventionDate)} ({a.lastInterventionReference})
                    </div>
                  </div>
                  <div className="alert-due">
                    <div className="alert-due-date">{formatDate(a.nextDueDate)}</div>
                    <div className="alert-due-days">{formatDaysLabel(a.daysUntilDue)}</div>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {!loading && !error && alerts.length > 0 && filtered.length === 0 && (
          <div style={{ textAlign: 'center', padding: '2rem 1rem' }}>
            <p className="text-ink-3 text-sm font-light">
              Aucune alerte dans ce filtre.
            </p>
          </div>
        )}
      </div>
    </>
  )
}

import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import { AlertCircle, Award, Calendar, Car, CheckCircle2, Clock, HardHat, Wrench } from 'lucide-react'
import { useEffect, useState } from 'react'
import { classifyAlert, computeRegulatoryAlerts } from '../features/alertes/api'
import type { AlertSeverity, RegulatoryAlert } from '../features/alertes/api'
import { INSPECTION_FREQUENCIES_LABEL } from '../features/alertes/frequencies'
import { computeCertificationAlerts } from '../features/technicians/certificationsApi'
import type { CertificationAlert } from '../features/technicians/certificationsApi'
import { computeVehicleAlerts } from '../features/vehicles/api'
import type { VehicleAlert } from '../features/vehicles/api'
import { VEHICLE_CHECK_ICON, VEHICLE_CHECK_LABEL, formatPlate } from '../features/vehicles/constants'
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

function formatExpiryLabel(days: number): string {
  if (days < 0) {
    const abs = Math.abs(days)
    return `Expirée depuis ${abs} jour${abs > 1 ? 's' : ''}`
  }
  if (days === 0) return "Expire aujourd'hui"
  if (days === 1) return 'Expire demain'
  return `Dans ${days} jours`
}

const SEVERITY_META: Record<AlertSeverity, { label: string; cls: string; icon: typeof AlertCircle }> = {
  overdue: { label: 'En retard', cls: 'sev-overdue', icon: AlertCircle },
  urgent: { label: 'Urgent (≤ 30 jours)', cls: 'sev-urgent', icon: Clock },
  soon: { label: 'Bientôt (≤ 90 jours)', cls: 'sev-soon', icon: Calendar },
  ok: { label: 'Dans + de 90 jours', cls: 'sev-ok', icon: CheckCircle2 },
}

type Category = 'equipment' | 'certifications' | 'vehicles'

export function AlertesPage() {
  const [regAlerts, setRegAlerts] = useState<RegulatoryAlert[]>([])
  const [certAlerts, setCertAlerts] = useState<CertificationAlert[]>([])
  const [vehAlerts, setVehAlerts] = useState<VehicleAlert[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [category, setCategory] = useState<Category>('equipment')
  const [filter, setFilter] = useState<AlertSeverity | 'all'>('all')

  useEffect(() => {
    let alive = true
    Promise.all([computeRegulatoryAlerts(), computeCertificationAlerts(), computeVehicleAlerts()])
      .then(([reg, certs, veh]) => {
        if (!alive) return
        setRegAlerts(reg)
        setCertAlerts(certs)
        setVehAlerts(veh)
      })
      .catch((e: unknown) => {
        console.error('Erreur chargement alertes', e)
        if (!alive) return
        if (e && typeof e === 'object') {
          const err = e as { message?: string; details?: string; hint?: string; code?: string }
          setError(err.message ?? err.details ?? err.hint ?? err.code ?? JSON.stringify(e))
        } else {
          setError(String(e))
        }
      })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [])

  const regCounts = {
    overdue: regAlerts.filter((a) => classifyAlert(a.daysUntilDue) === 'overdue').length,
    urgent: regAlerts.filter((a) => classifyAlert(a.daysUntilDue) === 'urgent').length,
    soon: regAlerts.filter((a) => classifyAlert(a.daysUntilDue) === 'soon').length,
    ok: regAlerts.filter((a) => classifyAlert(a.daysUntilDue) === 'ok').length,
  }
  const certCounts = {
    overdue: certAlerts.filter((a) => classifyAlert(a.daysUntilExpiry) === 'overdue').length,
    urgent: certAlerts.filter((a) => classifyAlert(a.daysUntilExpiry) === 'urgent').length,
    soon: certAlerts.filter((a) => classifyAlert(a.daysUntilExpiry) === 'soon').length,
    ok: certAlerts.filter((a) => classifyAlert(a.daysUntilExpiry) === 'ok').length,
  }
  const vehCounts = {
    overdue: vehAlerts.filter((a) => classifyAlert(a.daysUntilDue) === 'overdue').length,
    urgent: vehAlerts.filter((a) => classifyAlert(a.daysUntilDue) === 'urgent').length,
    soon: vehAlerts.filter((a) => classifyAlert(a.daysUntilDue) === 'soon').length,
    ok: vehAlerts.filter((a) => classifyAlert(a.daysUntilDue) === 'ok').length,
  }

  const activeList =
    category === 'equipment' ? regAlerts : category === 'certifications' ? certAlerts : vehAlerts
  const activeCounts =
    category === 'equipment' ? regCounts : category === 'certifications' ? certCounts : vehCounts

  const filteredReg =
    category === 'equipment'
      ? regAlerts.filter((a) => filter === 'all' || classifyAlert(a.daysUntilDue) === filter)
      : []
  const filteredCert =
    category === 'certifications'
      ? certAlerts.filter((a) => filter === 'all' || classifyAlert(a.daysUntilExpiry) === filter)
      : []
  const filteredVeh =
    category === 'vehicles'
      ? vehAlerts.filter((a) => filter === 'all' || classifyAlert(a.daysUntilDue) === filter)
      : []

  return (
    <>
      <div className="dash-top">
        <div>
          <div className="dash-title">Alertes</div>
          <div className="dash-sub">
            Échéances réglementaires sur les équipements de tes clients + expirations des
            habilitations de tes techniciens.
          </div>
        </div>
      </div>

      {/* Toggle catégorie */}
      <div style={{ display: 'flex', gap: '.5rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
        <button
          type="button"
          className={`filter-pill${category === 'equipment' ? ' on' : ''}`}
          onClick={() => { setCategory('equipment'); setFilter('all') }}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
        >
          <Wrench size={13} strokeWidth={2} />
          Équipements ({regAlerts.length})
        </button>
        <button
          type="button"
          className={`filter-pill${category === 'certifications' ? ' on' : ''}`}
          onClick={() => { setCategory('certifications'); setFilter('all') }}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
        >
          <HardHat size={13} strokeWidth={2} />
          Habilitations ({certAlerts.length})
        </button>
        <button
          type="button"
          className={`filter-pill${category === 'vehicles' ? ' on' : ''}`}
          onClick={() => { setCategory('vehicles'); setFilter('all') }}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
        >
          <Car size={13} strokeWidth={2} />
          Véhicules ({vehAlerts.length})
        </button>
      </div>

      {/* Filtres par gravité */}
      {activeList.length > 0 && (
        <div style={{ display: 'flex', gap: '.5rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
          <button
            type="button"
            className={`filter-pill${filter === 'all' ? ' on' : ''}`}
            onClick={() => setFilter('all')}
          >
            Toutes ({activeList.length})
          </button>
          <button
            type="button"
            className={`filter-pill${filter === 'overdue' ? ' on' : ''}`}
            onClick={() => setFilter('overdue')}
          >
            {category === 'equipment' ? 'En retard' : category === 'certifications' ? 'Expirées' : 'Dépassées'} ({activeCounts.overdue})
          </button>
          <button
            type="button"
            className={`filter-pill${filter === 'urgent' ? ' on' : ''}`}
            onClick={() => setFilter('urgent')}
          >
            Urgent ({activeCounts.urgent})
          </button>
          <button
            type="button"
            className={`filter-pill${filter === 'soon' ? ' on' : ''}`}
            onClick={() => setFilter('soon')}
          >
            Bientôt ({activeCounts.soon})
          </button>
          <button
            type="button"
            className={`filter-pill${filter === 'ok' ? ' on' : ''}`}
            onClick={() => setFilter('ok')}
          >
            Ok ({activeCounts.ok})
          </button>
        </div>
      )}

      <div className="card">
        {loading && <p className="text-ink-2 text-sm font-light">Calcul en cours…</p>}

        {error && !loading && (
          <p className="text-red text-sm">Erreur : {error}</p>
        )}

        {/* Mode Équipements */}
        {!loading && !error && category === 'equipment' && regAlerts.length === 0 && (
          <div style={{ textAlign: 'center', padding: '3rem 1rem' }}>
            <p className="text-ink-2 font-light" style={{ marginBottom: '.5rem' }}>
              Aucune alerte équipement pour le moment.
            </p>
            <p className="text-ink-3 text-xs font-light" style={{ maxWidth: 420, margin: '0 auto' }}>
              Les alertes sont calculées à partir des interventions terminées. Dès que tu termines
              ton premier rapport, la prochaine échéance apparaîtra ici automatiquement.
            </p>
          </div>
        )}

        {!loading && !error && category === 'equipment' && filteredReg.length > 0 && (
          <div className="alerts-list">
            {filteredReg.map((a) => {
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

        {/* Mode Habilitations */}
        {!loading && !error && category === 'certifications' && certAlerts.length === 0 && (
          <div style={{ textAlign: 'center', padding: '3rem 1rem' }}>
            <p className="text-ink-2 font-light" style={{ marginBottom: '.5rem' }}>
              Aucune habilitation enregistrée.
            </p>
            <p className="text-ink-3 text-xs font-light" style={{ maxWidth: 420, margin: '0 auto' }}>
              Va dans la fiche d'un technicien et clique sur "Ajouter" dans la section Habilitations.
              Les certifs qui approchent de leur expiration apparaîtront ici.
            </p>
          </div>
        )}

        {!loading && !error && category === 'certifications' && filteredCert.length > 0 && (
          <div className="alerts-list">
            {filteredCert.map((a) => {
              const sev = classifyAlert(a.daysUntilExpiry)
              const meta = SEVERITY_META[sev]
              const Icon = meta.icon
              return (
                <div key={a.key} className={`alert-row ${meta.cls}`}>
                  <div className="alert-icon">
                    <Icon size={18} strokeWidth={2} />
                  </div>
                  <div className="alert-main">
                    <div className="alert-title">
                      {a.technicianName}
                      <span className="alert-site"> — {a.certificationName}</span>
                    </div>
                    <div className="alert-meta">
                      <Award size={11} strokeWidth={2} style={{ display: 'inline-block', verticalAlign: '-2px', marginRight: 4 }} />
                      {a.issuingBody ?? 'Habilitation / formation'} · expire le {formatDate(a.expiresAt)}
                    </div>
                  </div>
                  <div className="alert-due">
                    <div className="alert-due-date">{formatDate(a.expiresAt)}</div>
                    <div className="alert-due-days">{formatExpiryLabel(a.daysUntilExpiry)}</div>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Mode Véhicules */}
        {!loading && !error && category === 'vehicles' && vehAlerts.length === 0 && (
          <div style={{ textAlign: 'center', padding: '3rem 1rem' }}>
            <p className="text-ink-2 font-light" style={{ marginBottom: '.5rem' }}>
              Aucune alerte véhicule pour le moment.
            </p>
            <p className="text-ink-3 text-xs font-light" style={{ maxWidth: 420, margin: '0 auto' }}>
              Va dans RH → Véhicules et enregistre tes véhicules avec leurs dates clés
              (contrôle technique, assurance, vidange). Les alertes apparaîtront ici automatiquement.
            </p>
          </div>
        )}

        {!loading && !error && category === 'vehicles' && filteredVeh.length > 0 && (
          <div className="alerts-list">
            {filteredVeh.map((a) => {
              const sev = classifyAlert(a.daysUntilDue)
              const meta = SEVERITY_META[sev]
              const Icon = meta.icon
              const CheckIcon = VEHICLE_CHECK_ICON[a.type]
              const vehicleLabel = a.brand || a.model
                ? `${a.brand ?? ''} ${a.model ?? ''}`.trim()
                : null
              return (
                <div key={a.key} className={`alert-row ${meta.cls}`}>
                  <div className="alert-icon">
                    <Icon size={18} strokeWidth={2} />
                  </div>
                  <div className="alert-main">
                    <div className="alert-title">
                      {formatPlate(a.licensePlate)}
                      {vehicleLabel && <span className="alert-site"> — {vehicleLabel}</span>}
                    </div>
                    <div className="alert-meta">
                      <CheckIcon size={11} strokeWidth={2} style={{ display: 'inline-block', verticalAlign: '-2px', marginRight: 4 }} />
                      {VEHICLE_CHECK_LABEL[a.type]}
                      {a.technicianName ? ` · ${a.technicianName}` : ' · Pool commun'}
                      {' · '}échéance {formatDate(a.dueDate)}
                    </div>
                  </div>
                  <div className="alert-due">
                    <div className="alert-due-date">{formatDate(a.dueDate)}</div>
                    <div className="alert-due-days">{formatExpiryLabel(a.daysUntilDue)}</div>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {!loading && !error && activeList.length > 0 && (() => {
          const visible =
            category === 'equipment'
              ? filteredReg.length
              : category === 'certifications'
                ? filteredCert.length
                : filteredVeh.length
          return visible === 0 ? (
            <div style={{ textAlign: 'center', padding: '2rem 1rem' }}>
              <p className="text-ink-3 text-sm font-light">Aucune alerte dans ce filtre.</p>
            </div>
          ) : null
        })()}
      </div>
    </>
  )
}

import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import { Car, Plus, Upload } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { classifyAlert } from '../features/alertes/api'
import { RhTabs } from '../features/dashboard/components/RhTabs'
import { listTechnicians } from '../features/technicians/api'
import { technicianFullName } from '../features/technicians/schemas'
import type { Technician } from '../features/technicians/schemas'
import { listVehicles } from '../features/vehicles/api'
import { VehicleModal } from '../features/vehicles/components/VehicleModal'
import {
  VEHICLE_CHECK_ICON,
  VEHICLE_CHECK_SHORT,
  formatPlate,
} from '../features/vehicles/constants'
import type { VehicleCheckType } from '../features/vehicles/constants'
import type { Vehicle } from '../features/vehicles/schemas'

function formatDate(d: string | null): string {
  if (!d) return '—'
  try {
    return format(new Date(d), 'd MMM yyyy', { locale: fr })
  } catch {
    return d
  }
}

function daysUntil(date: string | null): number | null {
  if (!date) return null
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const target = new Date(date)
  target.setHours(0, 0, 0, 0)
  return Math.floor((target.getTime() - today.getTime()) / (24 * 60 * 60 * 1000))
}

function severityClass(days: number | null): string {
  if (days === null) return 'chk-none'
  const sev = classifyAlert(days)
  return `chk-${sev}`
}

function daysLabel(days: number | null): string {
  if (days === null) return 'Non renseigné'
  if (days < 0) return `Dépassé de ${Math.abs(days)} j`
  if (days === 0) return "Aujourd'hui"
  if (days === 1) return 'Demain'
  if (days < 31) return `Dans ${days} j`
  if (days < 365) return `Dans ${Math.round(days / 30)} mois`
  return `Dans ${Math.round(days / 365)} an${Math.round(days / 365) > 1 ? 's' : ''}`
}

export function VehiculesPage() {
  const [vehicles, setVehicles] = useState<Vehicle[]>([])
  const [technicians, setTechnicians] = useState<Technician[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Vehicle | null>(null)

  async function reload() {
    setLoading(true)
    try {
      const [vs, ts] = await Promise.all([listVehicles(), listTechnicians()])
      setVehicles(vs)
      setTechnicians(ts)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur de chargement')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void reload()
  }, [])

  function openCreate() {
    setEditing(null)
    setModalOpen(true)
  }

  function openEdit(v: Vehicle) {
    setEditing(v)
    setModalOpen(true)
  }

  function techNameOf(v: Vehicle): string {
    if (!v.technician_id) return 'Pool commun'
    const t = technicians.find((x) => x.id === v.technician_id)
    return t ? technicianFullName(t) : 'Technicien supprimé'
  }

  return (
    <>
      <RhTabs />
      <div className="dash-top">
        <div>
          <div className="dash-title">Véhicules</div>
          <div className="dash-sub">
            {vehicles.length === 0 && 'Aucun véhicule enregistré'}
            {vehicles.length === 1 && '1 véhicule'}
            {vehicles.length > 1 && `${vehicles.length} véhicules dans le parc`}
          </div>
        </div>
        <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap' }}>
          <Link
            to="/vehicules/import"
            className="mf out"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            <Upload size={13} strokeWidth={2} />
            Importer
          </Link>
          <button
            type="button"
            className="mf prim"
            onClick={openCreate}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            <Plus size={14} strokeWidth={2} />
            Nouveau véhicule
          </button>
        </div>
      </div>

      <div className="card">
        {loading && <p className="text-ink-2 text-sm font-light">Chargement…</p>}

        {error && !loading && (
          <p className="text-red text-sm">Erreur : {error}</p>
        )}

        {!loading && !error && vehicles.length === 0 && (
          <div style={{ textAlign: 'center', padding: '3rem 1rem' }}>
            <Car size={32} strokeWidth={1.5} className="text-ink-3" style={{ margin: '0 auto .5rem' }} />
            <p className="text-ink-2 font-light" style={{ marginBottom: '.5rem' }}>
              Aucun véhicule enregistré.
            </p>
            <p className="text-ink-3 text-xs font-light" style={{ maxWidth: 460, margin: '0 auto' }}>
              Clique sur "Nouveau véhicule" pour enregistrer plaque, modèle, technicien assigné
              et surtout les 3 dates clés : contrôle technique, assurance, vidange. Tu verras
              automatiquement les alertes dans la page Alertes dès que ça approche.
            </p>
          </div>
        )}

        {!loading && !error && vehicles.length > 0 && (
          <div className="vehicles-grid">
            {vehicles.map((v) => {
              const motDays = daysUntil(v.next_mot_date)
              const insDays = daysUntil(v.next_insurance_date)
              const svcDays = daysUntil(v.next_service_date)
              const checks: Array<{ type: VehicleCheckType; days: number | null; date: string | null }> = [
                { type: 'mot', days: motDays, date: v.next_mot_date },
                { type: 'insurance', days: insDays, date: v.next_insurance_date },
                { type: 'service', days: svcDays, date: v.next_service_date },
              ]
              return (
                <button
                  key={v.id}
                  type="button"
                  className="vehicle-card"
                  onClick={() => openEdit(v)}
                >
                  <div className="vehicle-card-head">
                    <div className="vehicle-plate">{formatPlate(v.license_plate)}</div>
                    <div className="vehicle-tech">{techNameOf(v)}</div>
                  </div>
                  <div className="vehicle-model">
                    {v.brand || v.model
                      ? `${v.brand ?? ''} ${v.model ?? ''}`.trim()
                      : 'Modèle non renseigné'}
                    {v.year && <span className="vehicle-year"> · {v.year}</span>}
                    {v.mileage != null && (
                      <span className="vehicle-year"> · {v.mileage.toLocaleString('fr-FR')} km</span>
                    )}
                  </div>
                  <div className="vehicle-checks">
                    {checks.map(({ type, days, date }) => {
                      const Icon = VEHICLE_CHECK_ICON[type]
                      const cls = severityClass(days)
                      return (
                        <div key={type} className={`vehicle-chk ${cls}`}>
                          <div className="vehicle-chk-icon">
                            <Icon size={14} strokeWidth={2} />
                          </div>
                          <div className="vehicle-chk-main">
                            <div className="vehicle-chk-label">{VEHICLE_CHECK_SHORT[type]}</div>
                            <div className="vehicle-chk-date">{formatDate(date)}</div>
                            <div className="vehicle-chk-days">{daysLabel(days)}</div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                  {v.notes && <div className="vehicle-notes">{v.notes}</div>}
                </button>
              )
            })}
          </div>
        )}
      </div>

      <VehicleModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onChanged={() => void reload()}
        vehicle={editing}
      />
    </>
  )
}

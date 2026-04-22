import { Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { MouseEvent } from 'react'
import { useAuthStore } from '../../auth/store'
import { listTechnicians } from '../../technicians/api'
import { technicianFullName } from '../../technicians/schemas'
import type { Technician } from '../../technicians/schemas'
import { createVehicle, deleteVehicle, updateVehicle } from '../api'
import type { Vehicle } from '../schemas'

type Props = {
  open: boolean
  onClose: () => void
  onChanged?: () => void
  vehicle?: Vehicle | null
}

function toForm(v: Vehicle | null | undefined) {
  return {
    license_plate: v?.license_plate ?? '',
    brand: v?.brand ?? '',
    model: v?.model ?? '',
    year: v?.year != null ? String(v.year) : '',
    mileage: v?.mileage != null ? String(v.mileage) : '',
    technician_id: v?.technician_id ?? '',
    next_mot_date: v?.next_mot_date ?? '',
    next_insurance_date: v?.next_insurance_date ?? '',
    next_service_date: v?.next_service_date ?? '',
    notes: v?.notes ?? '',
  }
}

export function VehicleModal({ open, onClose, onChanged, vehicle }: Props) {
  const profile = useAuthStore((s) => s.profile)
  const isEdit = !!vehicle
  const [technicians, setTechnicians] = useState<Technician[]>([])
  const [form, setForm] = useState(toForm(vehicle))
  const [submitting, setSubmitting] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setForm(toForm(vehicle))
    setError(null)
    let alive = true
    void listTechnicians().then((list) => {
      if (alive) setTechnicians(list.filter((t) => t.active))
    })
    return () => { alive = false }
  }, [open, vehicle])

  function setField<K extends keyof ReturnType<typeof toForm>>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!profile?.organization_id) {
      setError('Profil non chargé.')
      return
    }
    if (!form.license_plate.trim()) {
      setError('La plaque d\'immatriculation est requise.')
      return
    }

    const yearNum = form.year ? parseInt(form.year, 10) : undefined
    if (form.year && (!Number.isFinite(yearNum) || yearNum! < 1950 || yearNum! > 2100)) {
      setError('Année invalide.')
      return
    }
    const mileageNum = form.mileage ? parseInt(form.mileage, 10) : undefined
    if (form.mileage && (!Number.isFinite(mileageNum) || mileageNum! < 0)) {
      setError('Kilométrage invalide.')
      return
    }

    const input = {
      license_plate: form.license_plate,
      brand: form.brand || undefined,
      model: form.model || undefined,
      year: yearNum,
      mileage: mileageNum,
      technician_id: form.technician_id || undefined,
      next_mot_date: form.next_mot_date || undefined,
      next_insurance_date: form.next_insurance_date || undefined,
      next_service_date: form.next_service_date || undefined,
      notes: form.notes || undefined,
    }

    setSubmitting(true)
    setError(null)
    try {
      if (isEdit && vehicle) {
        await updateVehicle(vehicle.id, input)
      } else {
        await createVehicle(input, profile.organization_id)
      }
      onChanged?.()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleDelete() {
    if (!vehicle) return
    if (!window.confirm(`Supprimer le véhicule ${vehicle.license_plate} ?`)) return
    setDeleting(true)
    try {
      await deleteVehicle(vehicle.id)
      onChanged?.()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur')
    } finally {
      setDeleting(false)
    }
  }

  function handleBackdrop(e: MouseEvent<HTMLDivElement>) {
    if (e.target === e.currentTarget && !submitting && !deleting) onClose()
  }

  if (!open) return null

  const anyLoading = submitting || deleting

  return (
    <div className="overlay open" onClick={handleBackdrop}>
      <div className="modal">
        <div className="modal-head">
          <span className="modal-title">
            {isEdit ? `Véhicule : ${vehicle?.license_plate}` : 'Nouveau véhicule'}
          </span>
          <button type="button" className="modal-x" onClick={onClose} aria-label="Fermer">×</button>
        </div>

        <form onSubmit={(e) => void handleSubmit(e)} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div className="mrow">
            <div className="fg">
              <label>Plaque d'immatriculation</label>
              <input
                type="text"
                placeholder="Ex: AB-123-CD"
                value={form.license_plate}
                onChange={(e) => setField('license_plate', e.target.value.toUpperCase())}
                maxLength={20}
              />
            </div>
            <div className="fg">
              <label>Technicien assigné <span className="text-ink-3 text-xs font-light">(optionnel)</span></label>
              <select
                value={form.technician_id}
                onChange={(e) => setField('technician_id', e.target.value)}
              >
                <option value="">— Pool commun / non assigné —</option>
                {technicians.map((t) => (
                  <option key={t.id} value={t.id}>{technicianFullName(t)}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="mrow">
            <div className="fg">
              <label>Marque</label>
              <input
                type="text"
                placeholder="Ex: Renault"
                value={form.brand}
                onChange={(e) => setField('brand', e.target.value)}
                maxLength={40}
              />
            </div>
            <div className="fg">
              <label>Modèle</label>
              <input
                type="text"
                placeholder="Ex: Kangoo"
                value={form.model}
                onChange={(e) => setField('model', e.target.value)}
                maxLength={40}
              />
            </div>
          </div>

          <div className="mrow">
            <div className="fg">
              <label>Année</label>
              <input
                type="number"
                placeholder="Ex: 2021"
                value={form.year}
                onChange={(e) => setField('year', e.target.value)}
                min={1950}
                max={2100}
              />
            </div>
            <div className="fg">
              <label>Kilométrage actuel (km)</label>
              <input
                type="number"
                placeholder="Ex: 85000"
                value={form.mileage}
                onChange={(e) => setField('mileage', e.target.value)}
                min={0}
              />
            </div>
          </div>

          <div className="vehicle-dates">
            <div className="text-ink-3 text-xs font-light" style={{ marginBottom: '.5rem' }}>
              Dates clés à surveiller — une alerte sera remontée dans la page Alertes à partir de 90 jours avant l'échéance.
            </div>
            <div className="mrow">
              <div className="fg">
                <label>Prochain contrôle technique</label>
                <input
                  type="date"
                  value={form.next_mot_date}
                  onChange={(e) => setField('next_mot_date', e.target.value)}
                />
              </div>
              <div className="fg">
                <label>Échéance assurance</label>
                <input
                  type="date"
                  value={form.next_insurance_date}
                  onChange={(e) => setField('next_insurance_date', e.target.value)}
                />
              </div>
            </div>
            <div className="fg">
              <label>Prochaine vidange / entretien</label>
              <input
                type="date"
                value={form.next_service_date}
                onChange={(e) => setField('next_service_date', e.target.value)}
              />
            </div>
          </div>

          <div className="fg">
            <label>Notes internes <span className="text-ink-3 text-xs font-light">(optionnel)</span></label>
            <input
              type="text"
              placeholder="Ex: clé chez Thomas, carte grise dans la BAL…"
              value={form.notes}
              onChange={(e) => setField('notes', e.target.value)}
              maxLength={200}
            />
          </div>

          {error && <span className="ferr on">{error}</span>}

          <div className="modal-foot">
            {isEdit && (
              <button
                type="button"
                className="mf del"
                onClick={() => void handleDelete()}
                disabled={anyLoading}
                style={{ marginRight: 'auto', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
              >
                <Trash2 size={14} strokeWidth={1.8} />
                {deleting ? 'Suppression…' : 'Supprimer'}
              </button>
            )}
            <button type="button" className="mf out" onClick={onClose} disabled={anyLoading}>
              Annuler
            </button>
            <button type="submit" className="mf prim" disabled={anyLoading}>
              {submitting
                ? (isEdit ? 'Enregistrement…' : 'Création…')
                : (isEdit ? 'Enregistrer' : 'Créer le véhicule')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

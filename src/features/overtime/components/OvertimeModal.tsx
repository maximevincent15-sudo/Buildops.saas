import { useEffect, useState } from 'react'
import type { MouseEvent } from 'react'
import { useAuthStore } from '../../auth/store'
import { listTechnicians } from '../../technicians/api'
import { technicianFullName } from '../../technicians/schemas'
import type { Technician } from '../../technicians/schemas'
import { createOvertime } from '../api'
import {
  OVERTIME_TYPES,
  OVERTIME_TYPE_HINT,
  OVERTIME_TYPE_ICON,
  OVERTIME_TYPE_LABEL,
} from '../constants'
import type { OvertimeType } from '../constants'

type Props = {
  open: boolean
  onClose: () => void
  onCreated?: () => void
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

export function OvertimeModal({ open, onClose, onCreated }: Props) {
  const profile = useAuthStore((s) => s.profile)
  const [technicians, setTechnicians] = useState<Technician[]>([])
  const [techId, setTechId] = useState('')
  const [workedOn, setWorkedOn] = useState(todayIso())
  const [type, setType] = useState<OvertimeType>('standard')
  const [hoursStr, setHoursStr] = useState('')
  const [description, setDescription] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    let alive = true
    void listTechnicians().then((list) => {
      if (!alive) return
      const active = list.filter((t) => t.active)
      setTechnicians(active)
      if (active.length > 0 && !techId) setTechId(active[0]!.id)
    })
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  useEffect(() => {
    if (!open) {
      setWorkedOn(todayIso())
      setType('standard')
      setHoursStr('')
      setDescription('')
      setError(null)
      setTechId('')
    }
  }, [open])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!profile?.organization_id) {
      setError('Profil non chargé.')
      return
    }
    const tech = technicians.find((t) => t.id === techId)
    if (!tech) {
      setError('Choisis un technicien.')
      return
    }
    const hours = parseFloat(hoursStr.replace(',', '.'))
    if (!Number.isFinite(hours) || hours <= 0 || hours > 24) {
      setError('Saisis un nombre d\'heures valide (entre 0 et 24).')
      return
    }

    setSubmitting(true)
    setError(null)
    try {
      await createOvertime(
        {
          technician_id: tech.id,
          worked_on: workedOn,
          hours,
          type,
          description: description.trim() || undefined,
        },
        profile.organization_id,
        technicianFullName(tech),
      )
      onCreated?.()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue')
    } finally {
      setSubmitting(false)
    }
  }

  function handleBackdrop(e: MouseEvent<HTMLDivElement>) {
    if (e.target === e.currentTarget && !submitting) onClose()
  }

  if (!open) return null

  return (
    <div className="overlay open" onClick={handleBackdrop}>
      <div className="modal">
        <div className="modal-head">
          <span className="modal-title">Nouvelle saisie d'heures sup</span>
          <button type="button" className="modal-x" onClick={onClose} aria-label="Fermer">×</button>
        </div>

        <form onSubmit={(e) => void handleSubmit(e)} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div className="mrow">
            <div className="fg">
              <label>Technicien</label>
              <select value={techId} onChange={(e) => setTechId(e.target.value)}>
                <option value="">— Choisir —</option>
                {technicians.map((t) => (
                  <option key={t.id} value={t.id}>{technicianFullName(t)}</option>
                ))}
              </select>
              {technicians.length === 0 && (
                <span className="text-ink-3 text-xs font-light">
                  Aucun technicien actif. Crée-en un d'abord.
                </span>
              )}
            </div>
            <div className="fg">
              <label>Date</label>
              <input
                type="date"
                value={workedOn}
                onChange={(e) => setWorkedOn(e.target.value)}
                max={todayIso()}
              />
            </div>
          </div>

          <div className="fg">
            <label>Type</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.4rem' }}>
              {OVERTIME_TYPES.map((t) => {
                const Icon = OVERTIME_TYPE_ICON[t]
                return (
                  <button
                    type="button"
                    key={t}
                    className={`filter-pill${type === t ? ' on' : ''}`}
                    onClick={() => setType(t)}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                  >
                    <Icon size={13} strokeWidth={2} />
                    {OVERTIME_TYPE_LABEL[t]}
                  </button>
                )
              })}
            </div>
            <span className="text-ink-3 text-xs font-light" style={{ marginTop: 4 }}>
              {OVERTIME_TYPE_HINT[type]}
            </span>
          </div>

          <div className="fg">
            <label>Nombre d'heures</label>
            <input
              type="text"
              inputMode="decimal"
              placeholder="Ex: 2 ou 2.5"
              value={hoursStr}
              onChange={(e) => setHoursStr(e.target.value)}
            />
            <span className="text-ink-3 text-xs font-light" style={{ marginTop: 4 }}>
              La majoration (+25%, +50%, etc.) sera appliquée par l'expert-comptable au moment de la paie.
            </span>
          </div>

          <div className="fg">
            <label>Description / motif <span className="text-ink-3 text-xs font-light">(optionnel)</span></label>
            <input
              type="text"
              placeholder="Ex: Dépannage urgent client Valoris"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={120}
            />
          </div>

          {error && <span className="ferr on">{error}</span>}

          <div className="modal-foot">
            <button type="button" className="mf out" onClick={onClose} disabled={submitting}>
              Annuler
            </button>
            <button type="submit" className="mf prim" disabled={submitting || technicians.length === 0}>
              {submitting ? 'Envoi…' : 'Enregistrer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

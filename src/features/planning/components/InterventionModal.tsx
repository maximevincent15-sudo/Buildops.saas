import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import type { MouseEvent } from 'react'
import { useForm } from 'react-hook-form'
import { useAuthStore } from '../../auth/store'
import {
  EQUIPMENT_TYPES,
  INTERVENTION_PRIORITIES,
} from '../../../shared/constants/interventions'
import { createIntervention } from '../api'
import { createInterventionSchema } from '../schemas'
import type { CreateInterventionInput } from '../schemas'

type Props = {
  open: boolean
  onClose: () => void
  onCreated?: () => void
}

export function InterventionModal({ open, onClose, onCreated }: Props) {
  const [submitError, setSubmitError] = useState<string | null>(null)
  const profile = useAuthStore((s) => s.profile)
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CreateInterventionInput>({
    resolver: zodResolver(createInterventionSchema),
    defaultValues: {
      equipment_type: 'extincteurs',
      priority: 'normale',
    },
  })

  async function onSubmit(data: CreateInterventionInput) {
    if (!profile?.organization_id) {
      setSubmitError('Profil non chargé. Reconnecte-toi.')
      return
    }
    setSubmitError(null)
    try {
      await createIntervention(data, profile.organization_id)
      reset()
      onClose()
      onCreated?.()
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : 'Erreur inconnue')
    }
  }

  function handleBackdropClick(e: MouseEvent<HTMLDivElement>) {
    if (e.target === e.currentTarget) onClose()
  }

  if (!open) return null

  return (
    <div className="overlay open" onClick={handleBackdropClick}>
      <div className="modal">
        <div className="modal-head">
          <span className="modal-title">Nouvelle intervention</span>
          <button type="button" className="modal-x" onClick={onClose} aria-label="Fermer">×</button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div className="mrow">
            <div className="fg">
              <label>Client</label>
              <input type="text" placeholder="Ex: Mairie de Creil" {...register('client_name')} />
              {errors.client_name && <span className="ferr on">{errors.client_name.message}</span>}
            </div>
            <div className="fg">
              <label>Site (optionnel)</label>
              <input type="text" placeholder="Ex: Hôtel de ville" {...register('site_name')} />
            </div>
          </div>

          <div className="mrow">
            <div className="fg">
              <label>Type d'équipement</label>
              <select {...register('equipment_type')}>
                {Object.entries(EQUIPMENT_TYPES).map(([val, label]) => (
                  <option key={val} value={val}>{label}</option>
                ))}
              </select>
            </div>
            <div className="fg">
              <label>Date prévue</label>
              <input type="date" {...register('scheduled_date')} />
            </div>
          </div>

          <div className="mrow">
            <div className="fg">
              <label>Technicien assigné</label>
              <input type="text" placeholder="Ex: T. Moreau" {...register('technician_name')} />
            </div>
            <div className="fg">
              <label>Priorité</label>
              <select {...register('priority')}>
                {Object.entries(INTERVENTION_PRIORITIES).map(([val, label]) => (
                  <option key={val} value={val}>{label}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="fg">
            <label>Notes pour le technicien</label>
            <input type="text" placeholder="Ex: Accès parking sous-sol, demander M. Dupont" {...register('notes')} />
          </div>

          {submitError && <span className="ferr on">{submitError}</span>}

          <div className="modal-foot">
            <button type="button" className="mf out" onClick={onClose}>
              Annuler
            </button>
            <button type="submit" className="mf prim" disabled={isSubmitting}>
              {isSubmitting ? 'Création…' : "Créer l'intervention"}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

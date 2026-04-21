import { zodResolver } from '@hookform/resolvers/zod'
import { Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { MouseEvent } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { useAuthStore } from '../../auth/store'
import {
  EQUIPMENT_TYPES,
  INTERVENTION_PRIORITIES,
} from '../../../shared/constants/interventions'
import { AddressAutocomplete } from '../../../shared/ui/AddressAutocomplete'
import { createIntervention, deleteIntervention, updateIntervention } from '../api'
import { createInterventionSchema } from '../schemas'
import type { CreateInterventionInput, Intervention } from '../schemas'
import { ClientAutocomplete } from './ClientAutocomplete'
import { TechnicianAutocomplete } from './TechnicianAutocomplete'

type Props = {
  open: boolean
  onClose: () => void
  onChanged?: () => void
  intervention?: Intervention | null
}

function toFormValues(i: Intervention | null | undefined): Partial<CreateInterventionInput> {
  if (!i) {
    return {
      equipment_type: 'extincteurs',
      priority: 'normale',
      client_id: '',
      technician_id: '',
    }
  }
  return {
    client_name: i.client_name,
    client_id: i.client_id ?? '',
    site_name: i.site_name ?? '',
    address: i.address ?? '',
    equipment_type: i.equipment_type as CreateInterventionInput['equipment_type'],
    scheduled_date: i.scheduled_date ?? '',
    technician_name: i.technician_name ?? '',
    technician_id: i.technician_id ?? '',
    priority: i.priority as CreateInterventionInput['priority'],
    notes: i.notes ?? '',
  }
}

export function InterventionModal({ open, onClose, onChanged, intervention }: Props) {
  const isEdit = !!intervention
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const profile = useAuthStore((s) => s.profile)
  const {
    register,
    handleSubmit,
    reset,
    control,
    setValue,
    getValues,
    formState: { errors, isSubmitting },
  } = useForm<CreateInterventionInput>({
    resolver: zodResolver(createInterventionSchema),
    defaultValues: toFormValues(intervention),
  })

  // Quand on change d'intervention (ou passage create → edit), réinjecte les valeurs
  useEffect(() => {
    if (open) {
      reset(toFormValues(intervention))
      setSubmitError(null)
    }
  }, [open, intervention, reset])

  async function onSubmit(data: CreateInterventionInput) {
    if (!profile?.organization_id) {
      setSubmitError('Profil non chargé. Reconnecte-toi.')
      return
    }
    setSubmitError(null)
    try {
      if (isEdit && intervention) {
        await updateIntervention(intervention.id, data)
      } else {
        await createIntervention(data, profile.organization_id)
      }
      reset()
      onClose()
      onChanged?.()
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : 'Erreur inconnue')
    }
  }

  async function handleDelete() {
    if (!intervention) return
    const ok = window.confirm(
      `Supprimer l'intervention ${intervention.reference} ?\n\nCette action est irréversible.`,
    )
    if (!ok) return
    setIsDeleting(true)
    setSubmitError(null)
    try {
      await deleteIntervention(intervention.id)
      onClose()
      onChanged?.()
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : 'Erreur inconnue')
    } finally {
      setIsDeleting(false)
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
          <span className="modal-title">
            {isEdit ? `Intervention ${intervention?.reference}` : 'Nouvelle intervention'}
          </span>
          <button type="button" className="modal-x" onClick={onClose} aria-label="Fermer">×</button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <input type="hidden" {...register('client_id')} />
          <div className="mrow">
            <div className="fg">
              <label>Client</label>
              <Controller
                name="client_name"
                control={control}
                render={({ field }) => (
                  <ClientAutocomplete
                    value={field.value ?? ''}
                    onChange={(name, client) => {
                      field.onChange(name)
                      setValue('client_id', client?.id ?? '')
                      // Auto-remplit l'adresse depuis la fiche client si le champ est vide
                      if (client?.address && !getValues('address')) {
                        setValue('address', client.address)
                      }
                    }}
                    placeholder="Tape le nom ou choisis dans tes fiches"
                  />
                )}
              />
              {errors.client_name && <span className="ferr on">{errors.client_name.message}</span>}
            </div>
            <div className="fg">
              <label>Site (optionnel)</label>
              <input type="text" placeholder="Ex: Hôtel de ville" {...register('site_name')} />
            </div>
          </div>

          <div className="fg">
            <label>Adresse (optionnelle)</label>
            <Controller
              name="address"
              control={control}
              render={({ field }) => (
                <AddressAutocomplete
                  value={field.value ?? ''}
                  onChange={field.onChange}
                  placeholder="Commence à taper le numéro et la rue…"
                />
              )}
            />
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

          <input type="hidden" {...register('technician_id')} />
          <div className="mrow">
            <div className="fg">
              <label>Technicien assigné</label>
              <Controller
                name="technician_name"
                control={control}
                render={({ field }) => (
                  <TechnicianAutocomplete
                    value={field.value ?? ''}
                    onChange={(name, tech) => {
                      field.onChange(name)
                      setValue('technician_id', tech?.id ?? '')
                    }}
                    placeholder="Tape le nom ou choisis dans tes techniciens"
                  />
                )}
              />
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
            {isEdit && (
              <button
                type="button"
                className="mf del"
                onClick={handleDelete}
                disabled={isDeleting || isSubmitting}
                style={{ marginRight: 'auto', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
              >
                <Trash2 size={14} strokeWidth={1.8} />
                {isDeleting ? 'Suppression…' : 'Supprimer'}
              </button>
            )}
            <button type="button" className="mf out" onClick={onClose} disabled={isSubmitting || isDeleting}>
              Annuler
            </button>
            <button type="submit" className="mf prim" disabled={isSubmitting || isDeleting}>
              {isSubmitting
                ? (isEdit ? 'Enregistrement…' : 'Création…')
                : (isEdit ? 'Enregistrer' : "Créer l'intervention")}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

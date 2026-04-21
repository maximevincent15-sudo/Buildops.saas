import { zodResolver } from '@hookform/resolvers/zod'
import { Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { MouseEvent } from 'react'
import { useForm } from 'react-hook-form'
import { useAuthStore } from '../../auth/store'
import { createTechnician, deleteTechnician, setTechnicianActive, updateTechnician } from '../api'
import { createTechnicianSchema } from '../schemas'
import type { CreateTechnicianInput, Technician } from '../schemas'
import { TechnicianCertifications } from './TechnicianCertifications'

type Props = {
  open: boolean
  onClose: () => void
  onChanged?: () => void
  technician?: Technician | null
}

function toFormValues(t: Technician | null | undefined): Partial<CreateTechnicianInput> {
  if (!t) return {}
  return {
    first_name: t.first_name,
    last_name: t.last_name,
    email: t.email ?? '',
    phone: t.phone ?? '',
    role: t.role ?? '',
    notes: t.notes ?? '',
  }
}

export function TechnicianModal({ open, onClose, onChanged, technician }: Props) {
  const isEdit = !!technician
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [isToggling, setIsToggling] = useState(false)
  const profile = useAuthStore((s) => s.profile)
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CreateTechnicianInput>({
    resolver: zodResolver(createTechnicianSchema),
    defaultValues: toFormValues(technician),
  })

  useEffect(() => {
    if (open) {
      reset(toFormValues(technician))
      setSubmitError(null)
    }
  }, [open, technician, reset])

  async function onSubmit(data: CreateTechnicianInput) {
    if (!profile?.organization_id) {
      setSubmitError('Profil non chargé. Reconnecte-toi.')
      return
    }
    setSubmitError(null)
    try {
      if (isEdit && technician) {
        await updateTechnician(technician.id, data)
      } else {
        await createTechnician(data, profile.organization_id)
      }
      reset()
      onClose()
      onChanged?.()
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : 'Erreur inconnue')
    }
  }

  async function handleDelete() {
    if (!technician) return
    const ok = window.confirm(
      `Supprimer le technicien "${technician.first_name} ${technician.last_name}" ?\n\nLes interventions déjà assignées conservent le nom mais perdent le lien.\n\nAstuce : tu peux aussi le désactiver plutôt que le supprimer.`,
    )
    if (!ok) return
    setIsDeleting(true)
    setSubmitError(null)
    try {
      await deleteTechnician(technician.id)
      onClose()
      onChanged?.()
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : 'Erreur inconnue')
    } finally {
      setIsDeleting(false)
    }
  }

  async function handleToggleActive() {
    if (!technician) return
    setIsToggling(true)
    setSubmitError(null)
    try {
      await setTechnicianActive(technician.id, !technician.active)
      onClose()
      onChanged?.()
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : 'Erreur inconnue')
    } finally {
      setIsToggling(false)
    }
  }

  function handleBackdropClick(e: MouseEvent<HTMLDivElement>) {
    if (e.target === e.currentTarget) onClose()
  }

  if (!open) return null

  const anyLoading = isSubmitting || isDeleting || isToggling

  return (
    <div className="overlay open" onClick={handleBackdropClick}>
      <div className="modal">
        <div className="modal-head">
          <span className="modal-title">
            {isEdit
              ? `Technicien : ${technician?.first_name} ${technician?.last_name}`
              : 'Nouveau technicien'}
          </span>
          <button type="button" className="modal-x" onClick={onClose} aria-label="Fermer">×</button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div className="mrow">
            <div className="fg">
              <label>Prénom</label>
              <input type="text" placeholder="Ex: Thomas" {...register('first_name')} />
              {errors.first_name && <span className="ferr on">{errors.first_name.message}</span>}
            </div>
            <div className="fg">
              <label>Nom</label>
              <input type="text" placeholder="Ex: Moreau" {...register('last_name')} />
              {errors.last_name && <span className="ferr on">{errors.last_name.message}</span>}
            </div>
          </div>

          <div className="fg">
            <label>Rôle (optionnel)</label>
            <input type="text" placeholder="Ex: Chef d'équipe, Technicien senior…" {...register('role')} />
          </div>

          <div className="mrow">
            <div className="fg">
              <label>Email (optionnel)</label>
              <input type="email" placeholder="prenom@exemple.fr" {...register('email')} />
              {errors.email && <span className="ferr on">{errors.email.message}</span>}
            </div>
            <div className="fg">
              <label>Téléphone (optionnel)</label>
              <input type="tel" placeholder="06 12 34 56 78" {...register('phone')} />
            </div>
          </div>

          <div className="fg">
            <label>Notes internes</label>
            <input type="text" placeholder="Ex: habilitation électrique, véhicule..." {...register('notes')} />
          </div>

          {isEdit && technician && !technician.active && (
            <p className="text-ink-3 text-xs font-light">
              Ce technicien est actuellement <strong>inactif</strong> — il n'apparaît plus dans les listes d'assignation.
            </p>
          )}

          {isEdit && technician && profile?.organization_id && (
            <TechnicianCertifications
              technicianId={technician.id}
              organizationId={profile.organization_id}
            />
          )}

          {submitError && <span className="ferr on">{submitError}</span>}

          <div className="modal-foot">
            {isEdit && (
              <button
                type="button"
                className="mf del"
                onClick={handleDelete}
                disabled={anyLoading}
                style={{ marginRight: 'auto', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
              >
                <Trash2 size={14} strokeWidth={1.8} />
                {isDeleting ? 'Suppression…' : 'Supprimer'}
              </button>
            )}
            {isEdit && technician && (
              <button
                type="button"
                className="mf out"
                onClick={handleToggleActive}
                disabled={anyLoading}
              >
                {isToggling ? '…' : technician.active ? 'Désactiver' : 'Réactiver'}
              </button>
            )}
            <button type="button" className="mf out" onClick={onClose} disabled={anyLoading}>
              Annuler
            </button>
            <button type="submit" className="mf prim" disabled={anyLoading}>
              {isSubmitting
                ? (isEdit ? 'Enregistrement…' : 'Création…')
                : (isEdit ? 'Enregistrer' : 'Créer le technicien')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

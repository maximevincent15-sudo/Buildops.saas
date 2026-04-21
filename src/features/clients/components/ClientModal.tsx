import { zodResolver } from '@hookform/resolvers/zod'
import { Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { MouseEvent } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { useAuthStore } from '../../auth/store'
import { AddressAutocomplete } from '../../../shared/ui/AddressAutocomplete'
import { createClient, deleteClient, updateClient } from '../api'
import { createClientSchema } from '../schemas'
import type { Client, CreateClientInput } from '../schemas'

type Props = {
  open: boolean
  onClose: () => void
  onChanged?: () => void
  client?: Client | null
}

function toFormValues(c: Client | null | undefined): Partial<CreateClientInput> {
  if (!c) return {}
  return {
    name: c.name,
    contact_name: c.contact_name ?? '',
    contact_email: c.contact_email ?? '',
    contact_phone: c.contact_phone ?? '',
    address: c.address ?? '',
    notes: c.notes ?? '',
  }
}

export function ClientModal({ open, onClose, onChanged, client }: Props) {
  const isEdit = !!client
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const profile = useAuthStore((s) => s.profile)
  const {
    register,
    handleSubmit,
    reset,
    control,
    formState: { errors, isSubmitting },
  } = useForm<CreateClientInput>({
    resolver: zodResolver(createClientSchema),
    defaultValues: toFormValues(client),
  })

  useEffect(() => {
    if (open) {
      reset(toFormValues(client))
      setSubmitError(null)
    }
  }, [open, client, reset])

  async function onSubmit(data: CreateClientInput) {
    if (!profile?.organization_id) {
      setSubmitError('Profil non chargé. Reconnecte-toi.')
      return
    }
    setSubmitError(null)
    try {
      if (isEdit && client) {
        await updateClient(client.id, data)
      } else {
        await createClient(data, profile.organization_id)
      }
      reset()
      onClose()
      onChanged?.()
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : 'Erreur inconnue')
    }
  }

  async function handleDelete() {
    if (!client) return
    const ok = window.confirm(
      `Supprimer le client "${client.name}" ?\n\nL'historique des interventions déjà créées pour ce client reste conservé.\n\nCette action est irréversible.`,
    )
    if (!ok) return
    setIsDeleting(true)
    setSubmitError(null)
    try {
      await deleteClient(client.id)
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
            {isEdit ? `Fiche : ${client?.name}` : 'Nouveau client'}
          </span>
          <button type="button" className="modal-x" onClick={onClose} aria-label="Fermer">×</button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div className="fg">
            <label>Nom du client / établissement</label>
            <input type="text" placeholder="Ex: Mairie de Creil, Résidence Les Lilas…" {...register('name')} />
            {errors.name && <span className="ferr on">{errors.name.message}</span>}
          </div>

          <div className="mrow">
            <div className="fg">
              <label>Contact principal</label>
              <input type="text" placeholder="Ex: M. Dupont" {...register('contact_name')} />
            </div>
            <div className="fg">
              <label>Téléphone</label>
              <input type="tel" placeholder="06 12 34 56 78" {...register('contact_phone')} />
            </div>
          </div>

          <div className="fg">
            <label>Email</label>
            <input type="email" placeholder="contact@exemple.fr" {...register('contact_email')} />
            {errors.contact_email && <span className="ferr on">{errors.contact_email.message}</span>}
          </div>

          <div className="fg">
            <label>Adresse</label>
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

          <div className="fg">
            <label>Notes internes</label>
            <input type="text" placeholder="Accès, consignes, infos utiles au technicien" {...register('notes')} />
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
                : (isEdit ? 'Enregistrer' : 'Créer le client')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

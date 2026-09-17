import { zodResolver } from '@hookform/resolvers/zod'
import { Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { MouseEvent } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { useAuthStore } from '../../auth/store'
import { listClients } from '../../clients/api'
import type { Client } from '../../clients/schemas'
import { AddressAutocomplete } from '../../../shared/ui/AddressAutocomplete'
import { createSite, deleteSite, updateSite } from '../api'
import { createSiteSchema } from '../schemas'
import type { CreateSiteInput, Site } from '../schemas'

type Props = {
  open: boolean
  onClose: () => void
  onChanged?: (site?: Site) => void
  site?: Site | null
  defaultClientId?: string
}

function toFormValues(
  s: Site | null | undefined,
  defaultClientId?: string,
): Partial<CreateSiteInput> {
  if (!s) return { client_id: defaultClientId }
  return {
    client_id: s.client_id,
    name: s.name,
    address: s.address ?? '',
    postal_code: s.postal_code ?? '',
    city: s.city ?? '',
    contact_name: s.contact_name ?? '',
    contact_phone: s.contact_phone ?? '',
    access_notes: s.access_notes ?? '',
    notes: s.notes ?? '',
  }
}

export function SiteModal({
  open,
  onClose,
  onChanged,
  site,
  defaultClientId,
}: Props) {
  const isEdit = !!site
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [clients, setClients] = useState<Client[]>([])
  const profile = useAuthStore((s) => s.profile)

  const {
    register,
    handleSubmit,
    reset,
    control,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<CreateSiteInput>({
    resolver: zodResolver(createSiteSchema),
    defaultValues: toFormValues(site, defaultClientId),
  })

  useEffect(() => {
    if (!open) return
    reset(toFormValues(site, defaultClientId))
    setSubmitError(null)
    listClients()
      .then(setClients)
      .catch(() => setClients([]))
  }, [open, site, defaultClientId, reset])

  async function onSubmit(data: CreateSiteInput) {
    if (!profile?.organization_id) {
      setSubmitError('Profil non chargé. Reconnecte-toi.')
      return
    }
    setSubmitError(null)
    try {
      let saved: Site
      if (isEdit && site) {
        saved = await updateSite(site.id, data)
      } else {
        saved = await createSite(data, profile.organization_id)
      }
      reset()
      onClose()
      onChanged?.(saved)
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : 'Erreur inconnue')
    }
  }

  async function handleDelete() {
    if (!site) return
    const ok = window.confirm(
      `Supprimer le site "${site.name}" ?\n\nTous les équipements de ce site seront bloqués (contrainte de clé étrangère).\n\nCette action est irréversible.`,
    )
    if (!ok) return
    setIsDeleting(true)
    setSubmitError(null)
    try {
      await deleteSite(site.id)
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
            {isEdit ? `Site : ${site?.name}` : 'Nouveau site'}
          </span>
          <button type="button" className="modal-x" onClick={onClose} aria-label="Fermer">×</button>
        </div>

        <form
          onSubmit={handleSubmit(onSubmit)}
          style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}
        >
          <div className="fg">
            <label>Client</label>
            <select {...register('client_id')} disabled={isEdit}>
              <option value="">— Choisir un client —</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            {errors.client_id && <span className="ferr on">Client requis</span>}
          </div>

          <div className="fg">
            <label>Nom du site</label>
            <input
              type="text"
              placeholder="Ex : Site principal Montauban, Atelier Toulouse Sud…"
              {...register('name')}
            />
            {errors.name && <span className="ferr on">{errors.name.message}</span>}
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
                  onPicked={(s) => {
                    if (s.postcode) setValue('postal_code', s.postcode)
                    if (s.city) setValue('city', s.city)
                  }}
                  placeholder="Commence à taper le numéro et la rue…"
                />
              )}
            />
          </div>

          <div className="mrow">
            <div className="fg">
              <label>Code postal</label>
              <input type="text" placeholder="82000" {...register('postal_code')} />
            </div>
            <div className="fg">
              <label>Ville</label>
              <input type="text" placeholder="Montauban" {...register('city')} />
            </div>
          </div>

          <div className="mrow">
            <div className="fg">
              <label>Contact sur place</label>
              <input
                type="text"
                placeholder="Ex : M. Lafont, directeur"
                {...register('contact_name')}
              />
            </div>
            <div className="fg">
              <label>Téléphone</label>
              <input
                type="tel"
                placeholder="06 12 34 56 78"
                {...register('contact_phone')}
              />
            </div>
          </div>

          <div className="fg">
            <label>Modalités d'accès (parking, digicode, gardien, horaires…)</label>
            <textarea
              rows={2}
              placeholder="Ex : Parking clients rue. Digicode 8492A. Sonner à l'accueil."
              {...register('access_notes')}
            />
          </div>

          <div className="fg">
            <label>Notes internes</label>
            <input
              type="text"
              placeholder="Autres infos utiles au technicien"
              {...register('notes')}
            />
          </div>

          {isEdit && site?.public_token && (
            <div
              style={{
                padding: '10px 14px',
                background: 'var(--acc-lt, #E8EEF8)',
                border: '1px solid var(--acc, #3A5CA8)',
                borderRadius: 8,
                fontSize: 12.5,
                color: 'var(--acc, #3A5CA8)',
              }}
            >
              <div style={{ fontWeight: 700, marginBottom: 4 }}>
                🔗 Registre équipements partageable
              </div>
              <div style={{ marginBottom: 8, color: 'var(--ink2)' }}>
                Transmets ce lien à ton client ou à la commission de sécurité — il affiche l'inventaire à jour du site, sans authentification.
              </div>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <input
                  type="text"
                  readOnly
                  value={`${window.location.origin}/registre/${site.public_token}`}
                  style={{ flex: 1, fontFamily: 'monospace', fontSize: 11.5, padding: 6 }}
                  onFocus={(e) => e.currentTarget.select()}
                />
                <button
                  type="button"
                  className="btn-sm"
                  onClick={() => {
                    void navigator.clipboard.writeText(
                      `${window.location.origin}/registre/${site.public_token}`,
                    )
                    alert('Lien copié dans le presse-papier')
                  }}
                >
                  Copier
                </button>
                <a
                  href={`/registre/${site.public_token}`}
                  target="_blank"
                  rel="noreferrer"
                  className="btn-sm"
                  style={{ textDecoration: 'none' }}
                >
                  Ouvrir
                </a>
              </div>
            </div>
          )}

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
                : (isEdit ? 'Enregistrer' : 'Créer le site')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

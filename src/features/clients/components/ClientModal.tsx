import { zodResolver } from '@hookform/resolvers/zod'
import { AlertTriangle, Building2, CheckCircle2, Loader2, Trash2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { MouseEvent } from 'react'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { useAuthStore } from '../../auth/store'
import { ClientPortalSection } from '../../portail/components/ClientPortalSection'
import { ReportHistoryList } from '../../rapports/components/ReportHistoryList'
import { AddressAutocomplete } from '../../../shared/ui/AddressAutocomplete'
import { createClient, deleteClient, updateClient } from '../api'
import { formatCompanyNumber, useCompanyLookup } from '../companyLookup'
import type { CompanyInfo, CompanyLookupState } from '../companyLookup'
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
    company_number: c.siret ?? c.siren ?? '',
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
  const appliedRef = useRef<string | null>(null)
  const {
    register,
    handleSubmit,
    reset,
    control,
    setValue,
    getValues,
    formState: { errors, isSubmitting },
  } = useForm<CreateClientInput>({
    resolver: zodResolver(createClientSchema),
    defaultValues: toFormValues(client),
  })

  useEffect(() => {
    if (open) {
      reset(toFormValues(client))
      setSubmitError(null)
      appliedRef.current = null
    }
  }, [open, client, reset])

  // SIREN / SIRET → pré-remplissage nom + adresse depuis l'annuaire des entreprises
  const companyNumber = useWatch({ control, name: 'company_number' })
  const lookup = useCompanyLookup(open ? companyNumber : '')
  const watchedName = useWatch({ control, name: 'name' })
  const watchedAddress = useWatch({ control, name: 'address' })

  function applyCompany(c: CompanyInfo) {
    setValue('name', c.name, { shouldValidate: true, shouldDirty: true })
    if (c.address) setValue('address', c.address, { shouldDirty: true })
    appliedRef.current = c.siret ?? c.siren
  }

  // Fiche vierge : on remplit directement. Sinon on propose (bouton) sans écraser.
  useEffect(() => {
    if (lookup.status !== 'ok') return
    const key = lookup.company.siret ?? lookup.company.siren
    if (appliedRef.current === key) return
    const { name, address } = getValues()
    if (!name?.trim() && !address?.trim()) applyCompany(lookup.company)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lookup])

  const canApply =
    lookup.status === 'ok'
    && ((watchedName ?? '').trim().toLowerCase() !== lookup.company.name.toLowerCase()
      || (!!lookup.company.address
        && (watchedAddress ?? '').trim().toLowerCase() !== lookup.company.address.toLowerCase()))

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
            <label>
              SIREN / SIRET{' '}
              <span style={{ color: 'var(--ink3)', fontWeight: 400 }}>(optionnel)</span>
            </label>
            <input
              type="text"
              inputMode="numeric"
              autoComplete="off"
              placeholder="Ex : 552 081 317 — remplit le nom et l'adresse"
              {...register('company_number')}
            />
            <CompanyFeedback
              state={lookup}
              error={errors.company_number?.message}
              canApply={canApply}
              onApply={() => lookup.status === 'ok' && applyCompany(lookup.company)}
            />
          </div>

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

          {/* Historique des rapports — uniquement en édition */}
          {isEdit && client && (
            <ReportHistoryList
              clientId={client.id}
              clientName={client.name}
              limit={5}
              hideIfEmpty
            />
          )}

          {/* Espace client en ligne — uniquement en édition */}
          {isEdit && client && (
            <ClientPortalSection
              clientId={client.id}
              clientName={client.name}
              clientEmail={client.contact_email}
            />
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
                : (isEdit ? 'Enregistrer' : 'Créer le client')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ───────── Feedback SIREN / SIRET ─────────
function CompanyFeedback({
  state,
  error,
  canApply,
  onApply,
}: {
  state: CompanyLookupState
  error?: string
  canApply: boolean
  onApply: () => void
}) {
  const hint = { fontSize: 12, marginTop: 4, lineHeight: 1.4 } as const

  if (error) return <span className="ferr on">{error}</span>

  switch (state.status) {
    case 'idle':
      return null
    case 'typing':
      return <span style={{ ...hint, color: 'var(--ink3)' }}>{state.hint}</span>
    case 'invalid':
      return <span className="ferr on">{state.reason}</span>
    case 'loading':
      return (
        <span style={{ ...hint, display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--ink2)' }}>
          <Loader2 size={12} className="spin" /> Recherche dans l'annuaire des entreprises…
        </span>
      )
    case 'notFound':
      return (
        <span style={{ ...hint, display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--ink2)' }}>
          <Building2 size={12} /> Introuvable dans l'annuaire — le numéro sera quand même enregistré.
        </span>
      )
    case 'ok': {
      const c = state.company
      return (
        <div style={{ ...hint, display: 'flex', alignItems: 'flex-start', gap: 6, color: 'var(--grn, #1e7a3e)' }}>
          <CheckCircle2 size={14} style={{ flexShrink: 0, marginTop: 1 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <strong>{c.name}</strong>
            <span style={{ color: 'var(--ink3)' }}> · SIREN {formatCompanyNumber(c.siren)}</span>
            {c.address && (
              <>
                <br />
                <span style={{ color: 'var(--ink3)' }}>{c.address}</span>
              </>
            )}
            {c.closed && (
              <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--red, #b42318)', marginTop: 2 }}>
                <AlertTriangle size={12} /> Entreprise ou établissement fermé selon l'INSEE
              </span>
            )}
          </div>
          {canApply && (
            <button
              type="button"
              className="mf out"
              onClick={onApply}
              style={{ flexShrink: 0, padding: '4px 10px', fontSize: 12 }}
            >
              Remplir la fiche
            </button>
          )}
        </div>
      )
    }
  }
}

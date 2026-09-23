import { zodResolver } from '@hookform/resolvers/zod'
import { Camera, CheckCircle2, Loader2, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { ChangeEvent, MouseEvent } from 'react'
import { useForm } from 'react-hook-form'
import { useAuthStore } from '../../auth/store'
import { listClients } from '../../clients/api'
import type { Client } from '../../clients/schemas'
import {
  createEquipmentUnit,
  createZone,
  deleteEquipmentUnit,
  listSites,
  listZones,
  updateEquipmentUnit,
} from '../api'
import {
  EQUIPMENT_FAMILIES,
  EQUIPMENT_FAMILY_LABELS,
  EQUIPMENT_STATUSES,
  EQUIPMENT_STATUS_LABELS,
  computeNextReplacementYear,
  createEquipmentUnitSchema,
} from '../schemas'
import { LabelScanError, scanEquipmentLabel } from '../scanLabel'
import type {
  CreateEquipmentUnitInput,
  EquipmentUnit,
  Site,
  Zone,
} from '../schemas'

type Props = {
  open: boolean
  onClose: () => void
  onChanged?: () => void
  unit?: EquipmentUnit | null
  defaultSiteId?: string
}

function toFormValues(
  u: EquipmentUnit | null | undefined,
  defaultSiteId?: string,
): Partial<CreateEquipmentUnitInput> {
  if (!u) {
    return {
      site_id: defaultSiteId,
      status: 'active',
      family: 'extincteurs',
    }
  }
  return {
    client_id: u.client_id,
    site_id: u.site_id,
    zone_id: u.zone_id ?? undefined,
    family: u.family,
    subtype: u.subtype ?? '',
    serial_number: u.serial_number,
    implantation: u.implantation ?? '',
    brand: u.brand ?? '',
    model: u.model ?? '',
    install_year: u.install_year ?? undefined,
    next_replacement_year: u.next_replacement_year ?? undefined,
    status: u.status,
    notes: u.notes ?? '',
  }
}

export function EquipmentUnitModal({
  open,
  onClose,
  onChanged,
  unit,
  defaultSiteId,
}: Props) {
  const isEdit = !!unit
  const profile = useAuthStore((s) => s.profile)

  const [submitError, setSubmitError] = useState<string | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  const [clients, setClients] = useState<Client[]>([])
  const [sites, setSites] = useState<Site[]>([])
  const [zones, setZones] = useState<Zone[]>([])
  const [newZoneName, setNewZoneName] = useState('')
  const [creatingZone, setCreatingZone] = useState(false)

  // Scan d'étiquette (photo → IA → champs pré-remplis)
  const fileRef = useRef<HTMLInputElement>(null)
  const [scanning, setScanning] = useState(false)
  const [scanPreview, setScanPreview] = useState<string | null>(null)
  const [scanMessage, setScanMessage] = useState<{ ok: boolean; text: string } | null>(null)

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    getValues,
    formState: { errors, isSubmitting },
  } = useForm<CreateEquipmentUnitInput>({
    resolver: zodResolver(createEquipmentUnitSchema),
    defaultValues: toFormValues(unit, defaultSiteId),
  })

  const watchedClientId = watch('client_id')
  const watchedSiteId = watch('site_id')
  const watchedFamily = watch('family')
  const watchedInstallYear = watch('install_year')

  // Année de réforme suggérée (calculée)
  const suggestedReplacementYear = useMemo(
    () => computeNextReplacementYear(watchedFamily, watchedInstallYear),
    [watchedFamily, watchedInstallYear],
  )

  // Reset au ré-ouverture
  useEffect(() => {
    if (!open) return
    reset(toFormValues(unit, defaultSiteId))
    setSubmitError(null)
    setNewZoneName('')
    setScanPreview(null)
    setScanMessage(null)
    listClients().then(setClients).catch(() => setClients([]))
  }, [open, unit, defaultSiteId, reset])

  // Charger les sites quand le client change
  useEffect(() => {
    if (!open) return
    if (!watchedClientId) {
      setSites([])
      return
    }
    listSites(watchedClientId)
      .then(setSites)
      .catch(() => setSites([]))
  }, [open, watchedClientId])

  // Charger les zones quand le site change
  useEffect(() => {
    if (!open) return
    if (!watchedSiteId) {
      setZones([])
      return
    }
    listZones(watchedSiteId)
      .then(setZones)
      .catch(() => setZones([]))
  }, [open, watchedSiteId])

  // Si le site sélectionné n'appartient plus à la liste (après changement de client),
  // reset le site sélectionné.
  useEffect(() => {
    if (!watchedSiteId) return
    if (sites.length > 0 && !sites.some((s) => s.id === watchedSiteId)) {
      setValue('site_id', '' as unknown as string)
      setValue('zone_id', undefined)
    }
  }, [sites, watchedSiteId, setValue])

  async function handleCreateZone() {
    if (!profile?.organization_id || !watchedSiteId || !newZoneName.trim()) return
    setCreatingZone(true)
    try {
      const z = await createZone(
        { site_id: watchedSiteId, name: newZoneName.trim(), display_order: zones.length },
        profile.organization_id,
      )
      setZones((prev) => [...prev, z])
      setValue('zone_id', z.id)
      setNewZoneName('')
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : 'Erreur création zone')
    } finally {
      setCreatingZone(false)
    }
  }

  async function handleScanFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = '' // permet de re-scanner la même photo
    if (!file) return
    setScanning(true)
    setScanMessage(null)
    setScanPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev)
      return URL.createObjectURL(file)
    })
    try {
      const r = await scanEquipmentLabel(file)
      if (!r.readable) {
        setScanMessage({ ok: false, text: 'Étiquette illisible : reprends la photo plus près, bien à plat et sans reflet.' })
        return
      }
      const filled: string[] = []
      const opts = { shouldDirty: true, shouldValidate: true }
      if (r.family) { setValue('family', r.family, opts); filled.push('famille') }
      if (r.subtype) { setValue('subtype', r.subtype, opts); filled.push('type') }
      if (r.brand) { setValue('brand', r.brand, opts); filled.push('marque') }
      if (r.model) { setValue('model', r.model, opts); filled.push('modèle') }
      if (r.manufacture_year) { setValue('install_year', r.manufacture_year, opts); filled.push('année') }
      // N° de série fabricant + infos annexes → notes (le « N° d'unité » reste la numérotation du site)
      const extras = [
        r.serial_number && `N° série fabricant : ${r.serial_number}`,
        r.extra,
      ].filter((x): x is string => !!x)
      const notes = getValues('notes') ?? ''
      const toAdd = extras.filter((x) => !notes.includes(x))
      if (toAdd.length > 0) {
        setValue('notes', [notes.trim(), ...toAdd].filter(Boolean).join(' · '), opts)
        filled.push('notes')
      }
      setScanMessage(
        filled.length > 0
          ? { ok: true, text: `Rempli depuis l'étiquette : ${filled.join(', ')}. Vérifie avant d'enregistrer.` }
          : { ok: false, text: 'Aucune information exploitable trouvée sur la photo.' },
      )
    } catch (err) {
      setScanMessage({
        ok: false,
        text: err instanceof LabelScanError ? err.message : 'La lecture a échoué. Réessaie ou remplis à la main.',
      })
    } finally {
      setScanning(false)
    }
  }

  async function onSubmit(data: CreateEquipmentUnitInput) {
    if (!profile?.organization_id) {
      setSubmitError('Profil non chargé. Reconnecte-toi.')
      return
    }
    setSubmitError(null)
    try {
      if (isEdit && unit) {
        await updateEquipmentUnit(unit.id, data)
      } else {
        await createEquipmentUnit(data, profile.organization_id)
      }
      reset()
      onClose()
      onChanged?.()
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : 'Erreur inconnue')
    }
  }

  async function handleDelete() {
    if (!unit) return
    const ok = window.confirm(
      `Supprimer l'unité n°${unit.serial_number} ?\n\nCette action est irréversible.`,
    )
    if (!ok) return
    setIsDeleting(true)
    setSubmitError(null)
    try {
      await deleteEquipmentUnit(unit.id)
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
            {isEdit
              ? `Unité n°${unit?.serial_number} — ${EQUIPMENT_FAMILY_LABELS[unit!.family]}`
              : 'Nouvelle unité'}
          </span>
          <button type="button" className="modal-x" onClick={onClose} aria-label="Fermer">×</button>
        </div>

        <form
          onSubmit={handleSubmit(onSubmit)}
          style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}
        >
          {/* Localisation */}
          <div className="mrow">
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
              <label>Site</label>
              <select {...register('site_id')} disabled={isEdit || !watchedClientId}>
                <option value="">
                  {!watchedClientId ? '— Choisis un client d\'abord —' : '— Choisir un site —'}
                </option>
                {sites.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
              {errors.site_id && <span className="ferr on">Site requis</span>}
              {watchedClientId && sites.length === 0 && (
                <span className="text-ink-2 text-sm" style={{ marginTop: 4, fontSize: 12 }}>
                  Aucun site pour ce client. Crée-en un d'abord.
                </span>
              )}
            </div>
          </div>

          {/* Zone */}
          <div className="fg">
            <label>Zone (optionnel)</label>
            <select {...register('zone_id')} disabled={!watchedSiteId}>
              <option value="">
                {!watchedSiteId ? '— Choisis un site d\'abord —' : '— Aucune zone —'}
              </option>
              {zones.map((z) => (
                <option key={z.id} value={z.id}>
                  {z.parent_zone ? `${z.parent_zone} · ${z.name}` : z.name}
                </option>
              ))}
            </select>
            {watchedSiteId && (
              <div
                style={{
                  display: 'flex',
                  gap: 6,
                  marginTop: 6,
                  alignItems: 'center',
                }}
              >
                <input
                  type="text"
                  placeholder="+ Nouvelle zone (ex : Atelier peinture)"
                  value={newZoneName}
                  onChange={(e) => setNewZoneName(e.target.value)}
                  style={{ flex: 1, fontSize: 12.5 }}
                />
                <button
                  type="button"
                  className="btn-sm"
                  onClick={handleCreateZone}
                  disabled={creatingZone || !newZoneName.trim()}
                >
                  {creatingZone ? '…' : 'Créer'}
                </button>
              </div>
            )}
          </div>

          {/* Scan d'étiquette */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: '10px 12px',
              border: '1px dashed var(--acc)',
              borderRadius: 10,
              background: 'var(--wht)',
            }}
          >
            {scanPreview ? (
              <img
                src={scanPreview}
                alt="Étiquette scannée"
                style={{ width: 48, height: 48, objectFit: 'cover', borderRadius: 6, flexShrink: 0 }}
              />
            ) : (
              <Camera size={22} strokeWidth={1.6} style={{ color: 'var(--acc)', flexShrink: 0 }} />
            )}
            <div style={{ flex: 1, minWidth: 0, fontSize: 12.5, lineHeight: 1.4 }}>
              {scanning ? (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--ink2)' }}>
                  <Loader2 size={13} className="spin" /> Lecture de l'étiquette…
                </span>
              ) : scanMessage ? (
                <span style={{ color: scanMessage.ok ? 'var(--grn)' : 'var(--red)', display: 'inline-flex', gap: 6 }}>
                  {scanMessage.ok && <CheckCircle2 size={14} style={{ flexShrink: 0, marginTop: 1 }} />}
                  {scanMessage.text}
                </span>
              ) : (
                <span style={{ color: 'var(--ink2)' }}>
                  <strong style={{ color: 'var(--ink)' }}>Scanner l'étiquette</strong> : prends la plaque en photo,
                  la marque, le type et l'année se remplissent tout seuls.
                </span>
              )}
            </div>
            <button
              type="button"
              className="btn-sm"
              onClick={() => fileRef.current?.click()}
              disabled={scanning}
              style={{ flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 6 }}
            >
              <Camera size={14} strokeWidth={1.8} />
              {scanPreview ? 'Reprendre' : 'Scanner'}
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              capture="environment"
              hidden
              onChange={handleScanFile}
            />
          </div>

          {/* Famille + N° + type */}
          <div className="mrow">
            <div className="fg">
              <label>Famille</label>
              <select {...register('family')}>
                {EQUIPMENT_FAMILIES.map((f) => (
                  <option key={f} value={f}>{EQUIPMENT_FAMILY_LABELS[f]}</option>
                ))}
              </select>
            </div>
            <div className="fg">
              <label>N° d'unité (unique sur ce site)</label>
              <input
                type="text"
                placeholder="Ex : 01, 17, A-42"
                {...register('serial_number')}
              />
              {errors.serial_number && (
                <span className="ferr on">{errors.serial_number.message}</span>
              )}
            </div>
          </div>

          <div className="mrow">
            <div className="fg">
              <label>Type / sous-type</label>
              <input
                type="text"
                placeholder="Ex : EPA 6L, CO² 5kg, P6 ABC"
                {...register('subtype')}
              />
            </div>
            <div className="fg">
              <label>Implantation</label>
              <input
                type="text"
                placeholder="Ex : Entrée principale, Cabine A"
                {...register('implantation')}
              />
            </div>
          </div>

          {/* Marque + modèle */}
          <div className="mrow">
            <div className="fg">
              <label>Marque</label>
              <input
                type="text"
                placeholder="Ex : ANDRIEU, CRONO FEU"
                {...register('brand')}
              />
            </div>
            <div className="fg">
              <label>Modèle</label>
              <input type="text" placeholder="(facultatif)" {...register('model')} />
            </div>
          </div>

          {/* Années */}
          <div className="mrow">
            <div className="fg">
              <label>Année de mise en service</label>
              <input
                type="number"
                min={1900}
                max={2100}
                placeholder="2020"
                {...register('install_year', { valueAsNumber: true })}
              />
              {errors.install_year && (
                <span className="ferr on">Année invalide</span>
              )}
            </div>
            <div className="fg">
              <label>
                Année de réforme prévue
                {suggestedReplacementYear !== null && (
                  <span
                    style={{
                      fontSize: 11,
                      color: 'var(--ink3)',
                      fontWeight: 400,
                      marginLeft: 6,
                    }}
                  >
                    (suggéré : {suggestedReplacementYear})
                  </span>
                )}
              </label>
              <input
                type="number"
                min={1900}
                max={2100}
                placeholder={suggestedReplacementYear?.toString() ?? '—'}
                {...register('next_replacement_year', { valueAsNumber: true })}
              />
            </div>
          </div>

          {/* Statut */}
          <div className="fg">
            <label>Statut</label>
            <select {...register('status')}>
              {EQUIPMENT_STATUSES.map((s) => (
                <option key={s} value={s}>{EQUIPMENT_STATUS_LABELS[s]}</option>
              ))}
            </select>
          </div>

          {/* Notes */}
          <div className="fg">
            <label>Notes internes</label>
            <input
              type="text"
              placeholder="Observation, historique, remarques…"
              {...register('notes')}
            />
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
                : (isEdit ? 'Enregistrer' : 'Créer l\'unité')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

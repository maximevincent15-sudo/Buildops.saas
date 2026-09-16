import { zodResolver } from '@hookform/resolvers/zod'
import { Bell, Check, ChevronLeft, ChevronRight, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import type { MouseEvent } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { useAuthStore } from '../../auth/store'
import { getClient } from '../../clients/api'
import { listSites, listZones } from '../../equipment/api'
import type { Site, Zone } from '../../equipment/schemas'
import { RelanceModal } from '../../relances/components/RelanceModal'
import {
  EQUIPMENT_TYPES,
  INTERVENTION_PRIORITIES,
} from '../../../shared/constants/interventions'
import type { EquipmentType } from '../../../shared/constants/interventions'
import { AddressAutocomplete } from '../../../shared/ui/AddressAutocomplete'
import { createIntervention, deleteIntervention, updateIntervention } from '../api'
import { createInterventionSchema } from '../schemas'
import type { CreateInterventionInput, Intervention, Slot } from '../schemas'
import { ClientAutocomplete } from './ClientAutocomplete'
import { TechnicianAutocomplete } from './TechnicianAutocomplete'

// ─── Types & constantes ─────────────────────────────────────

type Props = {
  open: boolean
  onClose: () => void
  onChanged?: () => void
  intervention?: Intervention | null
  /** Valeurs pré-remplies en mode création (ex: intervention corrective depuis un rapport) */
  seed?: Partial<CreateInterventionInput>
}

const STEPS = [
  { id: 1, label: 'Client' },
  { id: 2, label: 'Site & zones' },
  { id: 3, label: 'Chantier' },
  { id: 4, label: 'Planning' },
  { id: 5, label: 'Récap' },
] as const

const SLOT_OPTIONS: { value: Slot; label: string; sub: string }[] = [
  { value: 'morning', label: 'Matin', sub: '8h — 12h' },
  { value: 'afternoon', label: 'Après-midi', sub: '14h — 18h' },
  { value: 'fullday', label: 'Journée', sub: '8h — 17h' },
  { value: 'multiday', label: 'Multi-jours', sub: 'Étalé' },
]

const COMMON_MATERIAL = [
  'Étiquettes prestataire',
  'Mouillant additif',
  'Plombages',
  'Goupilles rechange',
  'Cartouches CO²',
  'Nacelle',
  'Peinture rouge',
]

const SLOT_LABEL: Record<Slot, string> = {
  morning: 'Matin (8h-12h)',
  afternoon: 'Après-midi (14h-18h)',
  fullday: 'Journée (8h-17h)',
  multiday: 'Multi-jours',
}

// ─── Helpers ───────────────────────────────────────────────

function toFormValues(i: Intervention | null | undefined): Partial<CreateInterventionInput> {
  if (!i) {
    return {
      equipment_types: ['extincteurs'],
      priority: 'normale',
      client_id: '',
      technician_id: '',
      recurrence_active: true,
      material_needed: [],
      slot: 'fullday',
      duration_minutes: 120,
    }
  }
  const types =
    i.equipment_types && i.equipment_types.length > 0
      ? (i.equipment_types as EquipmentType[])
      : i.equipment_type
        ? [i.equipment_type as EquipmentType]
        : []
  return {
    client_name: i.client_name,
    client_id: i.client_id ?? '',
    site_name: i.site_name ?? '',
    site_id: i.site_id ?? null,
    address: i.address ?? '',
    equipment_types: types,
    scheduled_date: i.scheduled_date ?? '',
    technician_name: i.technician_name ?? '',
    technician_id: i.technician_id ?? '',
    priority: i.priority as CreateInterventionInput['priority'],
    notes: i.notes ?? '',
    recurrence_active: i.recurrence_active ?? true,
    chantier_address: i.chantier_address ?? '',
    chantier_postal_code: i.chantier_postal_code ?? '',
    chantier_city: i.chantier_city ?? '',
    chantier_contact_name: i.chantier_contact_name ?? '',
    chantier_contact_phone: i.chantier_contact_phone ?? '',
    chantier_access_parking: i.chantier_access_parking ?? '',
    chantier_access_digicode: i.chantier_access_digicode ?? '',
    chantier_access_building: i.chantier_access_building ?? '',
    chantier_access_hours: i.chantier_access_hours ?? '',
    slot: i.slot ?? undefined,
    start_time: i.start_time ?? '',
    duration_minutes: i.duration_minutes ?? undefined,
    zone_ids: i.zone_ids ?? [],
    material_needed: i.material_needed ?? [],
    recommendations: i.recommendations ?? '',
  }
}

// ─── Composant ─────────────────────────────────────────────

export function InterventionModal({ open, onClose, onChanged, intervention, seed }: Props) {
  const isEdit = !!intervention
  const profile = useAuthStore((s) => s.profile)

  const [submitError, setSubmitError] = useState<string | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [relanceOpen, setRelanceOpen] = useState(false)
  const [clientEmail, setClientEmail] = useState<string | null>(null)
  const [clientContactName, setClientContactName] = useState<string | null>(null)

  const [step, setStep] = useState(1)
  const [sites, setSites] = useState<Site[]>([])
  const [zones, setZones] = useState<Zone[]>([])
  const [customMaterial, setCustomMaterial] = useState('')

  const {
    register,
    handleSubmit,
    reset,
    control,
    setValue,
    watch,
    getValues,
    formState: { errors, isSubmitting },
  } = useForm<CreateInterventionInput>({
    resolver: zodResolver(createInterventionSchema),
    defaultValues: { ...toFormValues(intervention), ...(seed ?? {}) },
  })

  const clientId = watch('client_id')
  const siteId = watch('site_id')
  const scheduledDate = watch('scheduled_date')
  const slot = watch('slot')
  const materialNeeded = watch('material_needed') ?? []
  const zoneIds = watch('zone_ids') ?? []

  // Charge l'email du client (mode edit uniquement, pour la relance)
  useEffect(() => {
    if (!intervention?.client_id) {
      setClientEmail(null)
      setClientContactName(null)
      return
    }
    let alive = true
    void getClient(intervention.client_id)
      .then((c) => {
        if (!alive) return
        setClientEmail(c?.contact_email ?? null)
        setClientContactName(c?.contact_name ?? null)
      })
      .catch(() => { /* ignore */ })
    return () => { alive = false }
  }, [intervention?.client_id])

  // Reset au ré-ouverture
  useEffect(() => {
    if (!open) return
    reset({ ...toFormValues(intervention), ...(seed ?? {}) })
    setStep(1)
    setSubmitError(null)
    setCustomMaterial('')
  }, [open, intervention, seed, reset])

  // Charge les sites du client
  useEffect(() => {
    if (!open) return
    if (!clientId) {
      setSites([])
      return
    }
    listSites(clientId).then(setSites).catch(() => setSites([]))
  }, [open, clientId])

  // Charge les zones du site
  useEffect(() => {
    if (!open) return
    if (!siteId) {
      setZones([])
      return
    }
    listZones(siteId).then(setZones).catch(() => setZones([]))
  }, [open, siteId])

  // Pré-remplit l'adresse chantier depuis le site quand on choisit un site
  useEffect(() => {
    if (!siteId) return
    const site = sites.find((s) => s.id === siteId)
    if (!site) return
    // Seulement si l'adresse chantier n'est pas déjà remplie
    if (!getValues('chantier_address') && site.address) {
      setValue('chantier_address', site.address)
    }
    if (!getValues('chantier_postal_code') && site.postal_code) {
      setValue('chantier_postal_code', site.postal_code)
    }
    if (!getValues('chantier_city') && site.city) {
      setValue('chantier_city', site.city)
    }
    if (!getValues('chantier_contact_name') && site.contact_name) {
      setValue('chantier_contact_name', site.contact_name)
    }
    if (!getValues('chantier_contact_phone') && site.contact_phone) {
      setValue('chantier_contact_phone', site.contact_phone)
    }
  }, [siteId, sites, setValue, getValues])

  // ─── Actions ─────────────────────────────────────────────

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

  function goPrev() {
    setStep((s) => Math.max(1, s - 1))
  }

  function goNext() {
    setStep((s) => Math.min(STEPS.length, s + 1))
  }

  function toggleMaterial(item: string) {
    const current = getValues('material_needed') ?? []
    if (current.includes(item)) {
      setValue('material_needed', current.filter((x) => x !== item))
    } else {
      setValue('material_needed', [...current, item])
    }
  }

  function addCustomMaterial() {
    const trimmed = customMaterial.trim()
    if (!trimmed) return
    const current = getValues('material_needed') ?? []
    if (!current.includes(trimmed)) {
      setValue('material_needed', [...current, trimmed])
    }
    setCustomMaterial('')
  }

  function toggleZone(id: string) {
    const current = getValues('zone_ids') ?? []
    if (current.includes(id)) {
      setValue('zone_ids', current.filter((x) => x !== id))
    } else {
      setValue('zone_ids', [...current, id])
    }
  }

  // ─── Récap helpers ────────────────────────────────────────

  const selectedSite = useMemo(
    () => sites.find((s) => s.id === siteId) ?? null,
    [sites, siteId],
  )
  const selectedZones = useMemo(
    () => zones.filter((z) => zoneIds.includes(z.id)),
    [zones, zoneIds],
  )

  if (!open) return null

  // ─── Rendu ────────────────────────────────────────────────

  return (
    <div className="overlay open" onClick={handleBackdropClick}>
      <div className="modal">
        <div className="modal-head">
          <span className="modal-title">
            {isEdit ? `Intervention ${intervention?.reference}` : 'Nouvelle intervention'}
          </span>
          <button type="button" className="modal-x" onClick={onClose} aria-label="Fermer">×</button>
        </div>

        {/* Stepper header */}
        <div style={stepperStyle}>
          {STEPS.map((s) => {
            const state = s.id === step ? 'active' : s.id < step ? 'done' : 'idle'
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => setStep(s.id)}
                style={{ ...stepStyle, ...stepStateStyle[state] }}
              >
                <span style={{ ...stepNumStyle, ...stepNumStateStyle[state] }}>
                  {state === 'done' ? '✓' : s.id}
                </span>
                {s.label}
              </button>
            )
          })}
        </div>

        <form
          onSubmit={handleSubmit(onSubmit)}
          style={{ display: 'flex', flexDirection: 'column', gap: '1rem', padding: '0.5rem 0' }}
        >
          <input type="hidden" {...register('client_id')} />
          <input type="hidden" {...register('technician_id')} />

          {/* ═══ ÉTAPE 1 · Client ═══ */}
          {step === 1 && (
            <>
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
                        // reset site quand on change de client
                        setValue('site_id', null)
                        setValue('zone_ids', [])
                      }}
                      placeholder="Tape le nom ou choisis dans tes fiches"
                    />
                  )}
                />
                {errors.client_name && <span className="ferr on">{errors.client_name.message}</span>}
              </div>

              {isEdit && (
                <div style={helpBoxStyle}>
                  Édition d'une intervention existante. Les 5 étapes te laissent compléter tous les champs — les valeurs existantes sont préservées.
                </div>
              )}
            </>
          )}

          {/* ═══ ÉTAPE 2 · Site & zones ═══ */}
          {step === 2 && (
            <>
              <div className="fg">
                <label>Site enregistré du client</label>
                {!clientId && (
                  <div style={emptyBoxStyle}>Choisis d'abord un client à l'étape 1.</div>
                )}
                {clientId && sites.length === 0 && (
                  <div style={emptyBoxStyle}>
                    Aucun site pour ce client. Va dans <strong>Équipements → Nouveau site</strong> pour en créer un, ou saisis un nom libre ci-dessous.
                  </div>
                )}
                {clientId && sites.length > 0 && (
                  <select
                    value={siteId ?? ''}
                    onChange={(e) => {
                      const v = e.target.value
                      setValue('site_id', v || null)
                      const s = sites.find((x) => x.id === v)
                      if (s) setValue('site_name', s.name)
                    }}
                  >
                    <option value="">— Site libre (à saisir ci-dessous) —</option>
                    {sites.map((s) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                )}
              </div>

              <div className="fg">
                <label>Nom du site (texte libre, si non enregistré)</label>
                <input
                  type="text"
                  placeholder="Ex: Hôtel de ville, Résidence Les Lilas…"
                  {...register('site_name')}
                />
              </div>

              {siteId && (
                <div className="fg">
                  <label>Zones concernées par cette intervention</label>
                  {zones.length === 0 && (
                    <div style={emptyBoxStyle}>
                      Aucune zone dans ce site. Tu pourras en ajouter depuis la fiche du site.
                    </div>
                  )}
                  {zones.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {zones.map((z) => {
                        const on = zoneIds.includes(z.id)
                        return (
                          <button
                            key={z.id}
                            type="button"
                            className={`filter-pill${on ? ' on' : ''}`}
                            onClick={() => toggleZone(z.id)}
                          >
                            {z.parent_zone ? `${z.parent_zone} · ${z.name}` : z.name}
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {/* ═══ ÉTAPE 3 · Localisation chantier ═══ */}
          {step === 3 && (
            <>
              <div style={helpBoxStyle}>
                L'adresse chantier est parfois différente du siège du client (chantier temporaire, annexe…). Ces infos apparaîtront dans le briefing du technicien sur son mobile.
              </div>

              <div className="fg">
                <label>Adresse du chantier</label>
                <Controller
                  name="chantier_address"
                  control={control}
                  render={({ field }) => (
                    <AddressAutocomplete
                      value={field.value ?? ''}
                      onChange={field.onChange}
                      onPicked={(s) => {
                        if (s.postcode) setValue('chantier_postal_code', s.postcode)
                        if (s.city) setValue('chantier_city', s.city)
                      }}
                      placeholder="12 route de Bordeaux, 82000 Montauban"
                    />
                  )}
                />
              </div>

              <div className="mrow">
                <div className="fg">
                  <label>Code postal</label>
                  <input type="text" placeholder="82000" {...register('chantier_postal_code')} />
                </div>
                <div className="fg">
                  <label>Ville</label>
                  <input type="text" placeholder="Montauban" {...register('chantier_city')} />
                </div>
              </div>

              <div className="mrow">
                <div className="fg">
                  <label>Contact sur place</label>
                  <input
                    type="text"
                    placeholder="Ex : M. Lafont, directeur"
                    {...register('chantier_contact_name')}
                  />
                </div>
                <div className="fg">
                  <label>Téléphone</label>
                  <input
                    type="tel"
                    placeholder="05 63 22 14 88"
                    {...register('chantier_contact_phone')}
                  />
                </div>
              </div>

              <div className="mrow">
                <div className="fg">
                  <label>Parking</label>
                  <input
                    type="text"
                    placeholder="Où se garer"
                    {...register('chantier_access_parking')}
                  />
                </div>
                <div className="fg">
                  <label>Digicode / Interphone</label>
                  <input
                    type="text"
                    placeholder="Ex : 8492A"
                    {...register('chantier_access_digicode')}
                  />
                </div>
              </div>

              <div className="mrow">
                <div className="fg">
                  <label>Étage / Bâtiment</label>
                  <input
                    type="text"
                    placeholder="Ex : Bâtiment A — R+1"
                    {...register('chantier_access_building')}
                  />
                </div>
                <div className="fg">
                  <label>Horaires d'ouverture</label>
                  <input
                    type="text"
                    placeholder="Ex : 7h30 – 18h"
                    {...register('chantier_access_hours')}
                  />
                </div>
              </div>
            </>
          )}

          {/* ═══ ÉTAPE 4 · Nature & équipe ═══ */}
          {step === 4 && (
            <>
              <div className="fg">
                <label>
                  Types d'équipement <span className="text-ink-3 text-xs font-light">(plusieurs possibles)</span>
                </label>
                <Controller
                  name="equipment_types"
                  control={control}
                  render={({ field }) => {
                    const selected = (field.value ?? []) as EquipmentType[]
                    const toggle = (code: EquipmentType) => {
                      if (selected.includes(code)) {
                        field.onChange(selected.filter((c) => c !== code))
                      } else {
                        field.onChange([...selected, code])
                      }
                    }
                    return (
                      <div className="equip-pills">
                        {(Object.entries(EQUIPMENT_TYPES) as [EquipmentType, string][]).map(([code, label]) => {
                          const on = selected.includes(code)
                          return (
                            <button
                              type="button"
                              key={code}
                              className={`equip-pill${on ? ' on' : ''}`}
                              onClick={() => toggle(code)}
                            >
                              <span className="equip-pill-check">
                                {on && <Check size={11} strokeWidth={3} />}
                              </span>
                              {label}
                            </button>
                          )
                        })}
                      </div>
                    )
                  }}
                />
                {errors.equipment_types && <span className="ferr on">{errors.equipment_types.message}</span>}
              </div>

              <div className="fg">
                <label>Créneau</label>
                <div style={slotGridStyle}>
                  {SLOT_OPTIONS.map((opt) => {
                    const on = slot === opt.value
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setValue('slot', opt.value)}
                        style={{ ...slotBtnStyle, ...(on ? slotBtnActiveStyle : {}) }}
                      >
                        <div style={{ fontWeight: 700, fontSize: 13.5 }}>{opt.label}</div>
                        <div style={{ fontSize: 11.5, color: 'var(--ink3)', marginTop: 2 }}>
                          {opt.sub}
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>

              <div className="mrow">
                <div className="fg">
                  <label>Date prévue</label>
                  <input type="date" {...register('scheduled_date')} />
                </div>
                <div className="fg">
                  <label>Heure d'arrivée</label>
                  <input type="time" {...register('start_time')} />
                </div>
              </div>

              <div className="fg">
                <label>Priorité</label>
                <select {...register('priority')}>
                  {Object.entries(INTERVENTION_PRIORITIES).map(([val, label]) => (
                    <option key={val} value={val}>{label}</option>
                  ))}
                </select>
              </div>

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
            </>
          )}

          {/* ═══ ÉTAPE 5 · Récap & consignes ═══ */}
          {step === 5 && (
            <>
              <div className="fg">
                <label>Consignes d'accès pour le technicien</label>
                <textarea
                  rows={2}
                  placeholder="Ex : Se garer parking côté rue. Sonner à l'accueil, demander M. Lafont."
                  {...register('notes')}
                />
              </div>

              <div className="fg">
                <label>Matériel à emporter</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 6 }}>
                  {COMMON_MATERIAL.map((m) => {
                    const on = materialNeeded.includes(m)
                    return (
                      <button
                        key={m}
                        type="button"
                        className={`filter-pill${on ? ' on' : ''}`}
                        onClick={() => toggleMaterial(m)}
                      >
                        {on ? '✓ ' : ''}{m}
                      </button>
                    )
                  })}
                  {materialNeeded.filter((m) => !COMMON_MATERIAL.includes(m)).map((m) => (
                    <button
                      key={m}
                      type="button"
                      className="filter-pill on"
                      onClick={() => toggleMaterial(m)}
                    >
                      ✓ {m}
                    </button>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <input
                    type="text"
                    placeholder="+ Ajouter un autre matériel"
                    value={customMaterial}
                    onChange={(e) => setCustomMaterial(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        addCustomMaterial()
                      }
                    }}
                    style={{ flex: 1, fontSize: 12.5 }}
                  />
                  <button
                    type="button"
                    className="btn-sm"
                    onClick={addCustomMaterial}
                    disabled={!customMaterial.trim()}
                  >
                    Ajouter
                  </button>
                </div>
              </div>

              <div className="fg">
                <label>Recommandations / notes techniques</label>
                <textarea
                  rows={2}
                  placeholder="Ex : 6 extincteurs > 10 ans à réformer d'office."
                  {...register('recommendations')}
                />
              </div>

              {/* Récap */}
              <div style={recapBoxStyle}>
                <div style={recapTitleStyle}>Récapitulatif</div>
                <RecapLine k="Client" v={watch('client_name') || '—'} />
                <RecapLine k="Site" v={selectedSite?.name || watch('site_name') || '—'} />
                <RecapLine
                  k="Adresse chantier"
                  v={watch('chantier_address') || '—'}
                />
                <RecapLine
                  k="Contact sur place"
                  v={
                    watch('chantier_contact_name')
                      ? `${watch('chantier_contact_name')}${watch('chantier_contact_phone') ? ' · ' + watch('chantier_contact_phone') : ''}`
                      : '—'
                  }
                />
                <RecapLine
                  k="Zones"
                  v={selectedZones.length > 0 ? selectedZones.map((z) => z.name).join(', ') : '—'}
                />
                <RecapLine
                  k="Équipements"
                  v={
                    (watch('equipment_types') ?? [])
                      .map((c) => EQUIPMENT_TYPES[c as EquipmentType])
                      .join(', ') || '—'
                  }
                />
                <RecapLine
                  k="Créneau"
                  v={slot ? SLOT_LABEL[slot] : '—'}
                />
                <RecapLine
                  k="Date · heure"
                  v={
                    [scheduledDate, watch('start_time')]
                      .filter(Boolean)
                      .join(' · ') || '—'
                  }
                />
                <RecapLine k="Technicien" v={watch('technician_name') || '—'} />
              </div>

              <label
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 10,
                  cursor: 'pointer',
                  padding: '10px 12px',
                  background: 'var(--wht, #F8F9FB)',
                  border: '1px solid var(--brd, #E1E5EA)',
                  borderRadius: 8,
                  userSelect: 'none',
                }}
              >
                <input
                  type="checkbox"
                  {...register('recurrence_active')}
                  style={{
                    width: 16,
                    height: 16,
                    marginTop: 3,
                    flexShrink: 0,
                    cursor: 'pointer',
                  }}
                />
                <span style={{ fontSize: '.85rem', lineHeight: 1.45 }}>
                  <strong style={{ color: 'var(--ink, #1C2130)' }}>Contrat de maintenance récurrent</strong>
                  <br />
                  <span style={{ color: 'var(--ink2, #5A6070)', fontWeight: 400 }}>
                    À la clôture du rapport, la prochaine visite est créée automatiquement.
                    Décoche pour un one-shot (dépannage, urgence).
                  </span>
                </span>
              </label>
            </>
          )}

          {submitError && <span className="ferr on">{submitError}</span>}

          {/* Footer avec navigation stepper */}
          <div className="modal-foot">
            {isEdit && step === 5 && (
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
            {isEdit && intervention && clientEmail && step === 5 && (
              <button
                type="button"
                className="mf out"
                onClick={() => setRelanceOpen(true)}
                disabled={isSubmitting || isDeleting}
                title="Envoyer un email de confirmation au client"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
              >
                <Bell size={13} strokeWidth={2} />
                Confirmer RDV
              </button>
            )}

            {step > 1 && (
              <button
                type="button"
                className="mf out"
                onClick={goPrev}
                disabled={isSubmitting || isDeleting}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
              >
                <ChevronLeft size={14} strokeWidth={2} />
                Précédent
              </button>
            )}

            <button type="button" className="mf out" onClick={onClose} disabled={isSubmitting || isDeleting}>
              Annuler
            </button>

            {step < STEPS.length && (
              <button
                type="button"
                className="mf prim"
                onClick={goNext}
                disabled={isSubmitting || isDeleting}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
              >
                Suivant
                <ChevronRight size={14} strokeWidth={2} />
              </button>
            )}

            {step === STEPS.length && (
              <button type="submit" className="mf prim" disabled={isSubmitting || isDeleting}>
                {isSubmitting
                  ? (isEdit ? 'Enregistrement…' : 'Création…')
                  : (isEdit ? 'Enregistrer' : "✓ Créer l'intervention")}
              </button>
            )}
          </div>
        </form>
      </div>

      {/* Modal de relance — confirmation de RDV */}
      {isEdit && intervention && (
        <RelanceModal
          open={relanceOpen}
          onClose={() => setRelanceOpen(false)}
          recipientEmail={clientEmail}
          initialType="intervention"
          availableTypes={['intervention', 'general']}
          context={{
            clientName: intervention.client_name,
            contactName: clientContactName,
            reference: intervention.reference,
            scheduledDate: intervention.scheduled_date,
            siteName: intervention.site_name,
            address: intervention.address,
          }}
        />
      )}
    </div>
  )
}

// ─── Récap line ─────────────────────────────────────────────

function RecapLine({ k, v }: { k: string; v: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', fontSize: 13, gap: 12 }}>
      <span style={{ color: 'var(--ink2)' }}>{k}</span>
      <span style={{ color: 'var(--ink)', fontWeight: 500, textAlign: 'right' }}>{v}</span>
    </div>
  )
}

// ─── Styles inline (spécifiques au stepper) ────────────────

const stepperStyle: React.CSSProperties = {
  display: 'flex',
  gap: 4,
  padding: '10px 4px',
  borderBottom: '1px solid var(--brd, #E1E5EA)',
  background: 'var(--wht, #F8F9FB)',
  margin: '0 -1.25rem 0.5rem',
  paddingLeft: '1.25rem',
  paddingRight: '1.25rem',
  overflowX: 'auto',
}

const stepStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 8,
  padding: '6px 10px',
  fontSize: 12.5,
  fontWeight: 500,
  border: 0,
  background: 'transparent',
  color: 'var(--ink3)',
  cursor: 'pointer',
  borderRadius: 8,
  whiteSpace: 'nowrap',
  fontFamily: 'inherit',
}

const stepStateStyle: Record<string, React.CSSProperties> = {
  active: { background: 'var(--acc-lt, #E8EEF8)', color: 'var(--acc, #3A5CA8)', fontWeight: 700 },
  done: { color: 'var(--ok, #0E7A3F)' },
  idle: {},
}

const stepNumStyle: React.CSSProperties = {
  width: 22,
  height: 22,
  borderRadius: '50%',
  display: 'grid',
  placeItems: 'center',
  fontSize: 11,
  fontWeight: 700,
  background: 'var(--brd2, #EEF0F4)',
  color: 'var(--ink3, #8B93A5)',
  fontVariantNumeric: 'tabular-nums',
}

const stepNumStateStyle: Record<string, React.CSSProperties> = {
  active: { background: 'var(--acc, #3A5CA8)', color: '#fff' },
  done: { background: 'var(--ok, #0E7A3F)', color: '#fff' },
  idle: {},
}

const helpBoxStyle: React.CSSProperties = {
  padding: '10px 14px',
  background: 'var(--acc-lt, #E8EEF8)',
  color: 'var(--acc, #3A5CA8)',
  borderRadius: 8,
  fontSize: 12.5,
  lineHeight: 1.5,
}

const emptyBoxStyle: React.CSSProperties = {
  padding: '10px 14px',
  background: 'var(--wht, #F8F9FB)',
  border: '1px dashed var(--brd, #E1E5EA)',
  color: 'var(--ink2, #5A6070)',
  borderRadius: 8,
  fontSize: 12.5,
  lineHeight: 1.5,
}

const slotGridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(4, 1fr)',
  gap: 8,
}

const slotBtnStyle: React.CSSProperties = {
  padding: '12px 8px',
  border: '1.5px solid var(--brd, #E1E5EA)',
  background: 'var(--bg, #fff)',
  borderRadius: 10,
  cursor: 'pointer',
  fontFamily: 'inherit',
  textAlign: 'center',
  transition: 'all .12s',
}

const slotBtnActiveStyle: React.CSSProperties = {
  background: 'var(--acc-lt, #E8EEF8)',
  borderColor: 'var(--acc, #3A5CA8)',
  color: 'var(--acc, #3A5CA8)',
}

const recapBoxStyle: React.CSSProperties = {
  padding: '14px 18px',
  background: 'var(--wht, #F8F9FB)',
  border: '1px solid var(--brd, #E1E5EA)',
  borderRadius: 10,
}

const recapTitleStyle: React.CSSProperties = {
  fontWeight: 700,
  fontSize: 14,
  color: 'var(--ink, #1C2130)',
  marginBottom: 10,
}

import { ExternalLink, Trash2 } from 'lucide-react'
import { useState } from 'react'
import type { FormEvent, MouseEvent } from 'react'
import { createPlanningEvent, deleteBlock, updatePlanningEvent } from '../blocksApi'
import type { PlanningBlock, PlanningBlockColor } from '../blocksApi'
import { EVENT_COLORS, extractLinks, shortTime } from './eventUtils'

type Props = {
  organizationId: string
  /** Événement existant (modification) ou null (création) */
  event: PlanningBlock | null
  /** Date proposée en création */
  defaultDate: string
  onClose: () => void
  onSaved: () => void
}

/**
 * Événement d'agenda libre (visio, rendez-vous, déjeuner…) ajouté via le « + »
 * d'un jour du planning. Privé par défaut : visible uniquement par son auteur.
 * Le formulaire est initialisé au montage : le parent le remonte (key) à chaque ouverture.
 */
export function PlanningEventModal({ organizationId, event, defaultDate, onClose, onSaved }: Props) {
  const isEdit = !!event
  const [label, setLabel] = useState(event?.label ?? '')
  const [date, setDate] = useState(event?.date ?? defaultDate)
  const [allDay, setAllDay] = useState(event ? !event.start_time : false)
  const [start, setStart] = useState(shortTime(event?.start_time ?? null) ?? '09:00')
  const [end, setEnd] = useState(shortTime(event?.end_time ?? null) ?? '10:00')
  const [notes, setNotes] = useState(event?.notes ?? '')
  const [color, setColor] = useState<PlanningBlockColor>(event?.color ?? 'acc')
  const [shared, setShared] = useState(event ? !event.is_private : false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const links = extractLinks(notes)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!label.trim()) return setError('Donne un titre à l\'événement.')
    if (!allDay && end && end <= start) return setError('L\'heure de fin doit être après l\'heure de début.')
    setSaving(true)
    setError(null)
    const input = {
      date,
      label,
      startTime: allDay ? null : start,
      endTime: allDay ? null : end || null,
      color,
      notes,
      isPrivate: !shared,
    }
    try {
      if (event) await updatePlanningEvent(event.id, input)
      else await createPlanningEvent(organizationId, input)
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Enregistrement impossible.')
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!event || !window.confirm(`Supprimer l'événement « ${event.label} » ?`)) return
    setSaving(true)
    try {
      await deleteBlock(event.id)
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Suppression impossible.')
      setSaving(false)
    }
  }

  function handleBackdrop(e: MouseEvent<HTMLDivElement>) {
    if (e.target === e.currentTarget) onClose()
  }

  return (
    <div className="overlay open" onClick={handleBackdrop}>
      <div className="modal" style={{ maxWidth: 480 }}>
        <div className="modal-head">
          <span className="modal-title">{isEdit ? 'Événement' : 'Nouvel événement'}</span>
          <button type="button" className="modal-x" onClick={onClose} aria-label="Fermer">×</button>
        </div>

        <form onSubmit={(e) => void handleSubmit(e)} style={{ display: 'flex', flexDirection: 'column', gap: '.9rem' }}>
          <div className="fg">
            <label>Titre</label>
            <input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Ex : Visio avec HDPI, Déjeuner avec Marc, RDV banque…"
              autoFocus
            />
          </div>

          <div className="mrow">
            <div className="fg">
              <label>Date</label>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-end', paddingBottom: 10 }}>
              <label className="pe-check">
                <input type="checkbox" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} /> Toute la journée
              </label>
            </div>
          </div>

          {!allDay && (
            <div className="mrow">
              <div className="fg">
                <label>Début</label>
                <input type="time" value={start} onChange={(e) => setStart(e.target.value)} required />
              </div>
              <div className="fg">
                <label>Fin</label>
                <input type="time" value={end} onChange={(e) => setEnd(e.target.value)} />
              </div>
            </div>
          )}

          <div className="fg">
            <label>Note</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="Lien de visio, adresse, numéro de téléphone…"
              style={{ resize: 'vertical' }}
            />
            {links.length > 0 && (
              <div className="pe-links">
                {links.map((l) => (
                  <a key={l} href={l} target="_blank" rel="noopener noreferrer">
                    <ExternalLink size={12} /> {l.replace(/^https?:\/\//, '').slice(0, 42)}{l.length > 50 ? '…' : ''}
                  </a>
                ))}
              </div>
            )}
          </div>

          <div className="fg">
            <label>Couleur</label>
            <div className="pe-colors">
              {EVENT_COLORS.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  className={`pe-swatch ${c.value}${color === c.value ? ' on' : ''}`}
                  onClick={() => setColor(c.value)}
                  aria-label={c.label}
                  title={c.label}
                />
              ))}
            </div>
          </div>

          <label className="pe-check">
            <input type="checkbox" checked={shared} onChange={(e) => setShared(e.target.checked)} />
            Visible par toute l'équipe
            <span className="pe-help">{shared ? 'Tous les membres le voient.' : 'Privé : toi seul le vois.'}</span>
          </label>

          {error && <span className="ferr on">{error}</span>}

          <div className="modal-foot">
            {isEdit && (
              <button
                type="button"
                className="mf del"
                onClick={() => void handleDelete()}
                disabled={saving}
                style={{ marginRight: 'auto', display: 'inline-flex', alignItems: 'center', gap: 6 }}
              >
                <Trash2 size={14} strokeWidth={1.8} /> Supprimer
              </button>
            )}
            <button type="button" className="mf out" onClick={onClose} disabled={saving}>Annuler</button>
            <button type="submit" className="mf prim" disabled={saving}>
              {saving ? 'Enregistrement…' : isEdit ? 'Enregistrer' : 'Ajouter'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

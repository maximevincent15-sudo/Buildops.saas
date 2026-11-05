import { CalendarDays, MapPin, Navigation, Pencil, User, Wrench } from 'lucide-react'
import { InterventionAuthors } from './InterventionAuthors'
import { useState } from 'react'
import type { MouseEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { INTERVENTION_STATUSES, STATUS_BADGE_CLASSES, formatEquipmentTypes } from '../../../shared/constants/interventions'
import type { InterventionStatus } from '../../../shared/constants/interventions'
import { interventionAddress } from '../address'
import { setInterventionStatus } from '../api'
import type { Intervention } from '../schemas'

type Props = {
  intervention: Intervention
  onClose: () => void
  /** Ouvre la modification complète (5 étapes) */
  onEdit: () => void
}

function dateLabel(i: Intervention): string {
  if (!i.scheduled_date) return 'Sans date (à planifier)'
  const day = new Date(`${i.scheduled_date}T12:00:00`).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  return i.start_time ? `${day} à ${i.start_time.slice(0, 5).replace(':', 'h')}` : day
}

/**
 * Fiche rapide d'une intervention (téléphone) : l'essentiel pour le
 * technicien et un gros bouton « Démarrer » / « Continuer le rapport ».
 * La modification complète reste accessible en dessous.
 */
export function InterventionSheet({ intervention: i, onClose, onEdit }: Props) {
  const navigate = useNavigate()
  const [starting, setStarting] = useState(false)
  const address = interventionAddress(i)
  const status = (i.status === 'a_planifier' && i.scheduled_date ? 'planifiee' : i.status) as InterventionStatus

  async function start() {
    setStarting(true)
    try {
      await setInterventionStatus(i.id, 'en_cours')
      navigate(`/rapports/${i.id}`)
    } catch {
      setStarting(false)
      alert('Impossible de démarrer. Vérifiez votre connexion et réessayez.')
    }
  }

  function handleBackdrop(e: MouseEvent<HTMLDivElement>) {
    if (e.target === e.currentTarget) onClose()
  }

  const bigBtn = { width: '100%', justifyContent: 'center', display: 'inline-flex', alignItems: 'center', gap: 8, padding: '.95rem 1.4rem', fontSize: '1rem', textAlign: 'center' as const, textDecoration: 'none' }

  return (
    <div className="overlay open" onClick={handleBackdrop}>
      <div className="modal" style={{ maxWidth: 480 }}>
        <div className="modal-head">
          <span className="modal-title" style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            {i.reference}
            <span className={`badge ${STATUS_BADGE_CLASSES[status] ?? 'b-gry'}`}>{INTERVENTION_STATUSES[status] ?? i.status}</span>
          </span>
          <button type="button" className="modal-x" onClick={onClose} aria-label="Fermer">×</button>
        </div>

        <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--ink)' }}>{i.site_name || i.client_name}</div>
        {i.site_name && i.site_name !== i.client_name && (
          <div className="text-ink-2 text-sm">{i.client_name}</div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, margin: '1rem 0 1.3rem', fontSize: 14, color: 'var(--ink2)' }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}><CalendarDays size={15} /> {dateLabel(i)}</div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}><Wrench size={15} /> {formatEquipmentTypes(i.equipment_types)}</div>
          {i.technician_name && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}><User size={15} /> {i.technician_name}</div>
          )}
          {address && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}><MapPin size={15} style={{ flex: '0 0 auto', marginTop: 2 }} /> {address}</div>
          )}
          {i.notes?.trim() && (
            <div className="text-sm" style={{ background: 'var(--bg)', borderRadius: 8, padding: '.6rem .75rem', whiteSpace: 'pre-wrap' }}>{i.notes}</div>
          )}
          <InterventionAuthors intervention={i} />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {status === 'planifiee' && (
            <button type="button" className="mf prim" style={bigBtn} onClick={() => void start()} disabled={starting}>
              {starting ? 'Démarrage…' : 'Démarrer l’intervention'}
            </button>
          )}
          {status === 'en_cours' && (
            <Link to={`/rapports/${i.id}`} className="mf prim" style={bigBtn}>Continuer le rapport</Link>
          )}
          {status === 'terminee' && (
            <Link to={`/rapports/${i.id}`} className="mf prim" style={bigBtn}>Voir le rapport</Link>
          )}
          {status === 'a_planifier' && (
            <button type="button" className="mf prim" style={bigBtn} onClick={onEdit}>Choisir une date</button>
          )}
          {address && status !== 'terminee' && (
            <a
              className="mf out"
              style={bigBtn}
              href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}`}
              target="_blank"
              rel="noreferrer"
            >
              <Navigation size={15} /> Itinéraire
            </a>
          )}
          {status !== 'a_planifier' && (
            <button type="button" className="mf out" style={bigBtn} onClick={onEdit}>
              <Pencil size={14} /> Modifier l’intervention
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

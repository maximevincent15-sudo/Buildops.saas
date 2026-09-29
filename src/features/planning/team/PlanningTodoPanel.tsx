import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ANOMALY_ACTION_LABELS } from '../../anomalies/schemas'
import type { Anomaly } from '../../anomalies/schemas'
import type { Technician } from '../../technicians/schemas'
import type { Intervention } from '../schemas'
import { EQUIPMENT_TAGS, formatDueShort, placeLabel, siteLabel } from './teamUtils'
import type { TodoItem } from './teamUtils'

export type PanelTab = 'todo' | 'follow' | 'norep'
export type FollowItem = { intervention: Intervention; anomalies: Anomaly[] }

type Props = {
  tab: PanelTab
  onTabChange: (t: PanelTab) => void
  todos: TodoItem[]
  follows: FollowItem[]
  noReports: Intervention[]
  technicians: Technician[]
  busyId: string | null
  onOpen: (i: Intervention) => void
  onCreateQuote: (f: FollowItem) => void
  onScheduleRevisit: (f: FollowItem) => void
}

type TodoFilter = 'all' | 'late' | 'urgent'

function formatDate(iso: string | null): string {
  return iso ? formatDueShort(iso) : '—'
}

export function PlanningTodoPanel({
  tab,
  onTabChange,
  todos,
  follows,
  noReports,
  technicians,
  busyId,
  onOpen,
  onCreateQuote,
  onScheduleRevisit,
}: Props) {
  const [filter, setFilter] = useState<TodoFilter>('all')
  const visibleTodos = todos.filter((t) => filter === 'all' || (filter === 'late' && t.late) || (filter === 'urgent' && t.urgent))

  function technicianEmail(i: Intervention): string | null {
    const t = technicians.find((x) => x.id === i.technician_id)
      ?? technicians.find((x) => `${x.first_name} ${x.last_name}`.trim().toLowerCase() === i.technician_name?.trim().toLowerCase())
    return t?.email ?? null
  }

  return (
    <aside className="pt-panel">
      <div className="pt-tabs">
        <button type="button" className={`pt-tab${tab === 'todo' ? ' on' : ''}`} onClick={() => onTabChange('todo')}>
          À planifier <span className="pt-count">{todos.length}</span>
        </button>
        <button type="button" className={`pt-tab${tab === 'follow' ? ' on' : ''}`} onClick={() => onTabChange('follow')}>
          Suites <span className="pt-count">{follows.length}</span>
        </button>
        <button type="button" className={`pt-tab${tab === 'norep' ? ' on' : ''}`} onClick={() => onTabChange('norep')}>
          Sans rapport <span className="pt-count">{noReports.length}</span>
        </button>
      </div>

      {tab === 'todo' && (
        <>
          <div className="pt-filters">
            {([['all', 'Tout'], ['late', 'En retard'], ['urgent', 'Urgent']] as const).map(([k, l]) => (
              <button key={k} type="button" className={filter === k ? 'on' : ''} onClick={() => setFilter(k)}>{l}</button>
            ))}
          </div>
          <div className="pt-body">
            <p className="pt-hint">Glisse une carte sur un technicien et un jour pour la planifier, ou clique pour l'ouvrir.</p>
            {visibleTodos.length === 0 && <p className="pt-hint">🎉 Rien à planifier ici.</p>}
            {visibleTodos.map(({ intervention: i, due, late, urgent }) => {
              const place = placeLabel(i)
              return (
                <div
                  key={i.id}
                  className="pt-todo"
                  draggable
                  onDragStart={(e) => { e.dataTransfer.setData('text/plain', i.id); e.dataTransfer.effectAllowed = 'move' }}
                  onClick={() => onOpen(i)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => { if (e.key === 'Enter') onOpen(i) }}
                >
                  <div className="pt-todo-head">
                    <div style={{ minWidth: 0 }}>
                      <div className="pt-todo-name">{siteLabel(i)}</div>
                      <div className="pt-todo-sub">{[i.site_name ? i.client_name : null, place].filter(Boolean).join(' · ') || i.reference}</div>
                    </div>
                    <span className="pt-grip" aria-hidden>⋮⋮</span>
                  </div>
                  {i.notes && <div className="pt-todo-desc">{i.notes.split('\n')[0]}</div>}
                  <div className="pt-meta">
                    {late && due && <span className="pt-pill late">Échéance dépassée — {formatDate(due)}</span>}
                    {!late && due && <span className="pt-pill">Échéance {formatDate(due)}</span>}
                    {urgent && <span className="pt-pill urg">Urgent</span>}
                    {i.auto_generated && <span className="pt-pill auto">Générée par le contrat</span>}
                    {i.duration_minutes && <span className="pt-pill">≈ {Math.round((i.duration_minutes / 60) * 10) / 10} h</span>}
                  </div>
                  {i.equipment_types.length > 0 && (
                    <div className="pt-tags" style={{ marginTop: 6 }}>
                      {i.equipment_types.map((t) => (
                        <span key={t} className={`pt-tag ${EQUIPMENT_TAGS[t]?.cls ?? ''}`}>{EQUIPMENT_TAGS[t]?.label ?? t}</span>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </>
      )}

      {tab === 'follow' && (
        <div className="pt-body">
          <p className="pt-hint">Interventions terminées avec des anomalies encore ouvertes : décide de la suite.</p>
          {follows.length === 0 && <p className="pt-hint">🎉 Aucune suite en attente.</p>}
          {follows.map((f) => (
            <div key={f.intervention.id} className="pt-todo static">
              <div className="pt-todo-name">{siteLabel(f.intervention)}</div>
              <div className="pt-todo-sub">
                {f.intervention.reference} · {formatDate(f.intervention.scheduled_date)}
                {f.intervention.technician_name ? ` · ${f.intervention.technician_name}` : ''}
              </div>
              <ul className="pt-anoms">
                {f.anomalies.slice(0, 4).map((a) => (
                  <li key={a.id}>
                    {a.title}
                    {a.action ? ` — ${ANOMALY_ACTION_LABELS[a.action]}` : ''}
                    {a.priority === 'high' && <span className="pt-pill late" style={{ marginLeft: 6 }}>Haute</span>}
                  </li>
                ))}
                {f.anomalies.length > 4 && <li>… et {f.anomalies.length - 4} autre(s)</li>}
              </ul>
              <div className="pt-acts">
                <button type="button" className="pri" disabled={busyId === f.intervention.id} onClick={() => onCreateQuote(f)}>Créer le devis</button>
                <button type="button" disabled={busyId === f.intervention.id} onClick={() => onScheduleRevisit(f)}>
                  {busyId === f.intervention.id ? 'Création…' : 'Programmer une repasse'}
                </button>
                <button type="button" onClick={() => onOpen(f.intervention)}>Ouvrir</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === 'norep' && (
        <div className="pt-body">
          <p className="pt-hint">Date passée, mais le rapport n'a pas été finalisé.</p>
          {noReports.length === 0 && <p className="pt-hint">🎉 Tous les rapports sont à jour.</p>}
          {noReports.map((i) => {
            const email = technicianEmail(i)
            const subject = `Rapport à compléter — ${siteLabel(i)} (${formatDate(i.scheduled_date)})`
            const body = `Bonjour,\n\nLe rapport de l'intervention ${i.reference} chez ${i.client_name}${i.site_name ? ` (${i.site_name})` : ''}, prévue le ${formatDate(i.scheduled_date)}, n'a pas encore été finalisé dans Firovia.\n\nPeux-tu le compléter dès que possible ?\n\nMerci !`
            return (
              <div key={i.id} className="pt-todo static">
                <div className="pt-todo-name">{siteLabel(i)}</div>
                <div className="pt-todo-sub">
                  Prévue le {formatDate(i.scheduled_date)}{i.technician_name ? ` · ${i.technician_name}` : ''}
                </div>
                <div className="pt-acts">
                  <Link className="pri" to={`/rapports/${i.id}`}>Ouvrir le rapport</Link>
                  {email ? (
                    <a href={`mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`}>Relancer le technicien</a>
                  ) : (
                    <button type="button" disabled title="Ajoute l'email du technicien dans sa fiche pour pouvoir le relancer">Relancer le technicien</button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </aside>
  )
}

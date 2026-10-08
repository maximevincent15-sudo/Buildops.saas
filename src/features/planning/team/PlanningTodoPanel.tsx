import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ANOMALY_ACTION_LABELS } from '../../anomalies/schemas'
import type { Anomaly } from '../../anomalies/schemas'
import type { Technician } from '../../technicians/schemas'
import type { Intervention } from '../schemas'
import { EQUIPMENT_TAGS, cityKey, cityOf, formatDueShort, siteLabel } from './teamUtils'
import type { TodoItem } from './teamUtils'

const BY_CITY_KEY = 'firovia.planning.todoByCity'

type CityGroup = { key: string; label: string; items: TodoItem[] }

/** Regroupe les visites par ville : les villes avec le plus de visites d'abord, « Ville non renseignée » en dernier */
function groupByCity(items: TodoItem[]): CityGroup[] {
  const groups = new Map<string, CityGroup>()
  for (const t of items) {
    const city = cityOf(t.intervention)
    const key = city ? cityKey(city) : ''
    const label = city ? (city.postalCode ? `${city.name} (${city.postalCode.slice(0, 2)})` : city.name) : 'Ville non renseignée'
    const g = groups.get(key) ?? { key, label, items: [] }
    g.items.push(t)
    groups.set(key, g)
  }
  return [...groups.values()].sort((a, b) => {
    if (!a.key !== !b.key) return a.key ? -1 : 1
    if (a.items.length !== b.items.length) return b.items.length - a.items.length
    return a.label.localeCompare(b.label, 'fr')
  })
}

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
  // Regroupement par ville : voir d'un coup d'œil les visites proches pour les confier au même technicien
  const [byCity, setByCity] = useState<boolean>(() => {
    try { return localStorage.getItem(BY_CITY_KEY) === '1' } catch { return false }
  })
  function toggleByCity() {
    setByCity((v) => {
      try { localStorage.setItem(BY_CITY_KEY, v ? '0' : '1') } catch { /* stockage indisponible */ }
      return !v
    })
  }
  const groups: CityGroup[] = byCity
    ? groupByCity(visibleTodos)
    : [{ key: 'all', label: '', items: visibleTodos }]

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
            <button
              type="button"
              className={`pt-bycity${byCity ? ' on' : ''}`}
              onClick={toggleByCity}
              aria-pressed={byCity}
              title="Regrouper les visites par ville pour les confier au même technicien"
            >
              Par ville
            </button>
          </div>
          <div className="pt-body">
            <p className="pt-hint">
              {byCity
                ? 'Visites regroupées par ville : glisse celles d\'une même ville sur le même technicien et le même jour.'
                : 'Glisse une carte sur un technicien et un jour pour la planifier, ou clique pour l\'ouvrir.'}
            </p>
            {visibleTodos.length === 0 && <p className="pt-hint">🎉 Rien à planifier ici.</p>}
            {groups.map((g) => (
              <div key={g.key}>
                {byCity && (
                  <div className="pt-city">
                    <span>{g.label}</span>
                    <span className="pt-count">{g.items.length} visite{g.items.length > 1 ? 's' : ''}</span>
                  </div>
                )}
                {g.items.map(({ intervention: i, due, late, urgent }) => {
                  const place = cityOf(i)?.name ?? null
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
            ))}
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

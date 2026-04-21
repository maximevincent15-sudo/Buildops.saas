import { useEffect, useState } from 'react'
import { listInterventions } from '../../planning/api'
import type { Intervention } from '../../planning/schemas'

type TechSummary = {
  name: string
  done: number
  total: number
  recentClients: string[]
}

function groupByTechnician(interventions: Intervention[]): TechSummary[] {
  const map = new Map<string, TechSummary>()
  for (const i of interventions) {
    const name = i.technician_name?.trim()
    if (!name) continue
    const existing = map.get(name) ?? { name, done: 0, total: 0, recentClients: [] }
    existing.total += 1
    if (i.status === 'terminee') existing.done += 1
    if (existing.recentClients.length < 2 && !existing.recentClients.includes(i.client_name)) {
      existing.recentClients.push(i.client_name)
    }
    map.set(name, existing)
  }
  return Array.from(map.values()).sort((a, b) => b.total - a.total).slice(0, 5)
}

export function TechsOfDay() {
  const [techs, setTechs] = useState<TechSummary[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    listInterventions()
      .then((data) => { if (alive) setTechs(groupByTechnician(data)) })
      .catch(() => { /* silently */ })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [])

  return (
    <div className="card">
      <div className="card-top">
        <span className="card-title">Techniciens</span>
        <span className="card-lnk">Voir tout</span>
      </div>

      {loading && (
        <p className="text-ink-2 text-sm font-light" style={{ padding: '.5rem 0' }}>Chargement…</p>
      )}

      {!loading && techs.length === 0 && (
        <p className="text-ink-2 text-sm font-light" style={{ padding: '.5rem 0' }}>
          Aucun technicien assigné pour le moment. Ajoute un nom de technicien
          dans tes interventions pour voir leur charge ici.
        </p>
      )}

      {!loading && techs.map((t) => {
        const pct = t.total > 0 ? Math.max(10, (t.done / t.total) * 100) : 10
        const meta = t.recentClients.length > 0 ? t.recentClients.join(' · ') : '—'
        return (
          <div key={t.name} className="ch-item">
            <div className="ch-top">
              <span className="ch-name">{t.name}</span>
              <span className="ch-pct">{t.done}/{t.total}</span>
            </div>
            <div className="prog">
              <div className="prog-fill" style={{ width: `${pct}%` }} />
            </div>
            <div className="ch-meta">{meta}</div>
          </div>
        )
      })}
    </div>
  )
}

import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
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

/**
 * TechsOfDay v2 — Direction B (Mercury-vibe).
 *
 * « Disponibilité équipe » du mockup :
 * - Status dot (orange = saturé / bleu = moyen / vert = disponible)
 * - Nom + nb interventions
 * - Barre de charge (largeur = % de l'équipe le plus chargé)
 * - Pourcentage à droite avec couleur cohérente
 */
export function TechsOfDay() {
  const [techs, setTechs] = useState<TechSummary[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    listInterventions()
      .then((data) => { if (alive) setTechs(groupByTechnician(data)) })
      .catch(() => { /* silent */ })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [])

  // La barre est relative à la charge max pour un effet de comparaison
  const maxTotal = techs.reduce((m, t) => Math.max(m, t.total), 0)

  return (
    <div className="b-card">
      <div className="b-section-head" style={{ marginBottom: 8 }}>
        <div>
          <div className="b-section-h" style={{ fontSize: 15 }}>Disponibilité équipe</div>
          <div className="b-section-s" style={{ fontSize: 12 }}>Aujourd'hui · charge du planning</div>
        </div>
        <Link to="/techniciens" className="b-section-link">Voir tout →</Link>
      </div>

      {loading && (
        <p style={{ padding: '12px 0', fontSize: 13, color: 'var(--ink2)' }}>Chargement…</p>
      )}

      {!loading && techs.length === 0 && (
        <p style={{ padding: '12px 0', fontSize: 13, color: 'var(--ink2)' }}>
          Aucun technicien assigné pour le moment. Ajoute un nom de technicien
          dans tes interventions pour voir leur charge ici.
        </p>
      )}

      {!loading && techs.length > 0 && (
        <div className="b-list">
          {techs.map((t) => {
            const pct = maxTotal > 0 ? Math.round((t.total / maxTotal) * 100) : 0
            // Status :
            //  busy (orange) si chargé >= 80% du leader
            //  med (bleu) si entre 30% et 80%
            //  free (vert) si <30%
            const status: 'busy' | 'med' | 'free' =
              pct >= 80 ? 'busy' : pct >= 30 ? 'med' : 'free'
            const barBg = status === 'busy' ? '#F59E0B' : status === 'med' ? 'var(--acc)' : 'var(--grn)'
            const pctColor = status === 'busy' ? '#92400E' : status === 'med' ? 'var(--acc)' : 'var(--grn)'
            return (
              <div key={t.name} className="b-list-item">
                <div className={`b-tech-status ${status}`}></div>
                <div className="b-tech-info">
                  <div className="b-tech-n">{t.name}</div>
                  <div className="b-tech-r">
                    {t.total} intervention{t.total > 1 ? 's' : ''}
                    {t.done > 0 && ` · ${t.done} terminée${t.done > 1 ? 's' : ''}`}
                  </div>
                </div>
                <div className="b-tech-bar">
                  <i style={{ background: barBg, width: `${pct}%` }} />
                </div>
                <div className="b-lb-val" style={{ fontSize: 13, color: pctColor, minWidth: 36, textAlign: 'right' }}>
                  {pct}%
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

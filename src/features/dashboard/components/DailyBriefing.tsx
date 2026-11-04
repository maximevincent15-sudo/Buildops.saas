import { isToday } from 'date-fns'
import { Sparkles } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { listAnomalies } from '../../anomalies/api'
import { formatBlockTime, listBlocksForRange } from '../../planning/blocksApi'
import type { PlanningBlock } from '../../planning/blocksApi'
import { listInterventions } from '../../planning/api'

type BriefCounts = {
  todayCount: number
  toFinalize: number
  toPlan: number
  /** Anomalies ouvertes (ni planifiées, ni résolues) */
  openAnomalies: number
  /** Visites terminées qui ont encore une anomalie ouverte : « Suite à décider » */
  toDecide: number
}

function computeCounts(
  interventions: { id: string; status: string; scheduled_date: string | null }[],
  anomalies: { intervention_id: string | null }[],
): BriefCounts {
  let todayCount = 0
  let toFinalize = 0
  let toPlan = 0
  const withAnomaly = new Set(anomalies.map((a) => a.intervention_id).filter(Boolean))
  const toDecide = interventions.filter((i) => i.status === 'terminee' && withAnomaly.has(i.id)).length
  for (const i of interventions) {
    if (i.status === 'a_planifier') toPlan += 1
    if (i.status === 'en_cours') toFinalize += 1
    if (
      i.scheduled_date &&
      (i.status === 'planifiee' || i.status === 'en_cours') &&
      isToday(new Date(i.scheduled_date))
    ) {
      todayCount += 1
    }
  }
  return { todayCount, toFinalize, toPlan, openAnomalies: anomalies.length, toDecide }
}

function plural(n: number, singular: string, pluralForm: string) {
  return n > 1 ? pluralForm : singular
}

function buildMessage(c: BriefCounts): { title: string; text: React.ReactNode } {
  const parts: string[] = []
  if (c.todayCount > 0) {
    parts.push(`**${c.todayCount}** ${plural(c.todayCount, 'intervention prévue', 'interventions prévues')} aujourd'hui`)
  }
  if (c.toFinalize > 0) {
    parts.push(`**${c.toFinalize}** ${plural(c.toFinalize, 'rapport à finaliser', 'rapports à finaliser')}`)
  }
  if (c.toPlan > 0) {
    parts.push(`**${c.toPlan}** ${plural(c.toPlan, 'intervention à planifier', 'interventions à planifier')}`)
  }
  if (c.toDecide > 0) {
    parts.push(`**${c.toDecide}** ${plural(c.toDecide, 'visite terminée avec une suite à décider', 'visites terminées avec une suite à décider')}`)
  } else if (c.openAnomalies > 0) {
    parts.push(`**${c.openAnomalies}** ${plural(c.openAnomalies, 'anomalie ouverte', 'anomalies ouvertes')}`)
  }

  if (parts.length === 0) {
    return {
      title: 'Journée tranquille',
      text: (
        <>
          Rien d'urgent aujourd'hui. Profites-en pour planifier tes prochaines interventions ou relancer les clients qui arrivent à échéance.
        </>
      ),
    }
  }

  return {
    title: 'Briefing du jour',
    text: <>Tu as {renderParts(parts)}.</>,
  }
}

function renderParts(parts: string[]): React.ReactNode {
  const joined = parts.length === 1
    ? parts[0]!
    : parts.length === 2
    ? `${parts[0]} et ${parts[1]}`
    : `${parts.slice(0, -1).join(', ')} et ${parts.at(-1)}`

  const tokens = joined.split('**')
  return tokens.map((t, i) => (i % 2 === 1 ? <strong key={i}>{t}</strong> : <span key={i}>{t}</span>))
}

function renderBlocksLine(blocks: PlanningBlock[]): React.ReactNode {
  if (blocks.length === 0) return null
  const items = blocks.map((b) => {
    const time = formatBlockTime(b.start_time, b.end_time)
    return time ? `${b.label} (${time})` : b.label
  })
  return (
    <div style={{ marginTop: 8 }}>
      <strong>Créneaux : </strong>{items.join(' · ')}
    </div>
  )
}

/**
 * DailyBriefing v2 — Dark card (point focal du dashboard B).
 *
 * Style « Mercury briefing » : card sombre charcoal avec icône en cartouche,
 * titre Syne + description en typo body. Aucun gradient inutile, focus sur
 * la lisibilité immédiate des chiffres importants du jour.
 */
export function DailyBriefing() {
  const [counts, setCounts] = useState<BriefCounts | null>(null)
  const [todayBlocks, setTodayBlocks] = useState<PlanningBlock[]>([])

  useEffect(() => {
    let alive = true
    const today = new Date()
    const year = today.getFullYear()
    const month = String(today.getMonth() + 1).padStart(2, '0')
    const day = String(today.getDate()).padStart(2, '0')
    const iso = `${year}-${month}-${day}`

    Promise.all([listInterventions(), listBlocksForRange(iso, iso), listAnomalies({ status: 'open' }).catch(() => [])])
      .then(([interventions, blocks, anomalies]) => {
        if (!alive) return
        setCounts(computeCounts(interventions, anomalies))
        setTodayBlocks(blocks)
      })
      .catch(() => { /* silencieux */ })
    return () => { alive = false }
  }, [])

  if (!counts) return null

  const { title, text } = buildMessage(counts)

  return (
    <div className="b-briefing">
      <div className="b-briefing-ico">
        <Sparkles size={20} strokeWidth={1.8} />
      </div>
      <div>
        <div className="b-briefing-t">{title}</div>
        <div className="b-briefing-d">
          {text}
          {(counts.toDecide > 0 || counts.openAnomalies > 0) && (
            <>
              {' '}
              <Link
                to={counts.toDecide > 0 ? '/planning' : '/anomalies'}
                style={{ color: 'inherit', textDecoration: 'underline', whiteSpace: 'nowrap' }}
              >
                {counts.toDecide > 0 ? 'Décider la suite' : 'Voir les anomalies'} →
              </Link>
            </>
          )}
          {renderBlocksLine(todayBlocks)}
        </div>
      </div>
    </div>
  )
}

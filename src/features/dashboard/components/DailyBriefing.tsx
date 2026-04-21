import { isToday } from 'date-fns'
import { Sparkles } from 'lucide-react'
import { useEffect, useState } from 'react'
import { listInterventions } from '../../planning/api'

type BriefCounts = {
  todayCount: number
  toFinalize: number
  toPlan: number
}

function computeCounts(interventions: { status: string; scheduled_date: string | null }[]): BriefCounts {
  let todayCount = 0
  let toFinalize = 0
  let toPlan = 0
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
  return { todayCount, toFinalize, toPlan }
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
    title: 'Ta journée',
    text: <>Tu as {renderParts(parts)}.</>,
  }
}

function renderParts(parts: string[]): React.ReactNode {
  // Chaque part peut contenir **X** qu'on remplace par <strong>X</strong>
  const joined = parts.length === 1
    ? parts[0]!
    : parts.length === 2
    ? `${parts[0]} et ${parts[1]}`
    : `${parts.slice(0, -1).join(', ')} et ${parts.at(-1)}`

  // Split sur les ** pour créer <strong>
  const tokens = joined.split('**')
  return tokens.map((t, i) => (i % 2 === 1 ? <strong key={i}>{t}</strong> : <span key={i}>{t}</span>))
}

export function DailyBriefing() {
  const [counts, setCounts] = useState<BriefCounts | null>(null)

  useEffect(() => {
    let alive = true
    listInterventions()
      .then((all) => {
        if (alive) setCounts(computeCounts(all))
      })
      .catch(() => { /* silencieux */ })
    return () => { alive = false }
  }, [])

  if (!counts) return null

  const { title, text } = buildMessage(counts)

  return (
    <div className="briefing">
      <div className="briefing-icon">
        <Sparkles size={16} strokeWidth={2} />
      </div>
      <div className="briefing-body">
        <div className="briefing-title">{title}</div>
        <div className="briefing-text">{text}</div>
      </div>
    </div>
  )
}

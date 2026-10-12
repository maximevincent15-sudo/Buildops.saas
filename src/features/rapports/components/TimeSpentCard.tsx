import { Clock } from 'lucide-react'
import { useEffect, useState } from 'react'
import { supabase } from '../../../shared/lib/supabase'

type Props = {
  interventionId: string
  siteId: string | null
  /** Arrivée sur place (bouton Démarrer) */
  startedAt: string | null
  /** Finalisation du rapport */
  completedAt: string | null
  /** Durée prévue au planning */
  plannedMinutes: number | null
  /** Heures des contrôles équipement par équipement */
  checkTimes: string[]
}

const MAX_PLAUSIBLE_MIN = 12 * 60

function minutesBetween(from: string, to: string): number {
  return (new Date(to).getTime() - new Date(from).getTime()) / 60000
}

function formatMinutes(min: number): string {
  const m = Math.max(0, Math.round(min))
  if (m < 60) return `${m} min`
  const h = Math.floor(m / 60)
  const rest = m % 60
  return rest ? `${h} h ${String(rest).padStart(2, '0')}` : `${h} h`
}

function formatPerUnit(min: number): string {
  return min < 1
    ? `${Math.max(1, Math.round(min * 60))} s`
    : `${(Math.round(min * 10) / 10).toLocaleString('fr-FR')} min`
}

function clock(iso: string): string {
  return new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
}

/**
 * Temps réellement passé sur l'intervention, pour le gérant : temps sur place
 * (arrivée → finalisation) et temps de contrôle (premier → dernier équipement),
 * comparés à la durée prévue et à la moyenne des visites passées sur le site.
 * Sert à caler les durées du planning et la main-d'œuvre des devis.
 */
export function TimeSpentCard({ interventionId, siteId, startedAt, completedAt, plannedMinutes, checkTimes }: Props) {
  const [siteAverage, setSiteAverage] = useState<{ minutes: number; visits: number } | null>(null)

  useEffect(() => {
    if (!siteId) return
    let alive = true
    void (async () => {
      const { data } = await supabase
        .from('interventions')
        .select('id, started_at, reports(completed_at)')
        .eq('site_id', siteId)
        .eq('status', 'terminee')
        .not('started_at', 'is', null)
        .neq('id', interventionId)
        .order('scheduled_date', { ascending: false })
        .limit(5)
      if (!alive || !data) return
      const durations: number[] = []
      for (const row of data as Array<{ started_at: string; reports: Array<{ completed_at: string | null }> | { completed_at: string | null } | null }>) {
        const rep = Array.isArray(row.reports) ? row.reports[0] : row.reports
        if (!rep?.completed_at) continue
        const d = minutesBetween(row.started_at, rep.completed_at)
        if (d >= 5 && d <= MAX_PLAUSIBLE_MIN) durations.push(d)
      }
      if (durations.length > 0) {
        setSiteAverage({ minutes: durations.reduce((s, d) => s + d, 0) / durations.length, visits: durations.length })
      }
    })()
    return () => { alive = false }
  }, [siteId, interventionId])

  const sorted = [...checkTimes].sort()
  const firstCheck = sorted[0] ?? null
  const lastCheck = sorted[sorted.length - 1] ?? null
  const start = startedAt ?? firstCheck
  const end = completedAt ?? (start ? new Date().toISOString() : null)
  const onSite = start && end ? minutesBetween(start, end) : null
  const controls = firstCheck && lastCheck && sorted.length > 1 ? minutesBetween(firstCheck, lastCheck) : null
  const perUnit = controls !== null && sorted.length > 1 ? controls / sorted.length : null

  if (!start && sorted.length === 0) return null

  return (
    <div className="card" style={{ marginBottom: '1rem' }}>
      <div className="card-top">
        <span className="card-title" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <Clock size={14} strokeWidth={2} /> Temps passé
        </span>
        <span className="text-ink-3 text-xs font-light">Visible par les administrateurs uniquement</span>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1.4rem', fontSize: '.85rem', marginTop: '.3rem' }}>
        <div>
          <div className="text-ink-3 text-xs">Sur place</div>
          <strong>{onSite !== null && onSite <= MAX_PLAUSIBLE_MIN ? formatMinutes(onSite) : '—'}</strong>
          {plannedMinutes ? <span className="text-ink-3 text-xs"> · prévu {formatMinutes(plannedMinutes)}</span> : null}
          {!completedAt && onSite !== null && <span className="text-ink-3 text-xs"> · en cours</span>}
        </div>
        <div>
          <div className="text-ink-3 text-xs">Contrôles des équipements</div>
          <strong>{controls !== null ? formatMinutes(controls) : '—'}</strong>
          {sorted.length > 0 && (
            <span className="text-ink-3 text-xs">
              {' '}· {sorted.length} équipement{sorted.length > 1 ? 's' : ''}
              {perUnit !== null ? ` · ≈ ${formatPerUnit(perUnit)} par équipement` : ''}
            </span>
          )}
        </div>
        {siteAverage && (
          <div>
            <div className="text-ink-3 text-xs">Moyenne sur ce site</div>
            <strong>{formatMinutes(siteAverage.minutes)}</strong>
            <span className="text-ink-3 text-xs"> · {siteAverage.visits} visite{siteAverage.visits > 1 ? 's' : ''}</span>
          </div>
        )}
      </div>

      <div className="text-ink-3 text-xs" style={{ marginTop: '.5rem' }}>
        {startedAt ? `Arrivée ${clock(startedAt)}` : 'Arrivée non enregistrée (bouton « Démarrer » non utilisé)'}
        {firstCheck ? ` · 1er contrôle ${clock(firstCheck)}` : ''}
        {lastCheck && sorted.length > 1 ? ` · dernier contrôle ${clock(lastCheck)}` : ''}
        {completedAt ? ` · finalisé ${clock(completedAt)}` : ''}
      </div>
    </div>
  )
}

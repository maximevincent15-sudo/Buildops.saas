import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { useAuthStore } from '../../auth/store'
import { useModuleEnabled } from '../../parametres/modules'
import { fetchRecentActivity } from '../activityApi'
import type { ActivityEvent } from '../activityApi'

function timeLabel(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  const hm = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
  const day = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime()
  const diff = Math.round((day(now) - day(d)) / 86_400_000)
  if (diff === 0) return `Aujourd'hui · ${hm}`
  if (diff === 1) return `Hier · ${hm}`
  return `${d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })} · ${hm}`
}

function eventText(e: ActivityEvent): ReactNode {
  const who = e.actor ? <strong>{e.actor}</strong> : null
  const detail = e.detail ? <> · {e.detail}</> : null
  switch (e.kind) {
    case 'started':
      return <>{who ?? 'Un technicien'} a démarré l'intervention <strong>{e.subject}</strong></>
    case 'report':
      return <>{who ?? 'Un technicien'} a terminé le rapport <strong>{e.subject}</strong>{detail}</>
    case 'anomaly':
      return <>Anomalie relevée : <strong>{e.subject}</strong>{detail}{e.actor ? <> (par {e.actor})</> : null}</>
    case 'quote_sent':
      return <>Devis <strong>{e.subject}</strong> envoyé{detail}</>
    case 'quote_signed':
      return <>Devis <strong>{e.subject}</strong> signé sur place{e.actor ? <> par {e.actor}</> : null}{detail}</>
    case 'quote_accepted':
      return <>Devis <strong>{e.subject}</strong> accepté{detail}</>
    case 'invoice_sent':
      return <>Facture <strong>{e.subject}</strong> envoyée{detail}</>
    case 'invoice_paid':
      return <>Facture <strong>{e.subject}</strong> payée{detail}</>
    case 'client':
      return <>Nouveau client : <strong>{e.subject}</strong></>
  }
}

/**
 * Activité récente réelle : interventions démarrées, rapports terminés,
 * anomalies, devis et factures (bureau), nouveaux clients.
 */
export function ActivityFeed() {
  const profile = useAuthStore((s) => s.profile)
  const enabled = useModuleEnabled()
  const isAdmin = (profile?.user_role ?? 'admin') === 'admin'
  const quotes = isAdmin && enabled('devis')
  const invoices = isAdmin && enabled('factures')
  const [events, setEvents] = useState<ActivityEvent[] | null>(null)

  useEffect(() => {
    let alive = true
    fetchRecentActivity({ quotes, invoices })
      .then((list) => { if (alive) setEvents(list) })
      .catch(() => { if (alive) setEvents([]) })
    return () => { alive = false }
  }, [quotes, invoices])

  return (
    <div className="b-card">
      <div className="b-section-head" style={{ marginBottom: 14 }}>
        <div>
          <div className="b-section-h" style={{ fontSize: 15 }}>Activité récente</div>
          <div className="b-section-s" style={{ fontSize: 12 }}>Derniers événements</div>
        </div>
      </div>
      {events === null ? (
        <p className="text-ink-3 text-sm font-light" style={{ margin: 0 }}>Chargement…</p>
      ) : events.length === 0 ? (
        <p className="text-ink-3 text-sm font-light" style={{ margin: 0 }}>
          Rien pour l'instant : les interventions, rapports, devis et factures apparaîtront ici.
        </p>
      ) : (
        <div className="b-tl">
          {events.map((e, i) => (
            <div key={`${e.kind}-${e.at}-${i}`} className="b-tl-item">
              <div className="b-tl-time">{timeLabel(e.at)}</div>
              <div className="b-tl-txt">{eventText(e)}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

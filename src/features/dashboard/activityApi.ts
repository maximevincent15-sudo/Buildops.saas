import { supabase } from '../../shared/lib/supabase'

/** Un événement réel de l'activité de l'entreprise (tableau de bord) */
export type ActivityEvent = {
  at: string
  kind: 'started' | 'report' | 'anomaly' | 'quote_sent' | 'quote_signed' | 'quote_accepted' | 'invoice_sent' | 'invoice_paid' | 'client'
  actor?: string | null
  subject: string
  detail?: string | null
}

const PER_SOURCE = 8

type Row = Record<string, unknown>
const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null)
const num = (v: unknown) => (v == null ? null : Number(v))

/**
 * Derniers événements (interventions démarrées, rapports terminés, anomalies,
 * devis, factures, nouveaux clients), toutes sources confondues, du plus
 * récent au plus ancien. Une source en erreur est ignorée.
 */
export async function fetchRecentActivity(opts: { quotes: boolean; invoices: boolean }, limit = 6): Promise<ActivityEvent[]> {
  const sources: Promise<ActivityEvent[]>[] = [
    // Interventions démarrées
    (async () => {
      const { data } = await supabase
        .from('interventions')
        .select('reference, client_name, site_name, technician_name, started_at')
        .not('started_at', 'is', null)
        .order('started_at', { ascending: false })
        .limit(PER_SOURCE)
      return ((data ?? []) as Row[]).map((r) => ({
        at: String(r.started_at), kind: 'started' as const, actor: str(r.technician_name),
        subject: str(r.site_name) ?? str(r.client_name) ?? String(r.reference ?? ''),
      }))
    })(),
    // Rapports terminés
    (async () => {
      const { data } = await supabase
        .from('reports')
        .select('completed_at, is_conform, anomaly_count, signed_by_name, intervention:interventions(reference, client_name, site_name, technician_name)')
        .not('completed_at', 'is', null)
        .order('completed_at', { ascending: false })
        .limit(PER_SOURCE)
      return ((data ?? []) as Row[]).map((r) => {
        const i = (r.intervention ?? {}) as Row
        const anomalies = num(r.anomaly_count) ?? 0
        return {
          at: String(r.completed_at), kind: 'report' as const, actor: str(i.technician_name),
          subject: str(i.site_name) ?? str(i.client_name) ?? String(i.reference ?? ''),
          detail: anomalies > 0 ? `${anomalies} anomalie${anomalies > 1 ? 's' : ''}` : r.is_conform === false ? 'non conforme' : 'conforme',
        }
      })
    })(),
    // Anomalies relevées
    (async () => {
      const { data } = await supabase
        .from('anomalies')
        .select('title, detected_at, detected_by_name, intervention:interventions(client_name, site_name)')
        .order('detected_at', { ascending: false })
        .limit(PER_SOURCE)
      return ((data ?? []) as Row[]).map((r) => {
        const i = (r.intervention ?? {}) as Row
        return {
          at: String(r.detected_at), kind: 'anomaly' as const, actor: str(r.detected_by_name),
          subject: str(r.title) ?? 'Anomalie', detail: str(i.site_name) ?? str(i.client_name),
        }
      })
    })(),
    // Nouveaux clients
    (async () => {
      const { data } = await supabase
        .from('clients')
        .select('name, created_at')
        .order('created_at', { ascending: false })
        .limit(PER_SOURCE)
      return ((data ?? []) as Row[]).map((r) => ({ at: String(r.created_at), kind: 'client' as const, subject: String(r.name ?? '') }))
    })(),
  ]

  if (opts.quotes) {
    sources.push((async () => {
      const { data } = await supabase
        .from('quotes')
        .select('reference, client_name, total_ttc, sent_at, accepted_at, signed_at, signed_by_name')
        .order('updated_at', { ascending: false })
        .limit(PER_SOURCE * 2)
      const out: ActivityEvent[] = []
      for (const r of (data ?? []) as Row[]) {
        const amount = num(r.total_ttc)
        const detail = [str(r.client_name), amount != null ? `${amount.toLocaleString('fr-FR', { maximumFractionDigits: 0 })} € TTC` : null].filter(Boolean).join(' · ')
        if (r.signed_at) out.push({ at: String(r.signed_at), kind: 'quote_signed', actor: str(r.signed_by_name), subject: String(r.reference ?? ''), detail })
        else if (r.accepted_at) out.push({ at: String(r.accepted_at), kind: 'quote_accepted', subject: String(r.reference ?? ''), detail })
        if (r.sent_at) out.push({ at: String(r.sent_at), kind: 'quote_sent', subject: String(r.reference ?? ''), detail })
      }
      return out
    })())
  }

  if (opts.invoices) {
    sources.push((async () => {
      const { data } = await supabase
        .from('invoices')
        .select('reference, client_name, total_ttc, sent_at, paid_at')
        .order('updated_at', { ascending: false })
        .limit(PER_SOURCE * 2)
      const out: ActivityEvent[] = []
      for (const r of (data ?? []) as Row[]) {
        const amount = num(r.total_ttc)
        const detail = [str(r.client_name), amount != null ? `${amount.toLocaleString('fr-FR', { maximumFractionDigits: 0 })} € TTC` : null].filter(Boolean).join(' · ')
        if (r.paid_at) out.push({ at: String(r.paid_at), kind: 'invoice_paid', subject: String(r.reference ?? ''), detail })
        if (r.sent_at) out.push({ at: String(r.sent_at), kind: 'invoice_sent', subject: String(r.reference ?? ''), detail })
      }
      return out
    })())
  }

  const settled = await Promise.allSettled(sources)
  return settled
    .flatMap((s) => (s.status === 'fulfilled' ? s.value : []))
    .filter((e) => e.at && !Number.isNaN(Date.parse(e.at)))
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
    .slice(0, limit)
}

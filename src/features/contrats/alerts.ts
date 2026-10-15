import { classifyAlert } from '../alertes/api'
import { listContracts } from './api'
import { currentPeriodEnd, fixedEnd, noticeDeadline, pendingRevision, todayIso } from './schemas'
import type { ContractWithDetails } from './schemas'

/**
 * Alertes des contrats de maintenance (90 jours) :
 *  - reconduction tacite qui approche, avec la date limite du préavis ;
 *  - fin d'un contrat sans reconduction (à renouveler ou laisser expirer) ;
 *  - révision annuelle du prix à appliquer.
 */

export type ContractAlertKind = 'renewal' | 'end' | 'revision'

export type ContractAlert = {
  key: string
  kind: ContractAlertKind
  contract: ContractWithDetails
  /** Date de l'échéance (ou début de période pour une révision) */
  date: string
  daysUntil: number
  title: string
  detail: string
}

const ALERT_WINDOW_DAYS = 90

function daysBetween(from: string, to: string): number {
  const [fy, fm, fd] = from.split('-').map(Number)
  const [ty, tm, td] = to.split('-').map(Number)
  return Math.round((Date.UTC(ty!, tm! - 1, td!) - Date.UTC(fy!, fm! - 1, fd!)) / 86_400_000)
}

function frDate(iso: string): string {
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

function pct(rate: number): string {
  return `${rate > 0 ? '+' : ''}${String(rate).replace('.', ',')} %`
}

export function computeContractAlerts(contracts: ContractWithDetails[], today = todayIso()): ContractAlert[] {
  const alerts: ContractAlert[] = []
  for (const c of contracts) {
    if (c.status !== 'active' && c.status !== 'suspended') continue

    const revision = pendingRevision(c, today)
    if (revision) {
      alerts.push({
        key: `${c.id}|revision`,
        kind: 'revision',
        contract: c,
        date: revision.from,
        daysUntil: daysBetween(today, revision.from),
        title: `Révision de ${pct(revision.rate)} à appliquer`,
        detail: `Contrat reconduit le ${frDate(revision.from)} : les prix n'ont pas encore été révisés.`,
      })
    }

    const end = fixedEnd(c)
    if (end) {
      const days = daysBetween(today, end)
      if (days <= ALERT_WINDOW_DAYS) {
        alerts.push({
          key: `${c.id}|end`,
          kind: 'end',
          contract: c,
          date: end,
          daysUntil: days,
          title: days < 0 ? `Contrat échu le ${frDate(end)}` : `Fin du contrat le ${frDate(end)}`,
          detail: 'Sans reconduction tacite : à renouveler avec le client, ou à laisser expirer.',
        })
      }
      continue
    }

    const periodEnd = currentPeriodEnd(c, today)
    if (!periodEnd) continue
    const days = daysBetween(today, periodEnd)
    if (days > ALERT_WINDOW_DAYS) continue
    const deadline = noticeDeadline(c, today)
    const parts = [
      deadline ? (deadline < today ? `préavis de résiliation dépassé depuis le ${frDate(deadline)}` : `résiliation possible jusqu'au ${frDate(deadline)}`) : null,
      c.revision_rate ? `révision de ${pct(c.revision_rate)} à appliquer à la reconduction` : null,
    ].filter(Boolean)
    alerts.push({
      key: `${c.id}|renewal`,
      kind: 'renewal',
      contract: c,
      date: periodEnd,
      daysUntil: days,
      title: `Reconduction le ${frDate(periodEnd)}`,
      detail: parts.length > 0 ? `${parts.join(' · ')}.` : 'Reconduction tacite de 12 mois.',
    })
  }
  return alerts.sort((a, b) => a.daysUntil - b.daysUntil)
}

export async function fetchContractAlerts(): Promise<ContractAlert[]> {
  return computeContractAlerts(await listContracts())
}

/** Pour le badge du menu : alertes en retard ou à moins de 30 jours */
export function isUrgentContractAlert(a: ContractAlert): boolean {
  const sev = classifyAlert(a.daysUntil)
  return sev === 'overdue' || sev === 'urgent'
}

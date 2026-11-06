/**
 * Rapports clôturés sans réseau.
 *
 * Sur le terrain (toiture, sous-sol), « Finaliser » ne peut pas fabriquer le
 * PDF ni l'envoyer : la saisie complète (signature comprise) et l'heure de
 * clôture sont gardées sur l'appareil. Au retour du réseau, une fois les
 * contrôles en attente envoyés, la finalisation se fait comme en ligne :
 * rapport enregistré à l'heure de la clôture, visite suivante, PDF, statut
 * « terminée », mail aux administrateurs et envoi automatique au client.
 */

import { getOfflineUser, getQueueCounts, isOffline, onOfflineChange } from '../../shared/lib/offline/state'
import type { UpsertReportInput } from './schemas'

export type PendingFinalize = {
  userId: string
  interventionId: string
  reference: string
  organizationId: string
  organizationName: string
  /** Saisie du rapport au moment de la clôture (mêmes champs qu'en ligne) */
  input: UpsertReportInput
  /** Heure de la clôture sur place (ISO) */
  completedAt: string
  conformity: { isConform: boolean | null; anomalyCount: number }
  autoSend: boolean
  attempts: number
  lastError?: string
}

const KEY = 'firovia_reports_to_finalize'
const listeners = new Set<() => void>()
const inProgress = new Set<string>()

function readAll(): PendingFinalize[] {
  try {
    const raw = localStorage.getItem(KEY)
    const list = raw ? (JSON.parse(raw) as PendingFinalize[]) : []
    return Array.isArray(list) ? list : []
  } catch {
    return []
  }
}

function writeAll(list: PendingFinalize[]) {
  try {
    if (list.length === 0) localStorage.removeItem(KEY)
    else localStorage.setItem(KEY, JSON.stringify(list))
  } catch {
    // Stockage plein ou indisponible : rien à faire de plus ici
  }
  listeners.forEach((cb) => cb())
}

/** Garde (ou remplace) la clôture d'une visite */
export function queuePendingFinalize(entry: Omit<PendingFinalize, 'attempts'>): void {
  const others = readAll().filter((e) => e.interventionId !== entry.interventionId)
  writeAll([...others, { ...entry, attempts: 0 }])
}

export function getPendingFinalize(interventionId: string): PendingFinalize | null {
  return readAll().find((e) => e.interventionId === interventionId) ?? null
}

export function removePendingFinalize(interventionId: string): void {
  const list = readAll()
  if (list.some((e) => e.interventionId === interventionId)) writeAll(list.filter((e) => e.interventionId !== interventionId))
}

/** Rapports clôturés sans réseau du compte connecté */
export function countPendingFinalize(): number {
  const userId = getOfflineUser()
  return userId ? readAll().filter((e) => e.userId === userId).length : 0
}

export function pendingFinalizeErrors(): number {
  const userId = getOfflineUser()
  return userId ? readAll().filter((e) => e.userId === userId && e.lastError).length : 0
}

export function isFinalizeInProgress(interventionId: string): boolean {
  return inProgress.has(interventionId)
}

export function onPendingFinalizeChange(cb: () => void): () => void {
  listeners.add(cb)
  return () => { listeners.delete(cb) }
}

async function finalizeOne(e: PendingFinalize): Promise<void> {
  const { finalizeReport, setReportConformity, getReportByIntervention } = await import('./api')
  const { setInterventionStatus } = await import('../planning/api')

  const saved = await finalizeReport(e.interventionId, e.organizationId, e.input, e.completedAt)
  await setReportConformity(saved.id, e.conformity).catch((err) => console.warn('[clôture différée] conformité', err))

  // PDF fabriqué à partir de la base (contrôles déjà envoyés), comme en ligne : non bloquant
  let pdfUrl: string | null = null
  try {
    const { generateReportPdfForIntervention } = await import('./pdf/buildReportPdf')
    pdfUrl = await generateReportPdfForIntervention(e.interventionId, e.organizationId, e.organizationName)
  } catch (err) {
    console.error('[clôture différée] PDF', err)
  }

  await setInterventionStatus(e.interventionId, 'terminee')
  // Plus rien d'obligatoire après ce point : la clôture quitte la liste
  removePendingFinalize(e.interventionId)

  const { notifyReportCompleted } = await import('../notifications/api')
  notifyReportCompleted(e.interventionId)
  if (e.autoSend && pdfUrl) {
    try {
      const { supabase } = await import('../../shared/lib/supabase')
      const { normalizeIntervention } = await import('../planning/schemas')
      const { data } = await supabase.from('interventions').select('*').eq('id', e.interventionId).single()
      const report = await getReportByIntervention(e.interventionId)
      if (data && report) {
        const { sendReportToClientRecipients } = await import('./autoSend')
        await sendReportToClientRecipients({
          intervention: normalizeIntervention(data as never),
          reportId: report.id,
          pdfUrl,
          organizationName: e.organizationName,
          isConform: e.conformity.isConform,
          anomalyCount: e.conformity.anomalyCount,
        })
      }
    } catch (err) {
      console.warn('[clôture différée] envoi automatique', err)
    }
  }
}

let running = false

/**
 * Finalise les rapports clôturés sans réseau, quand le réseau est là et que
 * les contrôles en attente sont partis. Une erreur est gardée sur la clôture,
 * qui sera retentée au passage suivant.
 */
export async function processPendingFinalize(): Promise<void> {
  if (running || isOffline()) return
  const userId = getOfflineUser()
  if (!userId) return
  if (getQueueCounts().pending > 0) return
  const todo = readAll().filter((e) => e.userId === userId)
  if (todo.length === 0) return
  running = true
  try {
    for (const e of todo) {
      if (isOffline() || getQueueCounts().pending > 0) break
      if (!getPendingFinalize(e.interventionId)) continue
      inProgress.add(e.interventionId)
      listeners.forEach((cb) => cb())
      try {
        await finalizeOne(e)
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        const list = readAll().map((x) => (x.interventionId === e.interventionId ? { ...x, attempts: x.attempts + 1, lastError: message } : x))
        writeAll(list)
      } finally {
        inProgress.delete(e.interventionId)
        listeners.forEach((cb) => cb())
      }
    }
  } finally {
    running = false
  }
}

if (typeof window !== 'undefined') {
  // Retour du réseau, file vidée : on finalise ; filet de sécurité toutes les 30 s
  let timer: number | null = null
  onOfflineChange(() => {
    if (timer !== null || countPendingFinalize() === 0) return
    timer = window.setTimeout(() => { timer = null; void processPendingFinalize() }, 2500)
  })
  window.setInterval(() => { void processPendingFinalize() }, 30_000)
}

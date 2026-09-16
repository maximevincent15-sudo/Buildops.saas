/**
 * Queue localStorage pour les mutations equipment_checks effectuées hors ligne.
 *
 * Stratégie V1 (option B) :
 * - Quand navigator.onLine === false, on push l'upsertCheck dans la queue
 *   (LOCAL_KEY) au lieu d'appeler Supabase.
 * - Retourne un EquipmentCheck "provisoire" pour que l'UI continue.
 * - Un listener 'online' + le bouton "Synchroniser" flushent la queue :
 *   chaque entrée est retentée dans l'ordre, avec suppression après succès.
 *
 * Limitations (à améliorer plus tard en niveau 3) :
 * - Photos non offline (nécessitent un upload Storage immédiat)
 * - Pas de résolution de conflits (dernier écrit gagne côté serveur)
 * - Queue perdue si le user vide le cache navigateur
 */

import { upsertCheck } from './api'
import type {
  CheckItemValue,
  CheckPhoto,
  CheckVerdict,
  EquipmentCheck,
  UpsertEquipmentCheckInput,
} from './schemas'

const LOCAL_KEY = 'firovia_pending_checks_v1'

export type PendingCheck = {
  id: string
  input: UpsertEquipmentCheckInput
  organizationId: string
  options: {
    updateUnitStatus?: boolean
    technicianName?: string | null
    technicianId?: string | null
  }
  createdAt: string
}

// ─── Storage helpers ────────────────────────────────────────

function readQueue(): PendingCheck[] {
  try {
    const raw = localStorage.getItem(LOCAL_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function writeQueue(list: PendingCheck[]) {
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(list))
    notifyChange()
  } catch {
    // silent (quota exceeded, private mode…)
  }
}

// ─── Change events (pour la bannière) ──────────────────────

const listeners = new Set<() => void>()

export function onQueueChange(cb: () => void): () => void {
  listeners.add(cb)
  return () => listeners.delete(cb)
}

function notifyChange() {
  for (const cb of listeners) {
    try { cb() } catch { /* ignore */ }
  }
}

// ─── API publique ──────────────────────────────────────────

export function getPendingCount(): number {
  return readQueue().length
}

export function getPendingChecks(): PendingCheck[] {
  return readQueue()
}

/**
 * Enfile un upsertCheck pour synchronisation ultérieure.
 * Retourne un EquipmentCheck "provisoire" pour permettre à l'UI de continuer.
 */
export function enqueueCheck(
  input: UpsertEquipmentCheckInput,
  organizationId: string,
  options: PendingCheck['options'] = {},
): EquipmentCheck {
  const pending: PendingCheck = {
    id: crypto.randomUUID(),
    input,
    organizationId,
    options,
    createdAt: new Date().toISOString(),
  }
  const queue = readQueue()
  // Un seul check en attente par (intervention, unité) — on remplace
  const filtered = queue.filter((p) =>
    !(p.input.intervention_id === input.intervention_id
      && p.input.equipment_unit_id === input.equipment_unit_id),
  )
  writeQueue([...filtered, pending])

  // Provisoire pour l'UI
  const now = new Date().toISOString()
  const provisional: EquipmentCheck = {
    id: `pending-${pending.id}`,
    organization_id: organizationId,
    intervention_id: input.intervention_id,
    equipment_unit_id: input.equipment_unit_id,
    family_template_id: input.family_template_id ?? null,
    checklist: (input.checklist ?? {}) as Record<string, CheckItemValue>,
    observation: input.observation ?? null,
    verdict: (input.verdict ?? 'non_verifie') as CheckVerdict,
    photos: (input.photos ?? []) as CheckPhoto[],
    technician_id: input.technician_id ?? options.technicianId ?? null,
    technician_name: input.technician_name ?? options.technicianName ?? null,
    checked_at: now,
    created_at: now,
    updated_at: now,
    created_by: null,
  }
  return provisional
}

/**
 * Wrapper autour d'upsertCheck : si offline, enqueue ; sinon direct.
 */
export async function upsertCheckSmart(
  input: UpsertEquipmentCheckInput,
  organizationId: string,
  options: PendingCheck['options'] = {},
): Promise<EquipmentCheck> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return enqueueCheck(input, organizationId, options)
  }
  try {
    return await upsertCheck(input, organizationId, options)
  } catch (err) {
    // Si la mutation échoue (timeout, réseau flakey), on enfile plutôt que perdre
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      return enqueueCheck(input, organizationId, options)
    }
    throw err
  }
}

/**
 * Envoie toutes les mutations en attente au serveur.
 * Les échecs restent dans la queue pour un prochain retry.
 */
export async function flushQueue(): Promise<{ ok: number; failed: number }> {
  const queue = readQueue()
  if (queue.length === 0) return { ok: 0, failed: 0 }

  const remaining: PendingCheck[] = []
  let ok = 0
  for (const pending of queue) {
    try {
      await upsertCheck(pending.input, pending.organizationId, pending.options)
      ok++
    } catch {
      remaining.push(pending)
    }
  }
  writeQueue(remaining)
  return { ok, failed: remaining.length }
}

// ─── Auto-flush au retour de connexion (module-level) ──────

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    // Delay léger pour laisser le réseau se stabiliser
    setTimeout(() => { void flushQueue() }, 1000)
  })
}

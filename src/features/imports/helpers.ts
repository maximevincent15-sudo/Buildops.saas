import { listTechnicians } from '../technicians/api'
import type { Technician } from '../technicians/schemas'

/**
 * Parse une date tolérante : "15/05/2026", "2026-05-15", "15-05-2026", "15.05.2026",
 * "15 mai 2026" → retourne "YYYY-MM-DD" ou null.
 */
export function parseFlexibleDate(input: string | null | undefined): string | null {
  if (!input) return null
  const s = input.trim()
  if (!s) return null

  // Format ISO YYYY-MM-DD direct
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s)
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`

  // Format FR JJ/MM/AAAA ou JJ-MM-AAAA ou JJ.MM.AAAA
  const fr = /^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})$/.exec(s)
  if (fr) {
    const day = fr[1].padStart(2, '0')
    const month = fr[2].padStart(2, '0')
    let year = fr[3]
    if (year.length === 2) {
      // 26 → 2026, 99 → 1999 (cutoff à 50)
      const n = parseInt(year, 10)
      year = (n < 50 ? 2000 + n : 1900 + n).toString()
    }
    return `${year}-${month}-${day}`
  }

  // Format long "15 mai 2026" ou "15 May 2026"
  const longMatch = /^(\d{1,2})\s+(\S+)\s+(\d{4})$/.exec(s)
  if (longMatch) {
    const monthMap: Record<string, string> = {
      janv: '01', jan: '01', january: '01', fevr: '02', fev: '02', feb: '02', february: '02',
      mars: '03', mar: '03', march: '03', avri: '04', avr: '04', apr: '04', april: '04',
      mai: '05', may: '05', juin: '06', jun: '06', june: '06',
      juil: '07', jul: '07', july: '07', aout: '08', aug: '08', august: '08',
      sept: '09', sep: '09', september: '09', octo: '10', oct: '10', october: '10',
      nove: '11', nov: '11', november: '11', dece: '12', dec: '12', december: '12',
    }
    const key = longMatch[2]
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .slice(0, 4)
    const shortKey = key.slice(0, 3)
    const month = monthMap[key] ?? monthMap[shortKey]
    if (month) {
      const day = longMatch[1].padStart(2, '0')
      return `${longMatch[3]}-${month}-${day}`
    }
  }

  // Dernière tentative : new Date()
  try {
    const d = new Date(s)
    if (!isNaN(d.getTime())) {
      const y = d.getFullYear()
      const m = String(d.getMonth() + 1).padStart(2, '0')
      const day = String(d.getDate()).padStart(2, '0')
      return `${y}-${m}-${day}`
    }
  } catch { /* ignore */ }

  return null
}

/**
 * Parse un entier tolérant (espaces, séparateurs milliers).
 */
export function parseFlexibleInt(input: string | null | undefined): number | null {
  if (!input) return null
  const cleaned = input.replace(/[\s_]/g, '').replace(/,/g, '.')
  const n = parseInt(cleaned, 10)
  return Number.isFinite(n) ? n : null
}

/**
 * Charge et met en cache les techniciens indexés par "prénom nom" normalisé,
 * pour résoudre un nom texte en technician_id pendant l'import.
 */
export async function getTechniciansNameIndex(
  cache: Record<string, unknown>,
): Promise<Map<string, Technician>> {
  const cached = cache.techniciansByName as Map<string, Technician> | undefined
  if (cached) return cached
  const list = await listTechnicians()
  const map = new Map<string, Technician>()
  for (const t of list) {
    const key = `${t.first_name} ${t.last_name}`
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, ' ')
    map.set(key, t)
  }
  cache.techniciansByName = map
  return map
}

/** Lookup un tech par nom texte (tolérant accents/casse). Retourne null si introuvable. */
export async function resolveTechnicianByName(
  name: string | null | undefined,
  cache: Record<string, unknown>,
): Promise<Technician | null> {
  if (!name) return null
  const map = await getTechniciansNameIndex(cache)
  const key = name
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
  return map.get(key) ?? null
}

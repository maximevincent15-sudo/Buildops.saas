import ExcelJS from 'exceljs'
import Papa from 'papaparse'
import type { ImportField } from './types'

/**
 * Lit un fichier XLSX et retourne un array de rows objets.
 * La première ligne est considérée comme header.
 * Les colonnes sont mappées aux `fields.key` en comparant de façon lâche
 * (insensible casse, accents, espaces) le header aux `label` des fields.
 */
export async function parseXlsx(
  file: File,
  fields: ImportField[],
): Promise<Record<string, string | null>[]> {
  const buffer = await file.arrayBuffer()
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(buffer)
  const ws = wb.worksheets[0]
  if (!ws) return []

  const headerRow = ws.getRow(1)
  const headerMap = buildHeaderMap(headerRow.values as unknown[], fields)

  const rows: Record<string, string | null>[] = []
  ws.eachRow({ includeEmpty: false }, (row, rowIndex) => {
    if (rowIndex === 1) return // skip header
    if (rowIndex === 2 && isHintRow(row.values as unknown[])) return // skip hint row (si présente)
    const rec = rowToRecord(row.values as unknown[], headerMap)
    if (isEmptyRow(rec)) return
    rows.push(rec)
  })

  return rows
}

/** Lit un fichier CSV (séparateur auto-détecté par papaparse). */
export async function parseCsv(
  file: File,
  fields: ImportField[],
): Promise<Record<string, string | null>[]> {
  const text = await file.text()
  const result = Papa.parse<string[]>(text.trim(), {
    skipEmptyLines: true,
  })
  if (result.errors.length > 0) {
    console.warn('CSV parse warnings:', result.errors)
  }
  const lines = result.data
  if (lines.length === 0) return []

  const headerMap = buildHeaderMap(lines[0], fields)
  const rows: Record<string, string | null>[] = []
  for (let i = 1; i < lines.length; i++) {
    if (i === 1 && isHintRow(lines[i])) continue
    const rec = rowToRecord(lines[i], headerMap)
    if (isEmptyRow(rec)) continue
    rows.push(rec)
  }
  return rows
}

/**
 * Parser unifié : dispatche sur xlsx ou csv selon l'extension / le type MIME.
 */
export async function parseImportFile(
  file: File,
  fields: ImportField[],
): Promise<Record<string, string | null>[]> {
  const name = file.name.toLowerCase()
  if (name.endsWith('.xlsx') || name.endsWith('.xlsm') || name.endsWith('.xls')) {
    return parseXlsx(file, fields)
  }
  if (name.endsWith('.csv') || name.endsWith('.tsv') || name.endsWith('.txt')) {
    return parseCsv(file, fields)
  }
  // Fallback : essaye XLSX d'abord, puis CSV
  try {
    return await parseXlsx(file, fields)
  } catch {
    return parseCsv(file, fields)
  }
}

// ─── Helpers internes ─────────────────────────────────────────────────

function normalizeHeader(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .trim()
}

/**
 * Construit un mapping index de colonne → field.key.
 * Les headers du fichier sont comparés aux `label` et `key` de chaque field,
 * de façon tolérante (accents, casse, espaces ignorés).
 */
function buildHeaderMap(
  rawHeader: unknown[],
  fields: ImportField[],
): Map<number, string> {
  const normalizedFields = fields.map((f) => ({
    key: f.key,
    aliases: [normalizeHeader(f.label), normalizeHeader(f.key)],
  }))
  const map = new Map<number, string>()
  // ExcelJS renvoie un array avec un élément vide à l'index 0, on garde
  // quand même les deux formats possibles (array from papaparse commence à 0).
  const offset = rawHeader[0] === undefined || rawHeader[0] === null ? 1 : 0
  for (let i = offset; i < rawHeader.length; i++) {
    const raw = rawHeader[i]
    if (raw === null || raw === undefined) continue
    const cellText = typeof raw === 'object' && 'text' in (raw as Record<string, unknown>)
      ? String((raw as { text: string }).text)
      : String(raw)
    const norm = normalizeHeader(cellText)
    if (!norm) continue
    const match = normalizedFields.find((f) => f.aliases.includes(norm))
    if (match) {
      map.set(i - offset, match.key)
    }
  }
  return map
}

function rowToRecord(
  rawRow: unknown[],
  headerMap: Map<number, string>,
): Record<string, string | null> {
  const rec: Record<string, string | null> = {}
  // Même logique de offset que dans buildHeaderMap
  const offset = rawRow[0] === undefined || rawRow[0] === null ? 1 : 0
  for (let i = offset; i < rawRow.length; i++) {
    const key = headerMap.get(i - offset)
    if (!key) continue
    const raw = rawRow[i]
    if (raw === null || raw === undefined) continue
    let text: string
    if (raw instanceof Date) {
      text = raw.toISOString().slice(0, 10)
    } else if (typeof raw === 'object' && 'text' in (raw as Record<string, unknown>)) {
      text = String((raw as { text: string }).text)
    } else if (typeof raw === 'object' && 'result' in (raw as Record<string, unknown>)) {
      text = String((raw as { result: unknown }).result ?? '')
    } else {
      text = String(raw)
    }
    const trimmed = text.trim()
    rec[key] = trimmed === '' ? null : trimmed
  }
  return rec
}

function isEmptyRow(rec: Record<string, string | null>): boolean {
  return Object.values(rec).every((v) => v === null || v === '')
}

/**
 * Détecte si une ligne est une ligne d'aide/exemple (tous les champs commencent
 * par "ex:" ou contiennent "exemple"). On l'ignore silencieusement.
 */
function isHintRow(rawRow: unknown[]): boolean {
  const texts = rawRow
    .filter((v) => v !== null && v !== undefined)
    .map((v) => String(v).toLowerCase().trim())
    .filter((v) => v !== '')
  if (texts.length === 0) return false
  // Heuristique simple : si la majorité commence par "ex" ou "exemple"
  const hintCount = texts.filter((t) => t.startsWith('ex:') || t.startsWith('ex ') || t.startsWith('exemple')).length
  return hintCount > 0 && hintCount >= Math.floor(texts.length / 2)
}

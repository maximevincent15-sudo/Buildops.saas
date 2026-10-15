import { format } from 'date-fns'
import { supabase } from '../../shared/lib/supabase'

/**
 * Export complet des données de l'organisation (réversibilité, art. 11 des
 * CGV) : un classeur Excel (une feuille par type de données) + tous les PDF
 * (rapports, devis, factures, documents importés), dans un seul ZIP.
 * Tout est généré dans le navigateur ; RLS limite les lectures à l'organisation.
 */

type Row = Record<string, unknown>

type TableSpec = {
  table: string
  sheet: string
  /** Colonnes retirées : techniques, volumineuses ou secrètes */
  omit?: string[]
  order?: string
}

const COMMON_OMIT = ['organization_id']

// Ordre des feuilles = ordre de lecture naturel pour le client
const TABLES: TableSpec[] = [
  { table: 'organization_invoicing_settings', sheet: 'Entreprise', order: 'organization_id' },
  { table: 'clients', sheet: 'Clients', order: 'name' },
  { table: 'sites', sheet: 'Sites', order: 'name' },
  { table: 'zones', sheet: 'Zones' },
  { table: 'equipment_units', sheet: 'Équipements' },
  { table: 'equipment_checks', sheet: 'Contrôles équipements', order: 'checked_at' },
  { table: 'technicians', sheet: 'Techniciens', order: 'last_name' },
  { table: 'certifications', sheet: 'Habilitations' },
  { table: 'vehicles', sheet: 'Véhicules' },
  { table: 'interventions', sheet: 'Interventions', order: 'scheduled_date' },
  { table: 'planning_blocks', sheet: 'Événements planning' },
  // La signature manuscrite (image base64) reste dans le PDF du rapport
  { table: 'reports', sheet: 'Rapports', omit: ['signature_data_url'], order: 'completed_at' },
  { table: 'anomalies', sheet: 'Anomalies' },
  { table: 'quotes', sheet: 'Devis', order: 'issue_date' },
  { table: 'quote_lines', sheet: 'Lignes de devis' },
  { table: 'invoices', sheet: 'Factures', order: 'issue_date' },
  { table: 'invoice_lines', sheet: 'Lignes de factures' },
  { table: 'expenses', sheet: 'Frais' },
  { table: 'overtime_hours', sheet: 'Heures sup' },
  { table: 'legacy_documents', sheet: 'Documents importés' },
]

const PAGE = 1000
const EXCEL_CELL_MAX = 32_000

async function fetchAll(spec: TableSpec): Promise<Row[]> {
  const rows: Row[] = []
  for (let from = 0; ; from += PAGE) {
    let q = supabase.from(spec.table).select('*').range(from, from + PAGE - 1)
    q = spec.order ? q.order(spec.order, { ascending: true, nullsFirst: true }) : q.order('id')
    const { data, error } = await q
    if (error) throw new Error(`${spec.sheet} : ${error.message}`)
    rows.push(...((data ?? []) as Row[]))
    if (!data || data.length < PAGE) break
  }
  return rows
}

function cellValue(v: unknown): string | number | boolean | null {
  if (v === null || v === undefined) return null
  if (typeof v === 'number' || typeof v === 'boolean') return v
  const text = typeof v === 'string' ? v : JSON.stringify(v)
  return text.length > EXCEL_CELL_MAX ? `${text.slice(0, EXCEL_CELL_MAX)}… (tronqué)` : text
}

/** Nom de fichier sûr pour toutes les plateformes */
function safeName(text: string): string {
  return text
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9 ._-]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80) || 'document'
}

export type ExportProgress = (label: string, done: number, total: number) => void

export type ExportResult = { blob: Blob; filename: string; pdfCount: number; pdfFailed: number; rowCount: number }

export async function exportAllData(orgName: string, onProgress: ExportProgress = () => {}): Promise<ExportResult> {
  const [{ default: ExcelJS }, { zip }] = await Promise.all([import('exceljs'), import('fflate')])

  // 1. Données → classeur Excel
  const data = new Map<string, Row[]>()
  for (const [i, spec] of TABLES.entries()) {
    onProgress(`Lecture : ${spec.sheet}`, i, TABLES.length)
    data.set(spec.table, await fetchAll(spec))
  }

  const wb = new ExcelJS.Workbook()
  wb.creator = 'Firovia'
  wb.created = new Date()
  let rowCount = 0
  for (const spec of TABLES) {
    const rows = data.get(spec.table) ?? []
    const ws = wb.addWorksheet(spec.sheet.slice(0, 31))
    const omit = new Set([...COMMON_OMIT, ...(spec.omit ?? [])])
    const columns = Array.from(new Set(rows.flatMap((r) => Object.keys(r)))).filter((c) => !omit.has(c))
    if (columns.length === 0) {
      ws.addRow(['Aucune donnée'])
      continue
    }
    ws.addRow(columns)
    ws.getRow(1).font = { bold: true }
    ws.views = [{ state: 'frozen', ySplit: 1 }]
    for (const r of rows) ws.addRow(columns.map((c) => cellValue(r[c])))
    columns.forEach((c, idx) => { ws.getColumn(idx + 1).width = Math.min(Math.max(c.length + 2, 12), 45) })
    rowCount += rows.length
  }
  const xlsx = new Uint8Array(await wb.xlsx.writeBuffer())

  // 2. PDF des documents
  const interventions = new Map((data.get('interventions') ?? []).map((i) => [i.id as string, i]))
  const pdfs: Array<{ path: string; url: string }> = []
  const used = new Set<string>()
  const addPdf = (folder: string, base: string, url: unknown) => {
    if (typeof url !== 'string' || !/^https:\/\//.test(url)) return
    let name = `${folder}/${safeName(base)}.pdf`
    for (let n = 2; used.has(name); n++) name = `${folder}/${safeName(base)} (${n}).pdf`
    used.add(name)
    pdfs.push({ path: name, url })
  }
  for (const r of data.get('reports') ?? []) {
    const interv = interventions.get(r.intervention_id as string)
    const date = typeof r.completed_at === 'string' ? r.completed_at.slice(0, 10) : ''
    addPdf('PDF/Rapports', [date, interv?.reference, interv?.client_name].filter(Boolean).join(' - '), r.pdf_url)
  }
  for (const q of data.get('quotes') ?? []) addPdf('PDF/Devis', [q.reference, q.client_name].filter(Boolean).join(' - '), q.pdf_url)
  for (const f of data.get('invoices') ?? []) addPdf('PDF/Factures', [f.reference, f.client_name].filter(Boolean).join(' - '), f.pdf_url)
  for (const d of data.get('legacy_documents') ?? []) {
    addPdf('PDF/Documents importés', String(d.pdf_filename ?? d.reference ?? d.id).replace(/\.pdf$/i, ''), d.pdf_url)
  }

  const files: Record<string, Uint8Array> = {}
  let pdfFailed = 0
  const CONCURRENCY = 6
  let next = 0
  let done = 0
  await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
    while (next < pdfs.length) {
      const item = pdfs[next++]!
      try {
        const res = await fetch(item.url)
        if (!res.ok) throw new Error(String(res.status))
        files[item.path] = new Uint8Array(await res.arrayBuffer())
      } catch {
        pdfFailed++
      }
      onProgress('Téléchargement des PDF', ++done, pdfs.length)
    }
  }))

  // 3. ZIP
  onProgress('Création du fichier ZIP', 0, 1)
  const stamp = format(new Date(), 'yyyy-MM-dd')
  const readme = [
    `Export complet Firovia — ${orgName}`,
    `Date : ${format(new Date(), 'dd/MM/yyyy HH:mm')}`,
    '',
    'Contenu :',
    '- donnees-firovia.xlsx : toutes vos données, une feuille par type (clients, sites, équipements,',
    '  interventions, rapports, devis, factures, frais…). Les colonnes « id » relient les feuilles entre elles.',
    `- PDF/ : vos rapports, devis, factures et documents importés (${pdfs.length - pdfFailed} fichiers).`,
    '',
    'Les photos et justificatifs restent consultables via les liens présents dans le classeur.',
    'Ces données vous appartiennent : vous pouvez les réutiliser librement (art. 11 des CGV Firovia).',
    pdfFailed > 0 ? `\nAttention : ${pdfFailed} PDF n'ont pas pu être téléchargés (lien indisponible).` : '',
  ].join('\n')
  files['LISEZ-MOI.txt'] = new TextEncoder().encode(readme)
  files['donnees-firovia.xlsx'] = xlsx

  const zipped = await new Promise<Uint8Array>((resolve, reject) => {
    // PDF et xlsx sont déjà compressés : on les stocke sans recompresser
    zip(files, { level: 0 }, (err, out) => (err ? reject(err) : resolve(out)))
  })

  return {
    blob: new Blob([zipped as BlobPart], { type: 'application/zip' }),
    filename: `Firovia-export-${safeName(orgName).replace(/ /g, '-')}-${stamp}.zip`,
    pdfCount: pdfs.length - pdfFailed,
    pdfFailed,
    rowCount,
  }
}

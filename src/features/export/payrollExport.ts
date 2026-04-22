import ExcelJS from 'exceljs'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import {
  EXPENSE_CATEGORY_LABEL,
  computeHt,
  computeVat,
} from '../expenses/constants'
import type { Expense } from '../expenses/schemas'
import { OVERTIME_TYPE_LABEL } from '../overtime/constants'
import type { Overtime } from '../overtime/schemas'

const HEADER_FILL = 'FF1C2130'    // BuildOps ink foncé
const HEADER_FONT = 'FFFFFFFF'
const SUBTOTAL_FILL = 'FFF4F2EE'  // bg2

type PayrollInput = {
  expenses: Expense[]
  overtime: Overtime[]
  organizationName: string
  from: string            // ISO date YYYY-MM-DD
  to: string              // ISO date YYYY-MM-DD (inclus)
}

function formatPeriod(from: string, to: string): string {
  try {
    const f = format(new Date(from), 'd MMM yyyy', { locale: fr })
    const t = format(new Date(to), 'd MMM yyyy', { locale: fr })
    return `${f} → ${t}`
  } catch {
    return `${from} → ${to}`
  }
}

function dateToFr(iso: string): string {
  try {
    return format(new Date(iso), 'dd/MM/yyyy', { locale: fr })
  } catch {
    return iso
  }
}

function styleHeaderRow(row: ExcelJS.Row) {
  row.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: HEADER_FONT }, size: 11 }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_FILL } }
    cell.alignment = { vertical: 'middle', horizontal: 'left' }
    cell.border = {
      bottom: { style: 'thin', color: { argb: 'FF000000' } },
    }
  })
  row.height = 22
}

function styleTotalRow(row: ExcelJS.Row) {
  row.eachCell((cell) => {
    cell.font = { bold: true, size: 11 }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: SUBTOTAL_FILL } }
    cell.border = {
      top: { style: 'thin', color: { argb: 'FF1C2130' } },
    }
  })
  row.height = 20
}

// ═══════════════════════════════════════════════════════════
// Onglet Notes de frais
// ═══════════════════════════════════════════════════════════

function buildExpensesSheet(wb: ExcelJS.Workbook, input: PayrollInput) {
  const ws = wb.addWorksheet('Notes de frais', {
    properties: { defaultColWidth: 15 },
    views: [{ state: 'frozen', ySplit: 4 }],
  })

  // Bandeau titre
  ws.mergeCells('A1:J1')
  const title = ws.getCell('A1')
  title.value = `Notes de frais — ${input.organizationName}`
  title.font = { bold: true, size: 14, color: { argb: HEADER_FILL } }
  title.alignment = { vertical: 'middle' }
  ws.getRow(1).height = 24

  ws.mergeCells('A2:J2')
  const period = ws.getCell('A2')
  period.value = `Période : ${formatPeriod(input.from, input.to)}`
  period.font = { italic: true, size: 10, color: { argb: 'FF6A7080' } }

  // Ligne vide (3) puis header (4)
  const header = ws.getRow(4)
  header.values = [
    'Date',
    'Technicien',
    'Catégorie',
    'Description',
    'HT (€)',
    'TVA (€)',
    'TVA %',
    'TTC (€)',
    'Statut',
    'Justificatif',
  ]
  styleHeaderRow(header)

  // Largeurs
  ws.columns = [
    { width: 11 },   // Date
    { width: 22 },   // Tech
    { width: 20 },   // Catégorie
    { width: 34 },   // Description
    { width: 11 },   // HT
    { width: 11 },   // TVA
    { width: 8 },    // TVA %
    { width: 11 },   // TTC
    { width: 12 },   // Statut
    { width: 40 },   // URL
  ]

  // Tri par date asc
  const sorted = [...input.expenses].sort((a, b) => a.spent_on.localeCompare(b.spent_on))

  let totalHt = 0
  let totalVat = 0
  let totalTtc = 0

  for (const e of sorted) {
    const ttc = Number(e.amount_ttc)
    const vatRate = Number(e.vat_rate)
    const ht = computeHt(ttc, vatRate)
    const vat = computeVat(ttc, vatRate)
    totalHt += ht
    totalVat += vat
    totalTtc += ttc

    const row = ws.addRow([
      dateToFr(e.spent_on),
      e.technician_name,
      EXPENSE_CATEGORY_LABEL[e.category],
      e.description ?? '',
      Number(ht.toFixed(2)),
      Number(vat.toFixed(2)),
      vatRate,
      Number(ttc.toFixed(2)),
      e.status === 'approved' ? 'Validée' : e.status === 'rejected' ? 'Refusée' : 'En attente',
      e.receipt_url ?? '(sans justificatif)',
    ])
    // Format € sur colonnes HT/TVA/TTC
    row.getCell(5).numFmt = '#,##0.00 "€"'
    row.getCell(6).numFmt = '#,##0.00 "€"'
    row.getCell(7).numFmt = '0.0"%"'
    row.getCell(8).numFmt = '#,##0.00 "€"'
    // Lien sur justificatif
    if (e.receipt_url) {
      row.getCell(10).value = { text: 'Ouvrir le justificatif', hyperlink: e.receipt_url }
      row.getCell(10).font = { color: { argb: 'FF2563EB' }, underline: true }
    } else {
      row.getCell(10).font = { italic: true, color: { argb: 'FFB45309' } }
    }
  }

  if (sorted.length === 0) {
    ws.addRow([])
    const empty = ws.addRow(['Aucune note sur la période.'])
    empty.getCell(1).font = { italic: true, color: { argb: 'FF6A7080' } }
    ws.mergeCells(`A${empty.number}:J${empty.number}`)
  } else {
    ws.addRow([])
    const totalRow = ws.addRow([
      'TOTAL',
      `${sorted.length} note${sorted.length > 1 ? 's' : ''}`,
      '',
      '',
      Number(totalHt.toFixed(2)),
      Number(totalVat.toFixed(2)),
      '',
      Number(totalTtc.toFixed(2)),
      '',
      '',
    ])
    totalRow.getCell(5).numFmt = '#,##0.00 "€"'
    totalRow.getCell(6).numFmt = '#,##0.00 "€"'
    totalRow.getCell(8).numFmt = '#,##0.00 "€"'
    styleTotalRow(totalRow)
  }
}

// ═══════════════════════════════════════════════════════════
// Onglet Heures supplémentaires
// ═══════════════════════════════════════════════════════════

function buildOvertimeSheet(wb: ExcelJS.Workbook, input: PayrollInput) {
  const ws = wb.addWorksheet('Heures sup', {
    views: [{ state: 'frozen', ySplit: 4 }],
  })

  ws.mergeCells('A1:F1')
  const title = ws.getCell('A1')
  title.value = `Heures supplémentaires — ${input.organizationName}`
  title.font = { bold: true, size: 14, color: { argb: HEADER_FILL } }
  ws.getRow(1).height = 24

  ws.mergeCells('A2:F2')
  const period = ws.getCell('A2')
  period.value = `Période : ${formatPeriod(input.from, input.to)}`
  period.font = { italic: true, size: 10, color: { argb: 'FF6A7080' } }

  const header = ws.getRow(4)
  header.values = ['Date', 'Technicien', 'Type', 'Heures', 'Motif', 'Statut']
  styleHeaderRow(header)

  ws.columns = [
    { width: 11 },   // Date
    { width: 22 },   // Tech
    { width: 20 },   // Type
    { width: 10 },   // Heures
    { width: 40 },   // Motif
    { width: 12 },   // Statut
  ]

  // Grouper par technicien pour sous-totaux
  const byTech = new Map<string, Overtime[]>()
  for (const o of input.overtime) {
    const key = o.technician_name
    const arr = byTech.get(key) ?? []
    arr.push(o)
    byTech.set(key, arr)
  }

  let grandTotal = 0

  // Tri des techs alpha, puis au sein d'un tech tri par date asc
  const techKeys = Array.from(byTech.keys()).sort()

  if (techKeys.length === 0) {
    ws.addRow([])
    const empty = ws.addRow(['Aucune heure supplémentaire sur la période.'])
    empty.getCell(1).font = { italic: true, color: { argb: 'FF6A7080' } }
    ws.mergeCells(`A${empty.number}:F${empty.number}`)
    return
  }

  for (const techName of techKeys) {
    const items = [...(byTech.get(techName) ?? [])].sort((a, b) => a.worked_on.localeCompare(b.worked_on))
    let techTotal = 0
    for (const o of items) {
      const hours = Number(o.hours)
      techTotal += hours
      const row = ws.addRow([
        dateToFr(o.worked_on),
        o.technician_name,
        OVERTIME_TYPE_LABEL[o.type],
        hours,
        o.description ?? '',
        o.status === 'approved' ? 'Validée' : o.status === 'rejected' ? 'Refusée' : 'En attente',
      ])
      row.getCell(4).numFmt = '0.00" h"'
    }
    // Sous-total par tech
    const subtotalRow = ws.addRow([
      '',
      `Sous-total ${techName}`,
      '',
      Number(techTotal.toFixed(2)),
      '',
      '',
    ])
    subtotalRow.getCell(4).numFmt = '0.00" h"'
    styleTotalRow(subtotalRow)
    grandTotal += techTotal
  }

  ws.addRow([])
  const totalRow = ws.addRow([
    'TOTAL GÉNÉRAL',
    `${techKeys.length} tech${techKeys.length > 1 ? 's' : ''}`,
    '',
    Number(grandTotal.toFixed(2)),
    '',
    '',
  ])
  totalRow.getCell(4).numFmt = '0.00" h"'
  totalRow.eachCell((cell) => {
    cell.font = { bold: true, size: 12, color: { argb: HEADER_FONT } }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_FILL } }
  })
  totalRow.height = 24
}

// ═══════════════════════════════════════════════════════════
// Export principal
// ═══════════════════════════════════════════════════════════

export async function generatePayrollXlsx(input: PayrollInput): Promise<Blob> {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'BuildOps'
  wb.created = new Date()

  buildExpensesSheet(wb, input)
  buildOvertimeSheet(wb, input)

  const buffer = await wb.xlsx.writeBuffer()
  return new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
}

export function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

export function buildPayrollFilename(orgName: string, from: string, to: string): string {
  const cleanOrg = orgName
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9-]/g, '-')
    .slice(0, 30)
  // Si from et to sont dans le même mois, on affiche "avril-2026", sinon "2026-04-01_au_2026-04-30"
  const fromDate = new Date(from)
  const toDate = new Date(to)
  const sameMonth =
    fromDate.getFullYear() === toDate.getFullYear() &&
    fromDate.getMonth() === toDate.getMonth()
  if (sameMonth) {
    const month = format(fromDate, 'MMMM-yyyy', { locale: fr })
    return `Paie_${cleanOrg}_${month}.xlsx`
  }
  return `Paie_${cleanOrg}_${from}_au_${to}.xlsx`
}

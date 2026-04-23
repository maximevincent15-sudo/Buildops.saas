import ExcelJS from 'exceljs'
import type { ImportDefinition } from './types'

/**
 * Génère un fichier XLSX de template à télécharger.
 * Structure :
 *  - Ligne 1 : en-têtes (stylés, fond noir/ink)
 *  - Ligne 2 : exemple de valeurs (grisée)
 *  - Ligne 3 : vide (le client remplira à partir d'ici)
 *  - Colonnes requises marquées d'un "*"
 */
export async function generateImportTemplate(
  definition: ImportDefinition,
): Promise<Blob> {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'BuildOps'
  wb.created = new Date()

  const ws = wb.addWorksheet(definition.entityLabelPlural, {
    views: [{ state: 'frozen', ySplit: 1 }],
  })

  // Largeurs de colonnes
  ws.columns = definition.fields.map((f) => ({
    header: f.label + (f.required ? ' *' : ''),
    key: f.key,
    width: Math.max(18, Math.min(40, f.label.length + 4)),
  }))

  // Style header
  const header = ws.getRow(1)
  header.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 }
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF1C2130' },
    }
    cell.alignment = { vertical: 'middle', horizontal: 'left' }
    cell.border = {
      bottom: { style: 'thin', color: { argb: 'FF000000' } },
    }
  })
  header.height = 22

  // Ligne 2 : exemple (sera ignorée automatiquement au parsing)
  const exampleRow = ws.addRow(
    Object.fromEntries(definition.fields.map((f) => [f.key, f.example ?? ''])),
  )
  exampleRow.eachCell((cell) => {
    cell.font = { italic: true, color: { argb: 'FF9AA0AE' }, size: 10 }
    cell.alignment = { vertical: 'middle' }
  })

  // Ligne 3 : notice aide (dans la première cellule, en merge sur toutes les colonnes)
  const hintRowIndex = 3
  const lastColLetter = String.fromCharCode(64 + definition.fields.length)
  ws.mergeCells(`A${hintRowIndex}:${lastColLetter}${hintRowIndex}`)
  const hintCell = ws.getCell(`A${hintRowIndex}`)
  hintCell.value =
    `💡 Commence à remplir à partir de la ligne 4. ` +
    `Les colonnes marquées d'un * sont obligatoires. ` +
    `Les dates au format JJ/MM/AAAA. ` +
    `Sauvegarde ensuite en .xlsx et utilise "Importer un fichier" sur BuildOps.`
  hintCell.font = { italic: true, color: { argb: 'FF6A7080' }, size: 9 }
  hintCell.alignment = { vertical: 'middle', wrapText: true }
  hintCell.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFF8F9FB' },
  }
  ws.getRow(hintRowIndex).height = 30

  // Ligne 4 : vide (début de la zone de saisie)
  ws.getRow(4).height = 22

  const buffer = await wb.xlsx.writeBuffer()
  return new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
}

export function downloadTemplate(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

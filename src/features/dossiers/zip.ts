import { format } from 'date-fns'
import { listEquipmentUnits, listZones } from '../equipment/api'
import { unitRepere, unitTypeLine } from '../equipment/identification'
import { EQUIPMENT_FAMILY_LABELS } from '../equipment/schemas'
import { QUOTE_STATUS_LABEL } from '../devis/constants'
import type { QuoteStatus } from '../devis/constants'
import { INVOICE_STATUS_LABEL } from '../factures/constants'
import type { InvoiceStatus } from '../factures/constants'
import { INTERVENTION_STATUSES, formatEquipmentTypes } from '../../shared/constants/interventions'
import type { InterventionStatus } from '../../shared/constants/interventions'
import { DOSSIER_DOCUMENT_LABELS } from './api'
import type { DossierDetail } from './api'
import { openableUrls } from '../../shared/lib/privateFiles'

export type DossierZipProgress = (label: string, done: number, total: number) => void

function safeName(s: string): string {
  return s.normalize('NFC').replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').trim().slice(0, 90) || 'document'
}

function frDate(d: string | null | undefined): string {
  if (!d) return ''
  try {
    return format(new Date(d), 'dd/MM/yyyy')
  } catch {
    return d
  }
}

function isoDay(d: string | null | undefined): string {
  return d ? d.slice(0, 10) : ''
}

function extensionOf(url: string, fallback: string): string {
  const m = /\.([a-z0-9]{2,5})(?:\?|$)/i.exec(new URL(url).pathname)
  return (m?.[1] ?? fallback).toLowerCase()
}

/**
 * Dossier complet en un fichier ZIP : sommaire Excel (sites, équipements,
 * visites, devis, factures, documents), PDF des rapports, devis et factures,
 * documents ajoutés et photos. Pour archiver le chantier ou le transmettre.
 */
export async function exportDossierZip(
  dossier: DossierDetail,
  orgName: string,
  onProgress: DossierZipProgress = () => {},
): Promise<{ blob: Blob; filename: string; fileCount: number; failed: number }> {
  const [{ default: ExcelJS }, { zip }] = await Promise.all([import('exceljs'), import('fflate')])

  // 1. Sommaire
  onProgress('Préparation du sommaire', 0, 1)
  const unitsBySite = await Promise.all(dossier.sites.map(async (s) => {
    const [units, zones] = await Promise.all([listEquipmentUnits({ siteId: s.id }), listZones(s.id)])
    const zoneName = new Map(zones.map((z) => [z.id, z.name]))
    return { site: s, units, zoneName }
  }))

  const wb = new ExcelJS.Workbook()
  wb.creator = 'Firovia'
  wb.created = new Date()
  const sheet = (name: string, header: string[], rows: Array<Array<string | number | null>>, widths: number[]) => {
    const ws = wb.addWorksheet(name)
    ws.addRow(header)
    ws.getRow(1).font = { bold: true }
    ws.views = [{ state: 'frozen', ySplit: 1 }]
    for (const r of rows) ws.addRow(r)
    widths.forEach((w, i) => { ws.getColumn(i + 1).width = w })
  }

  sheet('Dossier', ['Rubrique', 'Valeur'], [
    ['N° de dossier', dossier.number],
    ['Client', dossier.clients.map((c) => c.name).join(', ')],
    ['N° client', dossier.clients.map((c) => c.client_number).filter(Boolean).join(', ')],
    ['Sites', dossier.sites.length],
    ['Équipements', dossier.sites.reduce((n, s) => n + s.unitCount, 0)],
    ['Visites', dossier.visits.length],
    ['Devis', dossier.quotes.length],
    ['Factures', dossier.invoices.length],
    ['Documents ajoutés', dossier.documents.length],
    ['Photos', dossier.photos.length],
    ['Entreprise', orgName],
    ['Exporté le', format(new Date(), 'dd/MM/yyyy HH:mm')],
  ], [22, 60])

  sheet('Sites', ['Site', 'Adresse', 'Code postal', 'Ville', 'Contact', 'Téléphone', 'Équipements'],
    dossier.sites.map((s) => [s.name, s.address, s.postal_code, s.city, s.contact_name, s.contact_phone, s.unitCount]),
    [36, 46, 12, 22, 22, 16, 12])

  sheet('Équipements', ['Site', 'Zone', 'Repère', 'Famille', 'Type', 'Implantation', 'Marque', 'Année', 'Dernier contrôle', 'Notes'],
    unitsBySite.flatMap(({ site, units, zoneName }) => units.map((u) => [
      site.name,
      u.zone_id ? zoneName.get(u.zone_id) ?? '' : '',
      unitRepere(u),
      EQUIPMENT_FAMILY_LABELS[u.family],
      unitTypeLine(u) || u.subtype,
      u.implantation,
      u.brand,
      u.install_year,
      frDate(u.last_check_date),
      u.notes,
    ])),
    [30, 34, 10, 16, 30, 22, 14, 8, 16, 50])

  sheet('Visites', ['Date', 'Référence', 'Site', 'Équipements', 'Statut', 'Technicien', 'Résultat', 'Rapport PDF'],
    dossier.visits.map(({ intervention: i, report: r }) => [
      frDate(i.scheduled_date ?? i.created_at),
      i.reference,
      i.site_name,
      formatEquipmentTypes(i.equipment_types),
      INTERVENTION_STATUSES[i.status as InterventionStatus] ?? i.status,
      i.technician_name,
      !r?.completed_at ? (i.status === 'terminee' ? 'Historique importé' : '') : r.is_conform === true ? 'Conforme' : r.is_conform === false ? `Non conforme (${r.anomaly_count ?? 0} anomalie(s))` : 'Incomplet',
      r?.pdf_url ? 'oui' : '',
    ]),
    [12, 12, 34, 30, 14, 20, 26, 12])

  sheet('Devis et factures', ['Type', 'Référence', 'Date', 'Statut', 'Total TTC', 'Réglé'],
    [
      ...dossier.quotes.map((q) => ['Devis', q.reference, frDate(q.issue_date), QUOTE_STATUS_LABEL[q.status as QuoteStatus] ?? q.status, Number(q.total_ttc ?? 0), null]),
      ...dossier.invoices.map((f) => f.kind === 'credit_note'
        ? ['Avoir', f.reference, frDate(f.issue_date), f.status === 'draft' ? 'Brouillon' : 'Émis', -Number(f.total_ttc ?? 0), null]
        : ['Facture', f.reference, frDate(f.issue_date), INVOICE_STATUS_LABEL[f.status as InvoiceStatus] ?? f.status, Number(f.total_ttc ?? 0), Number(f.amount_paid ?? 0)]),
    ],
    [10, 18, 12, 16, 14, 14])

  sheet('Documents', ['Type', 'Titre', 'Date', 'Fichier'],
    dossier.documents.map((d) => [DOSSIER_DOCUMENT_LABELS[d.kind] ?? 'Document', d.title, frDate(d.document_date ?? d.created_at), d.file_name]),
    [18, 44, 12, 50])

  const files: Record<string, Uint8Array> = {}
  files['Sommaire.xlsx'] = new Uint8Array(await wb.xlsx.writeBuffer())

  // 2. Pièces : PDF, documents ajoutés, photos
  const items: Array<{ path: string; url: string }> = []
  const used = new Set<string>()
  const add = (folder: string, base: string, ext: string, url: string | null | undefined) => {
    if (!url || !/^https:\/\//.test(url)) return
    let name = `${folder}/${safeName(base)}.${ext}`
    for (let n = 2; used.has(name); n++) name = `${folder}/${safeName(base)} (${n}).${ext}`
    used.add(name)
    items.push({ path: name, url })
  }
  for (const { intervention: i, report: r } of dossier.visits) {
    add('1 - Rapports', [isoDay(r?.completed_at ?? i.scheduled_date), i.reference, i.site_name].filter(Boolean).join(' - '), 'pdf', r?.pdf_url)
  }
  for (const q of dossier.quotes) {
    add('2 - Devis', [q.reference, q.site_name].filter(Boolean).join(' - '), 'pdf', q.pdf_url)
    add('2 - Devis', `${q.reference} - Accusé de réception`, 'pdf', q.order_ack_pdf_url)
    for (const n of q.delivery_notes ?? []) add('2 - Devis', `${q.reference} - ${n.reference}`, 'pdf', n.pdf_url)
  }
  for (const f of dossier.invoices) add('3 - Factures', [f.reference, f.site_name].filter(Boolean).join(' - '), 'pdf', f.pdf_url)
  for (const d of dossier.documents) {
    const ext = extensionOf(d.file_url, 'pdf')
    add('4 - Documents', [isoDay(d.document_date), DOSSIER_DOCUMENT_LABELS[d.kind], d.title].filter(Boolean).join(' - '), ext, d.file_url)
  }
  for (const p of dossier.photos) {
    add('5 - Photos', [isoDay(p.date), p.reference, p.label].filter(Boolean).join(' - '), extensionOf(p.url, 'jpg'), p.url)
  }

  let failed = 0
  let next = 0
  let done = 0
  // Fichiers privés : liens temporaires demandés d'un coup
  const openable = await openableUrls(items.map((it) => it.url)).catch(() => new Map<string, string>())
  await Promise.all(Array.from({ length: 6 }, async () => {
    while (next < items.length) {
      const item = items[next++]!
      try {
        const res = await fetch(openable.get(item.url) ?? item.url)
        if (!res.ok) throw new Error(String(res.status))
        files[item.path] = new Uint8Array(await res.arrayBuffer())
      } catch {
        failed++
      }
      onProgress('Téléchargement des pièces', ++done, items.length)
    }
  }))

  // 3. ZIP
  onProgress('Création du fichier ZIP', 0, 1)
  const readme = [
    `Dossier ${dossier.number} — ${dossier.clients.map((c) => c.name).join(', ')}`,
    `${orgName} · exporté le ${format(new Date(), 'dd/MM/yyyy HH:mm')} avec Firovia`,
    '',
    'Contenu :',
    '- Sommaire.xlsx : le dossier, ses sites, ses équipements, ses visites, ses devis, ses factures et ses documents.',
    '- 1 - Rapports : les rapports d\'intervention (PDF).',
    '- 2 - Devis et 3 - Factures : les PDF.',
    '- 4 - Documents : bons de livraison, plans, PV, anciens rapports…',
    '- 5 - Photos : photos des contrôles et des anomalies.',
    failed > 0 ? `\nAttention : ${failed} fichier(s) n'ont pas pu être téléchargés (lien indisponible).` : '',
  ].join('\n')
  files['LISEZ-MOI.txt'] = new TextEncoder().encode(readme)

  const zipped = await new Promise<Uint8Array>((resolve, reject) => {
    // PDF, photos et xlsx sont déjà compressés : stockés sans recompresser
    zip(files, { level: 0 }, (err, out) => (err ? reject(err) : resolve(out)))
  })

  return {
    blob: new Blob([zipped as BlobPart], { type: 'application/zip' }),
    filename: `Dossier-${safeName(dossier.number).replace(/ /g, '-')}-${format(new Date(), 'yyyy-MM-dd')}.zip`,
    fileCount: items.length - failed,
    failed,
  }
}

/** Fait télécharger un fichier au navigateur */
export function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}

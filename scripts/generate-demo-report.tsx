/**
 * Génère un exemple de rapport PDF nominatif Firovia bien rempli
 * (3 familles APSAD : Extincteurs, RIA, Désenfumage) et l'écrit sur disque.
 *
 * Usage :
 *   cd /Users/macbookair/buildops-saas
 *   npx tsx scripts/generate-demo-report.tsx
 *
 * Sortie :
 *   /Users/macbookair/buildops-saas/scripts/out/rapport-demo-RPT-2026-DEMO-001.pdf
 */

import { renderToFile } from '@react-pdf/renderer'
import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import React from 'react'
import type { Anomaly } from '../src/features/anomalies/schemas'
import type { InvoicingSettings } from '../src/features/parametres/api'
import { CHECKLISTS } from '../src/features/rapports/checklists'
import type {
  AnomalyPdfEntry,
  ReportPdfSection,
  UnitReportEntry,
} from '../src/features/rapports/pdf/ReportPdf'
import { ReportPdf } from '../src/features/rapports/pdf/ReportPdf'
import type { ChecklistResponse, Report } from '../src/features/rapports/schemas'
import { encodeChecklistId } from '../src/features/rapports/schemas'
import type { Intervention } from '../src/features/planning/schemas'

// ─── Intervention factice ─────────────────────────────────────────────────

const intervention: Intervention = {
  id: 'demo-intervention',
  organization_id: 'demo-org',
  reference: 'INT-2026-DEMO-042',
  client_name: 'EHPAD Les Lavandes',
  client_id: 'demo-client',
  site_name: 'Maison de retraite — Aile principale',
  site_id: 'demo-site',
  address: '14 Rue du Mesnil, 14000 Caen',
  equipment_type: 'extincteurs',
  equipment_types: ['extincteurs', 'ria', 'desenfumage'],
  technician_name: 'Bernard Vincent',
  technician_id: 'demo-tech',
  scheduled_date: '2026-09-16T08:30:00+02:00',
  priority: 'reglementaire',
  status: 'terminee',
  notes: 'Contrôle annuel APSAD. Accès par entrée principale, badge fourni par le directeur.',
  created_at: '2026-08-20T09:00:00Z',
  created_by: null,
  parent_intervention_id: null,
  auto_generated: false,
  recurrence_active: true,
  chantier_address: '14 Rue du Mesnil',
  chantier_postal_code: '14000',
  chantier_city: 'Caen',
  chantier_contact_name: 'Mme Dupuis (directrice)',
  chantier_contact_phone: '02 31 45 67 89',
  chantier_access_parking: 'Parking visiteurs devant l\'accueil',
  chantier_access_digicode: 'A742B',
  chantier_access_building: 'Bâtiment principal, RDC',
  chantier_access_hours: '8h–18h en semaine',
  slot: 'matin',
  start_time: '2026-09-16T08:30:00+02:00',
  duration_minutes: 180,
  zone_ids: null,
  material_needed: ['Manomètre', 'Kit test RIA', 'Testeur détection'],
  recommendations:
    'Prévoir remplacement extincteur N°07 (péremption 2027) au prochain passage. RIA N°02 : décoller étiquette illisible.',
}

// ─── Helpers pour construire les responses ────────────────────────────────

function ok(id: string): ChecklistResponse {
  return { id, value: 'ok' }
}
function nok(
  id: string,
  action: 'replacement' | 'repair' | 'verification',
  note: string,
): ChecklistResponse {
  return { id, value: 'nok', action, note, photos: [], noPhotoReason: 'Photos jointes au dossier papier' }
}
function na(id: string, note?: string): ChecklistResponse {
  return { id, value: 'na', ...(note ? { note } : {}) }
}

// ─── Sections par famille ─────────────────────────────────────────────────

// NOK ciblés par ID d'item — robuste aux changements d'index dans les
// checklists (checklists v2 avec 15 items par famille au lieu de 5-8).
const extResponses: ChecklistResponse[] = CHECKLISTS.extincteurs.map((it) => {
  if (it.id === 'manometre') return nok(it.id, 'verification', 'Manomètre en limite haute de la zone verte, à revérifier au prochain passage.')
  if (it.id === 'date_epreuve') return nok(it.id, 'replacement', 'Épreuve décennale dépassée sur l\'extincteur N°07. À remplacer.')
  return ok(it.id)
})

const riaResponses: ChecklistResponse[] = CHECKLISTS.ria.map((it) => {
  if (it.id === 'raccord') return nok(it.id, 'repair', 'Raccord corrodé sur RIA N°02. Pas de fuite constatée.')
  return ok(it.id)
})

const desResponses: ChecklistResponse[] = CHECKLISTS.desenfumage.map((it) => {
  if (it.id === 'ventilateurs') return na(it.id, 'Ventilateurs non installés sur ce site (désenfumage naturel).')
  return ok(it.id)
})

const sections: ReportPdfSection[] = [
  {
    type: 'extincteurs',
    label: 'Extincteurs',
    items: CHECKLISTS.extincteurs,
    responses: extResponses,
  },
  {
    type: 'ria',
    label: 'RIA (Robinets d\'incendie armés)',
    items: CHECKLISTS.ria,
    responses: riaResponses,
  },
  {
    type: 'desenfumage',
    label: 'Désenfumage',
    items: CHECKLISTS.desenfumage,
    responses: desResponses,
  },
]

// Reconstruit le flat checklist stocké en base (avec préfixe type::id)
const flatChecklist: ChecklistResponse[] = [
  ...extResponses.map((r) => ({ ...r, id: encodeChecklistId('extincteurs', r.id) })),
  ...riaResponses.map((r) => ({ ...r, id: encodeChecklistId('ria', r.id) })),
  ...desResponses.map((r) => ({ ...r, id: encodeChecklistId('desenfumage', r.id) })),
]

// ─── Rapport factice ──────────────────────────────────────────────────────

const report: Report = {
  id: 'demo-report',
  intervention_id: intervention.id,
  organization_id: intervention.organization_id,
  equipment_type: 'extincteurs',
  checklist: flatChecklist,
  observations:
    'Contrôle semestriel effectué sur les extincteurs, RIA et désenfumage. ' +
    '3 anomalies constatées, détaillées ci-dessus avec échéance de traitement.',
  signed_by_name: 'Mme Dupuis',
  signature_data_url: null,
  photos: [],
  pdf_url: null,
  sent_to_email: null,
  sent_at: null,
  completed_at: '2026-09-16T11:15:00+02:00',
  created_at: '2026-09-16T08:35:00+02:00',
  updated_at: '2026-09-16T11:15:00+02:00',
}

// ─── Registre nominatif : 20 unités ───────────────────────────────────────

const unitEntries: UnitReportEntry[] = [
  // 12 extincteurs — RDC & 1er étage
  ...Array.from({ length: 12 }, (_, i): UnitReportEntry => {
    const n = i + 1
    const isReplace = n === 7
    const isWatch = n === 12
    const verdict: UnitReportEntry['verdict'] = isReplace
      ? 'reformer'
      : isWatch
        ? 'surveiller'
        : 'conforme'
    return {
      unitSerial: `EXT-${String(n).padStart(2, '0')}`,
      zoneName: n <= 6 ? 'RDC' : '1er étage',
      parentZone: n <= 6 ? 'Aile principale' : 'Aile principale',
      implantation:
        n === 1 ? 'Entrée principale, à gauche'
        : n === 2 ? 'Couloir accueil, face bureau directrice'
        : n === 3 ? 'Salle à manger, mur Est'
        : n === 4 ? 'Cuisine, à côté de la friteuse'
        : n === 5 ? 'Palier ascenseur RDC'
        : n === 6 ? 'Sortie de secours arrière'
        : n === 7 ? 'Palier ascenseur 1er'
        : n === 8 ? 'Couloir chambres, aile Est'
        : n === 9 ? 'Couloir chambres, aile Ouest'
        : n === 10 ? 'Local infirmerie'
        : n === 11 ? 'Salle commune 1er'
        : 'Escalier de secours 1er',
      familyLabel: 'Extincteurs',
      subtype: 'EPA 6L',
      brand: 'Andrieu',
      installYear: 2022,
      verdict,
      verdictLabel:
        verdict === 'conforme'
          ? 'Conforme'
          : verdict === 'surveiller'
            ? 'À surveiller'
            : 'À réformer',
      observation:
        isReplace
          ? 'Péremption 2024 dépassée — remplacement prévu.'
          : isWatch
            ? 'Manomètre proche zone rouge, revérifier sous 3 mois.'
            : null,
    }
  }),
  // 5 RIA
  ...Array.from({ length: 5 }, (_, i): UnitReportEntry => {
    const n = i + 1
    const isRepair = n === 2
    return {
      unitSerial: `RIA-${String(n).padStart(2, '0')}`,
      zoneName: n <= 3 ? 'RDC' : '1er étage',
      parentZone: 'Aile principale',
      implantation:
        n === 1 ? 'Hall d\'accueil, coffret mural'
        : n === 2 ? 'Couloir chambres RDC'
        : n === 3 ? 'Salle à manger, angle Nord-Est'
        : n === 4 ? 'Palier 1er étage'
        : 'Salle commune 1er',
      familyLabel: 'RIA',
      subtype: 'DN25',
      brand: 'Pons',
      installYear: 2019,
      verdict: isRepair ? 'surveiller' : 'conforme',
      verdictLabel: isRepair ? 'À surveiller' : 'Conforme',
      observation: isRepair ? 'Raccord corrodé, à changer.' : null,
    }
  }),
  // 3 trappes de désenfumage
  ...Array.from({ length: 3 }, (_, i): UnitReportEntry => {
    const n = i + 1
    return {
      unitSerial: `DES-${String(n).padStart(2, '0')}`,
      zoneName: 'Toiture',
      parentZone: 'Aile principale',
      implantation:
        n === 1 ? 'Cage d\'escalier centrale — exutoire'
        : n === 2 ? 'Couloir 1er étage — trappe désenfumage'
        : 'Salle commune 1er — trappe désenfumage',
      familyLabel: 'Désenfumage',
      subtype: 'Exutoire 1m²',
      brand: 'Colt',
      installYear: 2018,
      verdict: 'conforme',
      verdictLabel: 'Conforme',
      observation: null,
    }
  }),
]

// ─── Rendu PDF ────────────────────────────────────────────────────────────

// ─── Identité de l'entreprise intervenante (encart P0 #2) ─────────────────

const settings: InvoicingSettings = {
  organization_id: 'demo-org',
  legal_form: 'SARL',
  siret: '89231457800021',
  ape_code: '8010Z',
  vat_number: 'FR12892314578',
  capital: '10 000 €',
  legal_address: '18 rue de la Prévention',
  legal_city: 'Caen',
  legal_postal_code: '14000',
  legal_phone: '02 31 42 18 06',
  legal_email: 'contact@epi-prevention-demo.fr',
  iban: null,
  bic: null,
  bank_name: null,
  payment_terms: null,
  late_penalty_text: null,
  no_discount_text: null,
  logo_url: null,
  quote_prefix: null,
  invoice_prefix: null,
  updated_at: new Date().toISOString(),
}

// ─── Anomalies persistantes (Slice M6) ────────────────────────────────────

function makeAnomaly(overrides: Partial<Anomaly> & Pick<Anomaly, 'id' | 'title'>): Anomaly {
  return {
    id: overrides.id,
    organization_id: 'demo-org',
    equipment_unit_id: overrides.equipment_unit_id ?? null,
    intervention_id: intervention.id,
    equipment_check_id: null,
    title: overrides.title,
    description: overrides.description ?? null,
    checklist_item_id: overrides.checklist_item_id ?? null,
    checklist_item_label: overrides.checklist_item_label ?? null,
    action: overrides.action ?? null,
    priority: overrides.priority ?? 'normal',
    status: overrides.status ?? 'open',
    due_date: overrides.due_date ?? null,
    resolved_at: null,
    resolved_by: null,
    resolution_notes: null,
    photos: overrides.photos ?? [],
    detected_at: '2026-09-16T10:15:00+02:00',
    detected_by: null,
    detected_by_name: 'Bernard Vincent',
    created_at: '2026-09-16T10:15:00+02:00',
    updated_at: '2026-09-16T10:15:00+02:00',
    created_by: null,
  }
}

// Descriptions : uniquement factuelles. Aucune conclusion sur la gravité —
// c'est au technicien de renseigner un commentaire libre.
// Photos : placeholders Picsum (public, chargeable en Node). En prod, ce sont
// les vraies photos uploadées via UnitCheckModal (Slice #123).
const anomalyEntries: AnomalyPdfEntry[] = [
  {
    anomaly: makeAnomaly({
      id: 'anom-1',
      title: 'Épreuve décennale dépassée',
      description: 'Date de mise en service : 2015. Réforme requise.',
      checklist_item_label: "Épreuve décennale à jour (à réformer à 10 ans si eau/pré-mélange)",
      action: 'replacement',
      priority: 'high',
      due_date: '2026-10-31',
      photos: [
        { path: 'demo/anom-1-01.jpg', url: 'https://picsum.photos/seed/firovia-anom-1/240/240' },
      ],
    }),
    unitSerial: '07',
    unitFamilyLabel: 'Extincteurs',
    unitSubtype: 'EPA 6L',
    unitImplantation: 'Palier ascenseur 1er étage',
    unitZoneName: '1er étage',
  },
  {
    anomaly: makeAnomaly({
      id: 'anom-2',
      title: 'Manomètre en limite haute de la zone verte',
      description: 'À revérifier au prochain passage.',
      checklist_item_label: 'Manomètre en zone verte (pression conforme)',
      action: 'verification',
      priority: 'normal',
      due_date: '2026-12-16',
      photos: [
        { path: 'demo/anom-2-01.jpg', url: 'https://picsum.photos/seed/firovia-anom-2/240/240' },
      ],
    }),
    unitSerial: '12',
    unitFamilyLabel: 'Extincteurs',
    unitSubtype: 'EPA 6L',
    unitImplantation: 'Escalier de secours 1er',
    unitZoneName: '1er étage',
  },
  {
    anomaly: makeAnomaly({
      id: 'anom-3',
      title: 'Raccord corrodé',
      description: 'Corrosion visible côté RIA. Pas de fuite constatée.',
      checklist_item_label: 'Raccord robinet-tuyau étanche, joints en état',
      action: 'repair',
      priority: 'normal',
      due_date: '2026-09-30',
      photos: [
        { path: 'demo/anom-3-01.jpg', url: 'https://picsum.photos/seed/firovia-anom-3/240/240' },
        { path: 'demo/anom-3-02.jpg', url: 'https://picsum.photos/seed/firovia-anom-3b/240/240' },
      ],
    }),
    unitSerial: '02',
    unitFamilyLabel: 'RIA',
    unitSubtype: 'DN25',
    unitImplantation: 'Couloir chambres RDC',
    unitZoneName: 'RDC',
  },
]

// ─── Rendu PDF ────────────────────────────────────────────────────────────

async function main() {
  const outDir = resolve(process.cwd(), 'scripts/out')
  await mkdir(outDir, { recursive: true })
  const outPath = resolve(outDir, `rapport-demo-${intervention.reference}.pdf`)

  await renderToFile(
    <ReportPdf
      intervention={intervention}
      report={report}
      sections={sections}
      organizationName="SARL EPI Prévention"
      unitEntries={unitEntries}
      settings={settings}
      anomalyEntries={anomalyEntries}
      interventionType="Maintenance préventive"
      nextInterventionDate="2027-03-16"
    />,
    outPath,
  )

  console.log(`✅ PDF généré : ${outPath}`)
}

main().catch((err) => {
  console.error('❌ Erreur génération PDF :', err)
  process.exit(1)
})

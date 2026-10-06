/**
 * Données de démonstration : un compte « vivant » pour une démo commerciale
 * ou un essai, créé en une à deux minutes avec les fonctions de l'app.
 *
 * Crée :
 * - 11 clients, chacun avec son site, ses zones et son parc (~100 équipements)
 * - 4 techniciens (secteurs, habilitations dont une à renouveler) et 2 véhicules
 * - 3 rapports signés avec PDF, dont un non conforme avec 2 anomalies
 * - le planning de la semaine : visites planifiées, une en cours, une sans rapport
 * - des visites à planifier et des échéances proches ou dépassées (Alertes)
 * - 3 devis, des factures payées sur 6 mois, une en attente, une en retard
 * - notes de frais, heures sup, 2 événements d'agenda et un lien portail client
 *
 * Les emails des contacts sont en @demo.firovia.fr (domaine sans boîte mail) :
 * pour un envoi pendant une démo, saisir sa propre adresse dans la modale.
 */

import { createAnomaly } from '../anomalies/api'
import type { AnomalyAction, AnomalyPriority } from '../anomalies/schemas'
import { createClient } from '../clients/api'
import type { Client } from '../clients/schemas'
import { createInvoice, markInvoiceSent, recordPayment } from '../factures/api'
import { createQuote, markQuoteAccepted, markQuoteSent } from '../devis/api'
import {
  batchCreateEquipmentUnits,
  createSite,
  createZone,
  getFamilyTemplate,
  upsertCheck,
} from '../equipment/api'
import type {
  CheckItemValue,
  CheckVerdict,
  EquipmentFamily,
  EquipmentUnit,
  FamilyTemplate,
  Site,
} from '../equipment/schemas'
import { createExpense } from '../expenses/api'
import { createOvertime } from '../overtime/api'
import { createPlanningEvent } from '../planning/blocksApi'
import { createIntervention, setInterventionStatus } from '../planning/api'
import type { Intervention } from '../planning/schemas'
import { createClientToken } from '../portail/api'
import { finalizeReport, setReportConformity } from '../rapports/api'
import { computeConformity } from '../rapports/conformity'
import { generateReportPdfForIntervention } from '../rapports/pdf/buildReportPdf'
import { createCertification } from '../technicians/certificationsApi'
import { createTechnician, listTechnicians } from '../technicians/api'
import type { Technician } from '../technicians/schemas'
import { createVehicle } from '../vehicles/api'
import { supabase } from '../../shared/lib/supabase'
import type { EquipmentType } from '../../shared/constants/interventions'

// ─── Dates ────────────────────────────────────────────────────────

function fmt(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

function daysFromToday(n: number): string {
  const d = new Date()
  d.setHours(12, 0, 0, 0)
  d.setDate(d.getDate() + n)
  return fmt(d)
}

/** n jours ouvrés après aujourd'hui (négatif = avant). Le week-end compte comme le lundi suivant. */
function businessDay(n: number): string {
  const d = new Date()
  d.setHours(12, 0, 0, 0)
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1)
  const step = n < 0 ? -1 : 1
  let left = Math.abs(n)
  while (left > 0) {
    d.setDate(d.getDate() + step)
    if (d.getDay() !== 0 && d.getDay() !== 6) left--
  }
  return fmt(d)
}

/** Jour `day` du mois situé `months` mois avant le mois courant */
function monthsAgo(months: number, day: number): string {
  const d = new Date()
  d.setHours(12, 0, 0, 0)
  d.setDate(1)
  d.setMonth(d.getMonth() - months)
  d.setDate(day)
  return fmt(d)
}

function frDate(iso: string): string {
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

// ─── Parc d'équipements ───────────────────────────────────────────

type UnitSpec = {
  family: EquipmentFamily
  subtype: string
  zone: string
  implantation: string
  brand: string
  year: number
}

const EXT_KINDS = {
  eau6: { subtype: 'Eau pulvérisée + additif 6 L', brand: 'Sicli' },
  eau9: { subtype: 'Eau pulvérisée + additif 9 L', brand: 'Sicli' },
  co2: { subtype: 'CO2 2 kg', brand: 'Desautel' },
  poudre: { subtype: 'Poudre ABC 6 kg', brand: 'Andrieu' },
} as const

const ext = (zone: string, implantation: string, kind: keyof typeof EXT_KINDS, year: number): UnitSpec =>
  ({ family: 'extincteurs', ...EXT_KINDS[kind], zone, implantation, year })
const ria = (zone: string, implantation: string, year: number): UnitSpec =>
  ({ family: 'ria', subtype: 'RIA DN 25/8 — 30 m', brand: 'Eurofeu', zone, implantation, year })
const baes = (zone: string, implantation: string, year: number): UnitSpec =>
  ({ family: 'baes', subtype: 'BAES évacuation 45 lm', brand: 'Legrand', zone, implantation, year })
const denfc = (zone: string, implantation: string, year: number): UnitSpec =>
  ({ family: 'desenfumage', subtype: 'Exutoire de désenfumage (DENFC)', brand: 'Souchier', zone, implantation, year })
const porteCf = (zone: string, implantation: string, year: number): UnitSpec =>
  ({ family: 'portes_cf', subtype: 'Porte coupe-feu EI 30 à fermeture automatique', brand: 'Malerba', zone, implantation, year })

type ClientSpec = {
  key: string
  name: string
  contact_name: string
  contact_email: string
  contact_phone: string
  site: {
    name: string
    address: string
    postal_code: string
    city: string
    contact_name: string
    contact_phone: string
    access_notes?: string
    zones: string[]
    units: UnitSpec[]
  }
}

const CLIENTS: ClientSpec[] = [
  {
    key: 'tilleuls', name: 'Résidence Les Tilleuls', contact_name: 'M. Durand',
    contact_email: 'gardien@residence-tilleuls.demo.firovia.fr', contact_phone: '01 39 50 12 40',
    site: {
      name: 'Résidence Les Tilleuls — Bât. A', address: '14 allée des Tilleuls', postal_code: '78000', city: 'Versailles',
      contact_name: 'M. Durand (gardien)', contact_phone: '06 12 40 33 18', access_notes: 'Badge à récupérer à la loge. Parking visiteurs au sous-sol.',
      zones: ['Hall RDC', '1er étage', '2e étage', 'Sous-sol parking', 'Local technique'],
      units: [
        ext('Hall RDC', "Hall d'entrée, à droite de l'ascenseur", 'eau6', 2019),
        ext('1er étage', 'Palier, face à l\'escalier', 'eau6', 2018),
        ext('2e étage', 'Palier, face à l\'escalier', 'eau6', 2018),
        ext('Sous-sol parking', "Rampe d'accès", 'poudre', 2017),
        ext('Sous-sol parking', 'Pilier B3, place 24', 'poudre', 2017),
        ext('Sous-sol parking', 'Local poubelles', 'eau9', 2020),
        ext('Local technique', 'Près du TGBT', 'co2', 2021),
        ext('Local technique', 'Chaufferie, porte d\'entrée', 'co2', 2016),
        ria('Hall RDC', "Sous l'escalier", 2015),
        ria('Sous-sol parking', 'Pilier B1', 2015),
        baes('Hall RDC', 'Au-dessus de la porte d\'entrée', 2019),
        baes('1er étage', 'Sortie escalier', 2019),
        baes('2e étage', 'Sortie escalier', 2019),
        baes('Sous-sol parking', 'Sortie piétons', 2019),
        denfc('2e étage', "Cage d'escalier, exutoire en toiture", 2014),
      ],
    },
  },
  {
    key: 'stjean', name: 'Clinique Saint-Jean', contact_name: 'Mme Dubois',
    contact_email: 'services.techniques@clinique-stjean.demo.firovia.fr', contact_phone: '01 46 10 22 80',
    site: {
      name: 'Clinique Saint-Jean', address: '32 avenue de Paris', postal_code: '92100', city: 'Boulogne-Billancourt',
      contact_name: 'Mme Dubois (services techniques)', contact_phone: '06 20 14 87 52', access_notes: "Se présenter à l'accueil principal, accès bloc sur accompagnement.",
      zones: ['Accueil', 'Bloc A', 'Bloc B', 'Cuisine', 'Local technique'],
      units: [
        ext('Accueil', "Hall d'accueil, près des ascenseurs", 'eau6', 2020),
        ext('Accueil', 'Salle d\'attente', 'eau6', 2020),
        ext('Bloc A', 'Couloir, côté chambres 101-110', 'eau6', 2019),
        ext('Bloc A', 'Poste de soins', 'co2', 2019),
        ext('Bloc B', 'Couloir, côté chambres 201-210', 'eau6', 2021),
        ext('Bloc B', 'Salle de pause', 'eau6', 2021),
        ext('Cuisine', 'Près des friteuses', 'co2', 2018),
        ext('Cuisine', 'Réserve', 'eau9', 2018),
        ext('Local technique', 'Près du TGBT', 'co2', 2017),
        ext('Local technique', 'Groupe électrogène', 'poudre', 2017),
        ria('Bloc A', 'Couloir central', 2016),
        ria('Bloc B', 'Couloir central', 2016),
        ria('Accueil', 'Près de l\'escalier principal', 2016),
        baes('Accueil', 'Sortie principale', 2020),
        baes('Bloc A', 'Issue de secours est', 2020),
        baes('Bloc B', 'Issue de secours ouest', 2020),
      ],
    },
  },
  {
    key: 'beausejour', name: 'Hôtel Beauséjour', contact_name: 'M. Petit',
    contact_email: 'direction@hotel-beausejour.demo.firovia.fr', contact_phone: '01 34 51 70 20',
    site: {
      name: 'Hôtel Beauséjour', address: '5 rue de la Gare', postal_code: '78100', city: 'Saint-Germain-en-Laye',
      contact_name: 'M. Petit (directeur)', contact_phone: '06 31 72 45 09', access_notes: 'Intervention de préférence avant 11 h (ménage des chambres ensuite).',
      zones: ['Réception', 'Étage 1', 'Étage 2', 'Cuisine', 'Parking'],
      units: [
        ext('Réception', 'Derrière le comptoir', 'eau6', 2019),
        ext('Réception', 'Salon, près de la cheminée', 'eau6', 2019),
        ext('Étage 1', 'Couloir, côté chambres 101-108', 'eau6', 2018),
        ext('Étage 1', 'Local linge', 'eau9', 2004),
        ext('Étage 2', 'Couloir, côté chambres 201-208', 'eau6', 2018),
        ext('Cuisine', 'Près du piano', 'co2', 2020),
        ext('Cuisine', 'Plonge', 'eau6', 2016),
        ext('Parking', 'Entrée parking', 'poudre', 2017),
        ext('Parking', 'Local technique parking', 'co2', 2017),
        ria('Étage 1', 'Palier central', 2012),
        ria('Parking', 'Pilier P2', 2012),
        baes('Réception', 'Sortie principale', 2019),
        baes('Étage 1', 'Escalier de secours', 2019),
        baes('Étage 2', 'Escalier de secours', 2019),
      ],
    },
  },
  {
    key: 'montaigne', name: 'Collège Montaigne', contact_name: 'M. Garnier',
    contact_email: 'intendance@college-montaigne.demo.firovia.fr', contact_phone: '01 39 72 18 60',
    site: {
      name: 'Collège Montaigne', address: '12 rue Montaigne', postal_code: '78700', city: 'Conflans-Sainte-Honorine',
      contact_name: 'M. Garnier (intendant)', contact_phone: '06 44 18 92 37', access_notes: 'Interventions hors temps scolaire de préférence (mercredi après-midi).',
      zones: ['Bâtiment A', 'Bâtiment B', 'Gymnase', 'Cantine'],
      units: [
        ext('Bâtiment A', 'Couloir RDC, près salle A01', 'eau6', 2019),
        ext('Bâtiment A', 'Couloir 1er étage', 'eau6', 2019),
        ext('Bâtiment A', 'Salle informatique', 'co2', 2020),
        ext('Bâtiment B', 'Couloir RDC', 'eau6', 2018),
        ext('Bâtiment B', 'Laboratoire de sciences', 'co2', 2018),
        ext('Bâtiment B', 'CDI', 'eau6', 2021),
        ext('Gymnase', 'Entrée vestiaires', 'eau6', 2017),
        ext('Gymnase', 'Local matériel', 'eau6', 2017),
        ext('Cantine', 'Cuisine, près des fours', 'co2', 2019),
        ext('Cantine', 'Salle de restauration', 'eau6', 2019),
        denfc('Bâtiment A', "Cage d'escalier", 2013),
        denfc('Gymnase', 'Toiture du gymnase', 2013),
        porteCf('Bâtiment A', 'Recoupement couloir RDC', 2015),
        porteCf('Bâtiment B', 'Recoupement couloir RDC', 2015),
      ],
    },
  },
  {
    key: 'lilas', name: 'EHPAD Les Lilas', contact_name: 'Mme Roussel',
    contact_email: 'administration@ehpad-leslilas.demo.firovia.fr', contact_phone: '01 47 08 33 90',
    site: {
      name: 'EHPAD Les Lilas', address: '8 rue des Lilas', postal_code: '92500', city: 'Rueil-Malmaison',
      contact_name: 'Mme Roussel (direction)', contact_phone: '06 51 20 64 13', access_notes: "Signaler sa présence à l'infirmerie avant toute intervention dans les ailes.",
      zones: ['Accueil', 'Aile Nord', 'Aile Sud', 'Cuisine'],
      units: [
        ext('Accueil', 'Hall', 'eau6', 2020),
        ext('Aile Nord', 'Couloir, chambres 1-12', 'eau6', 2020),
        ext('Aile Nord', 'Salle commune', 'eau6', 2020),
        ext('Aile Sud', 'Couloir, chambres 13-24', 'eau6', 2019),
        ext('Aile Sud', 'Infirmerie', 'co2', 2019),
        ext('Cuisine', 'Près des fours', 'co2', 2018),
        ext('Cuisine', 'Réserve', 'eau6', 2018),
        ext('Accueil', 'Local technique', 'co2', 2017),
        ria('Aile Nord', 'Couloir central', 2014),
        ria('Aile Sud', 'Couloir central', 2014),
      ],
    },
  },
  {
    key: 'parc', name: 'Résidence Le Parc', contact_name: 'Mme Lefèvre',
    contact_email: 'syndic@residence-leparc.demo.firovia.fr', contact_phone: '01 30 15 48 20',
    site: {
      name: 'Résidence Le Parc', address: '2 avenue du Parc', postal_code: '78110', city: 'Le Vésinet',
      contact_name: 'Mme Lefèvre (conseil syndical)', contact_phone: '06 72 30 81 46',
      zones: ['Hall', 'Étages', 'Parking'],
      units: [
        ext('Hall', "Hall d'entrée", 'eau6', 2019),
        ext('Étages', 'Palier 1er étage', 'eau6', 2019),
        ext('Étages', 'Palier 2e étage', 'eau6', 2019),
        ext('Étages', 'Palier 3e étage', 'eau6', 2019),
        ext('Parking', "Rampe d'accès", 'poudre', 2018),
        ext('Parking', 'Local vélos', 'eau6', 2018),
        baes('Hall', 'Sortie principale', 2019),
        baes('Parking', 'Sortie piétons', 2019),
      ],
    },
  },
  {
    key: 'garage', name: 'Garage Central', contact_name: 'M. Renaud',
    contact_email: 'atelier@garage-central.demo.firovia.fr', contact_phone: '01 34 22 15 60',
    site: {
      name: 'Garage Central', address: '45 avenue de la République', postal_code: '95000', city: 'Cergy',
      contact_name: 'M. Renaud (gérant)', contact_phone: '06 18 47 25 90',
      zones: ['Atelier', 'Magasin', 'Bureau'],
      units: [
        ext('Atelier', 'Pont élévateur n°1', 'poudre', 2018),
        ext('Atelier', 'Pont élévateur n°2', 'poudre', 2018),
        ext('Atelier', 'Zone peinture', 'co2', 2019),
        ext('Magasin', 'Rayonnage pneus', 'eau6', 2020),
        ext('Bureau', 'Accueil clients', 'co2', 2020),
      ],
    },
  },
  {
    key: 'pasteur', name: 'Cabinet médical Pasteur', contact_name: 'Dr Morel',
    contact_email: 'secretariat@cabinet-pasteur.demo.firovia.fr', contact_phone: '01 34 77 20 15',
    site: {
      name: 'Cabinet médical Pasteur', address: '3 place Pasteur', postal_code: '78200', city: 'Mantes-la-Jolie',
      contact_name: 'Mme Caron (secrétariat)', contact_phone: '01 34 77 20 15',
      zones: ['Accueil', 'Cabinets'],
      units: [
        ext('Accueil', "Salle d'attente", 'eau6', 2017),
        ext('Cabinets', 'Couloir', 'eau6', 2017),
        ext('Cabinets', 'Local archives', 'co2', 2017),
      ],
    },
  },
  {
    key: 'moulin', name: 'Lycée Jean Moulin', contact_name: 'M. Fontaine',
    contact_email: 'gestion@lycee-jeanmoulin.demo.firovia.fr', contact_phone: '01 39 61 44 70',
    site: {
      name: 'Lycée Jean Moulin', address: '20 avenue Jean Moulin', postal_code: '95100', city: 'Argenteuil',
      contact_name: 'M. Fontaine (gestionnaire)', contact_phone: '06 25 81 39 74',
      zones: ['Bâtiment principal', 'Ateliers'],
      units: [
        denfc('Bâtiment principal', 'Escalier nord', 2012),
        denfc('Bâtiment principal', 'Escalier sud', 2012),
        denfc('Ateliers', 'Toiture des ateliers', 2015),
      ],
    },
  },
  {
    key: 'creche', name: 'Crèche Pré Fleuri', contact_name: 'Mme Garcia',
    contact_email: 'direction@creche-prefleuri.demo.firovia.fr', contact_phone: '01 30 71 25 40',
    site: {
      name: 'Crèche Pré Fleuri', address: '10 rue des Écoles', postal_code: '78400', city: 'Chatou',
      contact_name: 'Mme Garcia (directrice)', contact_phone: '06 40 12 58 33', access_notes: 'Intervention pendant la sieste (13 h - 15 h) de préférence.',
      zones: ['Accueil', 'Salles de vie', 'Cuisine'],
      units: [
        ext('Accueil', 'Entrée', 'eau6', 2021),
        ext('Salles de vie', 'Couloir', 'eau6', 2021),
        ext('Cuisine', 'Biberonnerie', 'co2', 2021),
      ],
    },
  },
  {
    key: 'entrepot', name: 'Logistique Martin', contact_name: 'M. Martin',
    contact_email: 'exploitation@logistique-martin.demo.firovia.fr', contact_phone: '01 34 40 62 10',
    site: {
      name: 'Entrepôt ZI Nord', address: "12 rue de l'Industrie", postal_code: '95300', city: 'Pontoise',
      contact_name: 'M. Martin (responsable de site)', contact_phone: '06 33 70 41 28', access_notes: 'Gilet haute visibilité obligatoire sur les quais.',
      zones: ['Quais', 'Stockage', 'Bureaux'],
      units: [
        ext('Quais', 'Quai 1', 'poudre', 2018),
        ext('Quais', 'Quai 4', 'poudre', 2018),
        ext('Stockage', 'Allée C', 'eau9', 2019),
        ext('Stockage', 'Local de charge des chariots', 'co2', 2019),
        ext('Bureaux', 'Couloir', 'eau6', 2020),
        ext('Bureaux', 'Salle serveur', 'co2', 2020),
      ],
    },
  },
]

const TECHS = [
  { first_name: 'Julien', last_name: 'Moreau', role: "Chef d'équipe", sector: 'Yvelines', email: 'julien.moreau@demo.firovia.fr', phone: '06 12 34 56 78' },
  { first_name: 'Sophie', last_name: 'Laurent', role: 'Technicienne', sector: 'Hauts-de-Seine', email: 'sophie.laurent@demo.firovia.fr', phone: '06 23 45 67 89' },
  { first_name: 'Karim', last_name: 'Benali', role: 'Technicien', sector: 'Yvelines', email: 'karim.benali@demo.firovia.fr', phone: '06 34 56 78 90' },
  { first_name: 'Thomas', last_name: 'Robert', role: 'Technicien', sector: "Val-d'Oise", email: 'thomas.robert@demo.firovia.fr', phone: '06 45 67 89 01' },
]

/** Famille d'équipement contrôlée pour chaque type d'intervention */
const TYPE_TO_FAMILY: Partial<Record<EquipmentType, EquipmentFamily>> = {
  extincteurs: 'extincteurs',
  ria: 'ria',
  desenfumage: 'desenfumage',
  ssi: 'detection',
}

/** Signature manuscrite factice (PNG), dessinée sur un canvas */
function drawSignature(seed: number): string | null {
  if (typeof document === 'undefined') return null
  const canvas = document.createElement('canvas')
  canvas.width = 360
  canvas.height = 120
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  let s = seed
  const rnd = () => {
    s = (s * 9301 + 49297) % 233280
    return s / 233280
  }
  ctx.strokeStyle = '#1C2130'
  ctx.lineWidth = 2.6
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  let x = 30
  let y = 75
  ctx.beginPath()
  ctx.moveTo(x, y)
  for (let i = 0; i < 8; i++) {
    const nx = x + 28 + rnd() * 14
    const ny = 35 + rnd() * 55
    ctx.bezierCurveTo(x + 8, y - 45 * rnd(), nx - 8, ny + 45 * rnd(), nx, ny)
    x = nx
    y = ny
  }
  ctx.stroke()
  return canvas.toDataURL('image/png')
}

export type DemoProgressUpdate = (step: string, current: number, total: number) => void

// 11 clients + techniciens + habilitations + 3 × (rapport, PDF) + échéances
// + planning + devis + factures + frais + agenda
const TOTAL_STEPS = 25

export async function loadDemoData(
  organizationId: string,
  organizationName: string,
  onProgress?: DemoProgressUpdate,
): Promise<void> {
  let step = 0
  const tick = (label: string) => {
    step = Math.min(step + 1, TOTAL_STEPS)
    onProgress?.(label, step, TOTAL_STEPS)
  }

  // Garde : ne charge pas deux fois le même jeu de données
  const { data: already } = await supabase
    .from('clients')
    .select('id')
    .eq('name', 'Clinique Saint-Jean')
    .limit(1)
  if (already && already.length > 0) {
    throw new Error('Les données de démo sont déjà chargées dans ce compte.')
  }

  // ─── 1. Clients, sites, zones et parc ──────────────────────────
  type Loaded = { spec: ClientSpec; client: Client; site: Site; units: EquipmentUnit[] }
  const byKey = new Map<string, Loaded>()
  for (const spec of CLIENTS) {
    const fullAddress = `${spec.site.address}, ${spec.site.postal_code} ${spec.site.city}`
    const client = await createClient(
      {
        name: spec.name,
        contact_name: spec.contact_name,
        contact_email: spec.contact_email,
        contact_phone: spec.contact_phone,
        address: fullAddress,
      },
      organizationId,
    )
    const site = await createSite(
      {
        client_id: client.id,
        name: spec.site.name,
        address: spec.site.address,
        postal_code: spec.site.postal_code,
        city: spec.site.city,
        contact_name: spec.site.contact_name,
        contact_phone: spec.site.contact_phone,
        access_notes: spec.site.access_notes,
      },
      organizationId,
    )
    const zoneIds = new Map<string, string>()
    for (const [i, name] of spec.site.zones.entries()) {
      const zone = await createZone({ site_id: site.id, name, display_order: i }, organizationId)
      zoneIds.set(name, zone.id)
    }
    const serials = new Map<EquipmentFamily, number>()
    const units = await batchCreateEquipmentUnits(
      spec.site.units.map((u) => {
        const n = (serials.get(u.family) ?? 0) + 1
        serials.set(u.family, n)
        return {
          client_id: client.id,
          site_id: site.id,
          zone_id: zoneIds.get(u.zone),
          family: u.family,
          subtype: u.subtype,
          serial_number: String(n).padStart(2, '0'),
          implantation: u.implantation,
          brand: u.brand,
          install_year: u.year,
          status: 'active' as const,
        }
      }),
      organizationId,
    )
    byKey.set(spec.key, { spec, client, site, units })
    tick(`Client et parc : ${spec.name}`)
  }
  const get = (key: string): Loaded => {
    const l = byKey.get(key)
    if (!l) throw new Error(`Client de démo introuvable : ${key}`)
    return l
  }

  // ─── 2. Techniciens (dans la limite de la formule), habilitations, véhicules ──
  const techs: Technician[] = []
  for (const t of TECHS) {
    try {
      techs.push(await createTechnician(t, organizationId))
    } catch (e) {
      console.warn('[démo] technicien non créé (limite de la formule ?)', e)
      break
    }
  }
  if (techs.length < TECHS.length) {
    const existing = (await listTechnicians()).filter((t) => t.active && !techs.some((x) => x.id === t.id))
    techs.push(...existing.slice(0, TECHS.length - techs.length))
  }
  if (techs.length === 0) {
    throw new Error('Impossible de créer les techniciens de démo (limite de techniciens de la formule atteinte ?).')
  }
  const tech = (i: number) => techs[i % techs.length]!
  const techName = (t: Technician) => `${t.first_name} ${t.last_name}`
  tick('Techniciens')

  const certifications = [
    { tech: 0, name: 'Habilitation électrique BR', issuing_body: 'APAVE', issued: -1075, expires: 20 },
    { tech: 0, name: 'Formation maintenance extincteurs (APSAD R4)', issuing_body: 'CNPP', issued: -400, expires: 695 },
    { tech: 1, name: 'Habilitation électrique BR', issuing_body: 'APAVE', issued: -800, expires: 295 },
    { tech: 2, name: 'Travail en hauteur', issuing_body: 'AFPA', issued: -1105, expires: -10 },
    { tech: 3, name: 'Habilitation électrique BS', issuing_body: 'Bureau Veritas', issued: -900, expires: 195 },
  ]
  for (const c of certifications) {
    await createCertification(organizationId, tech(c.tech).id, {
      name: c.name,
      issuing_body: c.issuing_body,
      issued_at: daysFromToday(c.issued),
      expires_at: daysFromToday(c.expires),
    })
  }
  await createVehicle(
    {
      license_plate: 'GH-417-KT', brand: 'Renault', model: 'Kangoo', year: 2022, mileage: 35000,
      technician_id: tech(0).id,
      next_mot_date: daysFromToday(45), next_insurance_date: daysFromToday(120), next_service_date: daysFromToday(12),
    },
    organizationId,
  )
  await createVehicle(
    {
      license_plate: 'FR-228-LB', brand: 'Peugeot', model: 'Partner', year: 2021, mileage: 58000,
      technician_id: tech(1).id,
      next_mot_date: daysFromToday(180), next_insurance_date: daysFromToday(240), next_service_date: daysFromToday(60),
    },
    organizationId,
  )
  tick('Habilitations et véhicules')

  // ─── 3. Rapports signés (dont un non conforme) ─────────────────
  const templates = new Map<EquipmentFamily, FamilyTemplate | null>()
  async function templateFor(family: EquipmentFamily) {
    if (!templates.has(family)) templates.set(family, await getFamilyTemplate(family).catch(() => null))
    return templates.get(family) ?? null
  }

  type AnomalySpec = {
    family: EquipmentFamily
    serial: string
    verdict: Extract<CheckVerdict, 'surveiller' | 'reformer'>
    title: string
    observation: string
    action: AnomalyAction
    priority: AnomalyPriority
    dueInDays: number
  }
  type ReportSpec = {
    key: string
    types: EquipmentType[]
    date: string
    tech: number
    start: string
    duration: number
    signedBy: string
    observations: string
    anomalies: AnomalySpec[]
  }

  const reportSpecs: ReportSpec[] = [
    {
      key: 'montaigne', types: ['extincteurs', 'desenfumage'], date: businessDay(-6), tech: 0, start: '13:30', duration: 210,
      signedBy: 'M. Garnier',
      observations: 'Visite annuelle réalisée. Exutoires testés en ouverture et en fermeture, aucune anomalie.',
      anomalies: [],
    },
    {
      key: 'stjean', types: ['extincteurs', 'ria'], date: businessDay(-2), tech: 1, start: '08:30', duration: 180,
      signedBy: 'Mme Dubois',
      observations: 'Visite annuelle réalisée. Tous les équipements contrôlés sont conformes.',
      anomalies: [],
    },
    {
      key: 'beausejour', types: ['extincteurs'], date: businessDay(-1), tech: 2, start: '09:00', duration: 150,
      signedBy: 'M. Petit',
      observations: 'Deux anomalies relevées : un extincteur à réformer (durée de vie dépassée) et une goupille manquante. Devis de remplacement à transmettre.',
      anomalies: [
        {
          family: 'extincteurs', serial: '04', verdict: 'reformer',
          title: 'Durée de vie dépassée (fabrication 2004)',
          observation: 'Appareil fabriqué en 2004 : à remplacer.',
          action: 'replacement', priority: 'high', dueInDays: 15,
        },
        {
          family: 'extincteurs', serial: '07', verdict: 'surveiller',
          title: 'Goupille et scellé manquants',
          observation: 'Goupille absente, appareil non plombé.',
          action: 'repair', priority: 'normal', dueInDays: 30,
        },
      ],
    },
  ]

  const finishedInterventions: Intervention[] = []
  for (const [index, r] of reportSpecs.entries()) {
    const { client, site, units } = get(r.key)
    const t = tech(r.tech)
    const interv = await createIntervention(
      {
        client_name: client.name,
        client_id: client.id,
        site_name: site.name,
        site_id: site.id,
        address: `${site.address}, ${site.postal_code} ${site.city}`,
        equipment_types: r.types,
        scheduled_date: r.date,
        start_time: r.start,
        duration_minutes: r.duration,
        technician_id: t.id,
        technician_name: techName(t),
        priority: 'reglementaire',
        intervention_type: 'preventive',
        notes: 'Visite annuelle',
      },
      organizationId,
    )
    finishedInterventions.push(interv)

    // Contrôles équipement par équipement
    const families = new Set(r.types.map((ty) => TYPE_TO_FAMILY[ty]).filter(Boolean))
    const verdicts: CheckVerdict[] = []
    for (const u of units.filter((x) => families.has(x.family))) {
      const anomaly = r.anomalies.find((a) => a.family === u.family && a.serial === u.serial_number)
      const verdict: CheckVerdict = anomaly?.verdict ?? 'conforme'
      const template = await templateFor(u.family)
      const checklist: Record<string, CheckItemValue> = {}
      for (const item of template?.checklist ?? []) checklist[item.id] = 'ok'
      await upsertCheck(
        {
          intervention_id: interv.id,
          equipment_unit_id: u.id,
          family_template_id: template?.id ?? null,
          checklist,
          observation: anomaly?.observation ?? null,
          verdict,
          photos: [],
        },
        organizationId,
        { updateUnitStatus: false, technicianId: t.id, technicianName: techName(t) },
      )
      verdicts.push(verdict)
      await supabase
        .from('equipment_units')
        .update({
          last_check_date: r.date,
          status: verdict === 'reformer' ? 'to_replace' : verdict === 'surveiller' ? 'to_watch' : 'active',
        })
        .eq('id', u.id)
      if (anomaly) {
        await createAnomaly(
          {
            equipment_unit_id: u.id,
            intervention_id: interv.id,
            equipment_check_id: null,
            title: anomaly.title,
            description: anomaly.observation,
            action: anomaly.action,
            priority: anomaly.priority,
            due_date: daysFromToday(anomaly.dueInDays),
            photos: [],
            detected_by_name: techName(t),
          },
          organizationId,
          { name: techName(t) },
        )
      }
    }

    // Rapport signé puis finalisé (crée aussi la visite de l'an prochain)
    const report = await finalizeReport(interv.id, organizationId, {
      checklist: [],
      equipment_type: r.types[0],
      observations: r.observations,
      signed_by_name: r.signedBy,
      signature_data_url: drawSignature(index * 7919 + 1013),
      signature_status: 'signed',
      photos: [],
    })
    await supabase
      .from('reports')
      .update({ completed_at: `${r.date}T${String(Number(r.start.slice(0, 2)) + 3).padStart(2, '0')}:00:00` })
      .eq('id', report.id)
    await setReportConformity(report.id, computeConformity({ answered: 0, total: 0, nokCount: 0 }, verdicts))
      .catch((e) => console.warn('[démo] conformité non enregistrée', e))
    await setInterventionStatus(interv.id, 'terminee')
    tick(`Rapport ${interv.reference} (${client.name})`)

    try {
      await generateReportPdfForIntervention(interv.id, organizationId, organizationName)
    } catch (e) {
      console.warn('[démo] PDF non généré', e)
    }
    tick(`PDF du rapport ${interv.reference}`)
  }

  // ─── 4. Anciennes visites (échéances proches ou dépassées) et visites à planifier ──
  const pastVisits = [
    { key: 'garage', types: ['extincteurs'] as EquipmentType[], days: -350, tech: 3 },
    { key: 'pasteur', types: ['extincteurs'] as EquipmentType[], days: -372, tech: 0 },
    { key: 'moulin', types: ['desenfumage'] as EquipmentType[], days: -340, tech: 1 },
    { key: 'beausejour', types: ['ria'] as EquipmentType[], days: -176, tech: 2 },
  ]
  for (const v of pastVisits) {
    const { client, site } = get(v.key)
    const t = tech(v.tech)
    const interv = await createIntervention(
      {
        client_name: client.name, client_id: client.id,
        site_name: site.name, site_id: site.id,
        address: `${site.address}, ${site.postal_code} ${site.city}`,
        equipment_types: v.types,
        scheduled_date: daysFromToday(v.days), start_time: '09:00', duration_minutes: 120,
        technician_id: t.id, technician_name: techName(t),
        priority: 'reglementaire', intervention_type: 'preventive',
        notes: v.types.includes('ria') ? 'Contrôle semestriel RIA' : 'Visite annuelle',
      },
      organizationId,
    )
    await setInterventionStatus(interv.id, 'terminee')
    finishedInterventions.push(interv)
  }

  const toPlan = [
    { key: 'garage', types: ['extincteurs'] as EquipmentType[], priority: 'reglementaire' as const, notes: `Visite annuelle — échéance le ${frDate(daysFromToday(15))}` },
    { key: 'pasteur', types: ['extincteurs'] as EquipmentType[], priority: 'urgente' as const, notes: 'Visite annuelle en retard : échéance dépassée' },
    { key: 'moulin', types: ['desenfumage'] as EquipmentType[], priority: 'reglementaire' as const, notes: `Visite annuelle désenfumage — échéance le ${frDate(daysFromToday(25))}` },
  ]
  for (const p of toPlan) {
    const { client, site } = get(p.key)
    await createIntervention(
      {
        client_name: client.name, client_id: client.id,
        site_name: site.name, site_id: site.id,
        address: `${site.address}, ${site.postal_code} ${site.city}`,
        equipment_types: p.types, priority: p.priority, intervention_type: 'preventive', notes: p.notes,
        duration_minutes: 120,
      },
      organizationId,
    )
  }
  // Planifiée mais pas encore affectée : apparaît aussi dans « À planifier »
  {
    const { client, site } = get('beausejour')
    await createIntervention(
      {
        client_name: client.name, client_id: client.id,
        site_name: site.name, site_id: site.id,
        address: `${site.address}, ${site.postal_code} ${site.city}`,
        equipment_types: ['ria'], scheduled_date: businessDay(8), start_time: '09:00', duration_minutes: 90,
        priority: 'reglementaire', intervention_type: 'preventive', notes: 'Contrôle semestriel RIA',
      },
      organizationId,
    )
  }
  tick('Échéances et visites à planifier')

  // ─── 5. Planning de la semaine ─────────────────────────────────
  const week = [
    { key: 'entrepot', types: ['extincteurs'] as EquipmentType[], date: businessDay(-1), start: '13:30', duration: 120, tech: 3, status: null },
    { key: 'parc', types: ['extincteurs'] as EquipmentType[], date: businessDay(0), start: '09:00', duration: 120, tech: 2, status: 'en_cours' },
    { key: 'lilas', types: ['extincteurs', 'ria'] as EquipmentType[], date: businessDay(1), start: '08:30', duration: 240, tech: 1, status: null },
    { key: 'tilleuls', types: ['extincteurs', 'ria', 'desenfumage'] as EquipmentType[], date: businessDay(2), start: '09:00', duration: 180, tech: 0, status: null },
    { key: 'creche', types: ['extincteurs', 'ssi'] as EquipmentType[], date: businessDay(3), start: '13:00', duration: 120, tech: 2, status: null },
    { key: 'garage', types: ['extincteurs'] as EquipmentType[], date: businessDay(4), start: '14:00', duration: 90, tech: 3, status: null },
  ]
  for (const w of week) {
    const { client, site } = get(w.key)
    const t = tech(w.tech)
    const interv = await createIntervention(
      {
        client_name: client.name, client_id: client.id,
        site_name: site.name, site_id: site.id,
        address: `${site.address}, ${site.postal_code} ${site.city}`,
        equipment_types: w.types,
        scheduled_date: w.date, start_time: w.start, duration_minutes: w.duration,
        technician_id: t.id, technician_name: techName(t),
        priority: w.key === 'garage' ? 'normale' : 'reglementaire',
        intervention_type: w.key === 'garage' ? 'corrective' : 'preventive',
        notes: w.key === 'garage' ? "Remplacement d'un extincteur poudre (choc sur l'appareil)" : 'Visite annuelle',
      },
      organizationId,
    )
    if (w.status) await setInterventionStatus(interv.id, w.status)
  }
  tick('Planning de la semaine')

  // ─── 6. Devis ──────────────────────────────────────────────────
  const clientFields = (key: string) => {
    const { client, site } = get(key)
    return {
      client_id: client.id,
      client_name: client.name,
      client_contact_name: client.contact_name ?? undefined,
      client_email: client.contact_email ?? undefined,
      client_address: client.address ?? undefined,
      site_name: site.name,
    }
  }
  await createQuote(
    {
      ...clientFields('stjean'),
      issue_date: daysFromToday(0), validity_date: daysFromToday(30),
      notes: 'Remplacement préventif des extincteurs CO2 arrivant en fin de vie.',
      lines: [
        { position: 0, description: 'Extincteur CO2 2 kg neuf (fourniture et pose)', quantity: 3, unit_price_ht: 95, vat_rate: 20 },
        { position: 1, description: 'Reprise et recyclage des anciens appareils', quantity: 3, unit_price_ht: 12, vat_rate: 20 },
        { position: 2, description: 'Forfait déplacement', quantity: 1, unit_price_ht: 45, vat_rate: 20 },
      ],
    },
    organizationId,
  )
  const sentQuote = await createQuote(
    {
      ...clientFields('montaigne'),
      issue_date: daysFromToday(-6), validity_date: daysFromToday(24),
      notes: 'Complément d\'éclairage de sécurité demandé lors de la visite.',
      lines: [
        { position: 0, description: 'BAES évacuation 45 lm (fourniture)', quantity: 6, unit_price_ht: 68, vat_rate: 20 },
        { position: 1, description: 'Pose et raccordement', quantity: 3, unit_price_ht: 58, vat_rate: 20 },
      ],
    },
    organizationId,
  )
  await markQuoteSent(sentQuote.id, get('montaigne').client.contact_email ?? '')
  const acceptedQuote = await createQuote(
    {
      ...clientFields('tilleuls'),
      issue_date: daysFromToday(-12), validity_date: daysFromToday(18),
      notes: 'Contrat annuel de maintenance.',
      lines: [
        { position: 0, description: 'Contrat annuel : vérification des extincteurs (8 appareils)', quantity: 8, unit_price_ht: 22, vat_rate: 20 },
        { position: 1, description: 'Contrat annuel : vérification des RIA (2 postes)', quantity: 2, unit_price_ht: 65, vat_rate: 20 },
        { position: 2, description: 'Contrat annuel : BAES et désenfumage', quantity: 1, unit_price_ht: 240, vat_rate: 20 },
      ],
    },
    organizationId,
  )
  await markQuoteSent(acceptedQuote.id, get('tilleuls').client.contact_email ?? '')
  await markQuoteAccepted(acceptedQuote.id)
  tick('Devis')

  // ─── 7. Factures : payées sur 6 mois, une en attente, une en retard ──
  const paidInvoices = [
    { key: 'stjean', months: 5, amount: 2350, label: 'Visite annuelle extincteurs et RIA' },
    { key: 'montaigne', months: 4, amount: 3120, label: 'Visite annuelle extincteurs et désenfumage' },
    { key: 'lilas', months: 3, amount: 1980, label: 'Visite annuelle extincteurs et RIA' },
    { key: 'tilleuls', months: 2, amount: 4250, label: 'Mise en conformité : remplacement de 6 extincteurs et 4 BAES' },
    { key: 'beausejour', months: 1, amount: 2890, label: 'Visite annuelle et remplacement de 2 RIA' },
    { key: 'garage', months: 0, amount: 1640, label: 'Remplacement de 3 extincteurs poudre' },
    { key: 'parc', months: 0, amount: 2210, label: 'Contrat annuel de maintenance' },
  ]
  for (const [i, p] of paidInvoices.entries()) {
    const linked = finishedInterventions[i % finishedInterventions.length]
    const issue = p.months === 0 ? daysFromToday(-20 + i) : monthsAgo(p.months, 6)
    const paid = p.months === 0 ? daysFromToday(-3 + (i % 2)) : monthsAgo(p.months, 24)
    const inv = await createInvoice(
      {
        ...clientFields(p.key),
        intervention_id: linked?.id,
        issue_date: issue,
        due_date: p.months === 0 ? daysFromToday(10) : monthsAgo(p.months - 1, 6),
        lines: [{ position: 0, description: p.label, quantity: 1, unit_price_ht: p.amount, vat_rate: 20 }],
      },
      organizationId,
    )
    await markInvoiceSent(inv.id, get(p.key).client.contact_email ?? '')
    await recordPayment(inv.id, Number(inv.total_ttc), 'virement', `VIR-${String(i + 1).padStart(3, '0')}`)
    await supabase.from('invoices').update({ paid_at: `${paid}T10:00:00` }).eq('id', inv.id)
  }
  const pending = await createInvoice(
    {
      ...clientFields('beausejour'),
      issue_date: daysFromToday(-5), due_date: daysFromToday(25),
      lines: [{ position: 0, description: 'Visite annuelle extincteurs', quantity: 1, unit_price_ht: 1260, vat_rate: 20 }],
    },
    organizationId,
  )
  await markInvoiceSent(pending.id, get('beausejour').client.contact_email ?? '')
  const late = await createInvoice(
    {
      ...clientFields('lilas'),
      issue_date: daysFromToday(-45), due_date: daysFromToday(-15),
      lines: [{ position: 0, description: 'Remplacement de 2 extincteurs eau 6 L', quantity: 1, unit_price_ht: 980, vat_rate: 20 }],
    },
    organizationId,
  )
  await markInvoiceSent(late.id, get('lilas').client.contact_email ?? '')
  tick('Factures')

  // ─── 8. Notes de frais et heures sup ───────────────────────────
  for (const e of [
    { tech: 0, cat: 'meal' as const, amount: 18.5, vat: 10, desc: 'Déjeuner sur chantier', days: -5 },
    { tech: 1, cat: 'fuel' as const, amount: 67.3, vat: 20, desc: 'Plein de carburant', days: -3 },
    { tech: 2, cat: 'supplier' as const, amount: 142.8, vat: 20, desc: 'Achat de 5 manomètres de remplacement', days: -8 },
  ]) {
    const t = tech(e.tech)
    await createExpense(
      { technician_id: t.id, spent_on: daysFromToday(e.days), category: e.cat, amount_ttc: e.amount, vat_rate: e.vat, description: e.desc },
      organizationId,
      techName(t),
    )
  }
  for (const o of [
    { tech: 0, hours: 2, type: 'standard' as const, desc: "Dépannage urgent d'un RIA", days: -8 },
    { tech: 1, hours: 4, type: 'sunday_holiday' as const, desc: 'Intervention un dimanche (magasin fermé en semaine)', days: -15 },
  ]) {
    const t = tech(o.tech)
    await createOvertime(
      { technician_id: t.id, worked_on: daysFromToday(o.days), hours: o.hours, type: o.type, description: o.desc },
      organizationId,
      techName(t),
    )
  }
  tick('Notes de frais et heures sup')

  // ─── 9. Agenda et portail client ───────────────────────────────
  await createPlanningEvent(organizationId, {
    date: businessDay(1), label: 'Rendez-vous syndic — Résidence Les Tilleuls',
    startTime: '10:00', endTime: '11:00', color: 'acc',
    notes: 'Présentation du contrat annuel de maintenance.', isPrivate: true,
  })
  await createPlanningEvent(organizationId, {
    date: businessDay(3), label: 'Déjeuner fournisseur',
    startTime: '12:30', endTime: '14:00', color: 'grn', notes: null, isPrivate: true,
  })
  await createClientToken(organizationId, get('stjean').client.id)
  tick('Agenda et portail client')
}

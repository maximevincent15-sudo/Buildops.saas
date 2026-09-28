import { listClients } from '../../clients/api'
import type { Client } from '../../clients/schemas'
import {
  batchCreateEquipmentUnits,
  createSite,
  createZone,
  listEquipmentUnits,
  listSites,
  listZones,
} from '../../equipment/api'
import {
  EQUIPMENT_FAMILIES,
  EQUIPMENT_FAMILY_LABELS,
} from '../../equipment/schemas'
import type {
  CreateEquipmentUnitInput,
  EquipmentFamily,
  Site,
  Zone,
} from '../../equipment/schemas'
import { parseYear } from '../helpers'
import type { ImportDefinition, RowAnalysis } from '../types'

// ─── Helpers ────────────────────────────────────────────

function normalize(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
}

/** Mapping tolérant texte libre → famille interne (correspondance exacte) */
const FAMILY_ALIASES: Record<string, EquipmentFamily> = {
  extincteur: 'extincteurs',
  extincteurs: 'extincteurs',
  ex: 'extincteurs',
  ext: 'extincteurs',
  ria: 'ria',
  'robinet incendie arme': 'ria',
  'robinet d incendie arme': 'ria',
  baes: 'baes',
  bae: 'baes',
  'bloc autonome': 'baes',
  'bloc autonome eclairage secours': 'baes',
  eclairage: 'baes',
  'porte coupe-feu': 'portes_cf',
  'porte coupe feu': 'portes_cf',
  'portes coupe-feu': 'portes_cf',
  'portes coupe feu': 'portes_cf',
  pcf: 'portes_cf',
  desenfumage: 'desenfumage',
  desenfum: 'desenfumage',
  fumee: 'desenfumage',
  detection: 'detection',
  ssi: 'detection',
  alarme: 'detection',
  'detection incendie': 'detection',
  cs: 'colonnes_seches',
  'colonne seche': 'colonnes_seches',
  'colonnes seches': 'colonnes_seches',
}

/**
 * Mots-clés reconnus dans un libellé libre (« Extincteur CO2 5kg »,
 * « B.A.E.S évacuation », « Déclencheur manuel »…). L'ordre compte.
 */
const FAMILY_KEYWORDS: Array<[RegExp, EquipmentFamily]> = [
  [/colonne/, 'colonnes_seches'],
  [/\bria\b|robinet/, 'ria'],
  [/b\.?a\.?e\.?s|b\.?a\.?e\.?h|\bbae\b|bloc autonome|eclairage de securite|eclairage secours/, 'baes'],
  [/porte|\bpcf\b|coupe.?feu/, 'portes_cf'],
  [/desenfum|exutoire|\bdcm\b|ouvrant de desenfumage/, 'desenfumage'],
  [/detect|\bssi\b|alarme|declencheur|sirene|centrale incendie|\bdm\b/, 'detection'],
  [/extinct|\bext\b|\bco[2²]|poudre|eau pulv|\bepa?\b|mousse|\bpp\s?\d|\babc\b|\bp\d+\b/, 'extincteurs'],
]

function resolveFamily(raw: string | null): EquipmentFamily | null {
  if (!raw) return null
  const n = normalize(raw)
  if (FAMILY_ALIASES[n]) return FAMILY_ALIASES[n]
  if (EQUIPMENT_FAMILIES.includes(n as EquipmentFamily)) return n as EquipmentFamily
  for (const [re, family] of FAMILY_KEYWORDS) {
    if (re.test(n)) return family
  }
  return null
}

// ─── Index (chargés une fois par import) ────────────────

type EquipCache = {
  sitesByName?: Map<string, Site[]>
  clientsByName?: Map<string, Client>
  zonesBySiteAndName?: Map<string, Zone> // key: `${site_id}::${normalizedName}`
  existingSerials?: Set<string> // key: `${siteKey}::${family}::${serial}`
  serialsInFile?: Set<string>
  sitesToCreate?: Set<string> // key: `${client_id}::${normalizedSiteName}`
  createdSites?: Map<string, string> // même clé → site_id créé pendant l'import
}

async function getSitesIndex(cache: Record<string, unknown>): Promise<Map<string, Site[]>> {
  const c = cache as EquipCache
  if (c.sitesByName) return c.sitesByName
  const sites = await listSites()
  const map = new Map<string, Site[]>()
  for (const s of sites) {
    const k = normalize(s.name)
    map.set(k, [...(map.get(k) ?? []), s])
  }
  c.sitesByName = map
  return map
}

async function getClientsIndex(cache: Record<string, unknown>): Promise<Map<string, Client>> {
  const c = cache as EquipCache
  if (c.clientsByName) return c.clientsByName
  const clients = await listClients()
  c.clientsByName = new Map(clients.map((cl) => [normalize(cl.name), cl]))
  return c.clientsByName
}

async function getZonesIndex(
  siteId: string,
  cache: Record<string, unknown>,
): Promise<Map<string, Zone>> {
  const c = cache as EquipCache
  if (!c.zonesBySiteAndName) c.zonesBySiteAndName = new Map()
  const zones = await listZones(siteId)
  for (const z of zones) {
    c.zonesBySiteAndName.set(`${siteId}::${normalize(z.name)}`, z)
  }
  return c.zonesBySiteAndName
}

async function getExistingSerials(cache: Record<string, unknown>): Promise<Set<string>> {
  const c = cache as EquipCache
  if (c.existingSerials) return c.existingSerials
  const units = await listEquipmentUnits({ includeRemoved: true })
  const set = new Set<string>()
  for (const u of units) {
    set.add(`${u.site_id}::${u.family}::${u.serial_number}`)
  }
  c.existingSerials = set
  return set
}

function invalid(row: Record<string, string | null>, message: string): RowAnalysis {
  return { index: 0, values: row, status: 'invalid', messages: [message] }
}

// ─── Definition ─────────────────────────────────────────

export const equipmentsImportDefinition: ImportDefinition = {
  entityLabel: 'équipement',
  entityLabelPlural: 'équipements',
  templateFilename: 'equipements-firovia.xlsx',
  description:
    "Importe un registre d'équipements depuis Excel, CSV ou l'export de ton logiciel actuel. " +
    "Importe d'abord tes clients. Si la colonne « Client » est remplie, les sites manquants sont créés automatiquement ; " +
    'sinon, les sites doivent déjà exister. Les zones inconnues sont créées automatiquement. ' +
    'Les intitulés courants sont reconnus (Emplacement, Fabricant, N°, Date de fabrication…).',
  fields: [
    {
      key: 'client_name',
      label: 'Client',
      aliases: ['Raison sociale', 'Nom client', 'Nom du client', 'Société'],
      example: 'Valoris SA',
      hint: 'Recommandé — permet de créer le site automatiquement s\'il n\'existe pas',
    },
    {
      key: 'site_name',
      label: 'Site',
      aliases: ['Nom du site', 'Site client', 'Établissement', 'Lieu', 'Site d\'intervention'],
      required: true,
      example: 'PENTACAR Montauban',
      hint: 'Nom du site (créé automatiquement si la colonne Client est remplie)',
    },
    {
      key: 'site_address',
      label: 'Adresse du site',
      aliases: ['Adresse site', 'Adresse', 'Adresse d\'intervention'],
      example: '12 avenue de la Gare, 82000 Montauban',
      hint: 'Utilisée uniquement si le site est créé',
    },
    {
      key: 'family',
      label: 'Famille',
      aliases: ['Famille d\'équipement', 'Type d\'équipement', 'Catégorie', 'Nature', 'Équipement', 'Type matériel'],
      example: 'Extincteurs',
      hint: 'Extincteurs, RIA, BAES, Portes CF, Désenfumage, Détection, Colonnes sèches (déduite du type si absente)',
    },
    {
      key: 'serial_number',
      label: "N° d'unité",
      aliases: ['N°', 'Numéro', 'N° appareil', 'Repère', 'N° repère', 'N° d\'ordre', 'N° inventaire', 'Identifiant'],
      required: true,
      example: '01',
      hint: 'Numéro de l\'équipement sur le site (unique par site + famille)',
    },
    {
      key: 'manufacturer_serial',
      label: 'N° de série fabricant',
      aliases: ['N° série', 'Numéro de série', 'N° de série', 'Série'],
      example: '',
      hint: 'Ajouté aux notes (sert de N° d\'unité si celui-ci est absent)',
    },
    {
      key: 'zone_name',
      label: 'Zone',
      aliases: ['Secteur', 'Bâtiment', 'Niveau', 'Étage', 'Bâtiment / Zone'],
      example: 'Atelier peinture',
      hint: 'Créée automatiquement si inexistante',
    },
    {
      key: 'subtype',
      label: 'Type / sous-type',
      aliases: ['Type', 'Désignation', 'Description', 'Type d\'appareil', 'Agent', 'Capacité'],
      example: 'EPA 6L',
      hint: 'EPA 6L, CO² 5kg, P6 ABC…',
    },
    {
      key: 'implantation',
      label: 'Implantation',
      aliases: ['Emplacement', 'Localisation', 'Position', 'Situation', 'Localisation précise'],
      example: 'Entrée principale',
    },
    {
      key: 'brand',
      label: 'Marque',
      aliases: ['Fabricant', 'Constructeur'],
      example: 'ANDRIEU',
    },
    {
      key: 'model',
      label: 'Modèle',
      aliases: ['Référence', 'Réf', 'Réf fabricant'],
      example: '',
    },
    {
      key: 'install_year',
      label: 'Année de mise en service',
      aliases: ['Année', 'Année de fabrication', 'Date de fabrication', 'Fabrication', 'Date fab', 'Année fab', 'Date MES', 'MES', 'Date de mise en service', 'Mise en service', 'Date installation', 'Année installation', 'Date de pose'],
      example: '2019',
      hint: 'Année ou date (15/03/2019 accepté)',
    },
    {
      key: 'next_replacement_year',
      label: 'Année de réforme',
      aliases: ['Date de réforme', 'Réforme', 'Fin de vie', 'Date limite'],
      example: '2029',
      hint: 'Optionnel — calculé auto si vide (extincteurs = +10 ans, BAES = +4 ans)',
    },
    {
      key: 'notes',
      label: 'Observation / notes',
      aliases: ['Observations', 'Observation', 'Notes', 'Remarques', 'Commentaire', 'Commentaires'],
      example: 'Néant',
    },
  ],

  async validateRow(row, context): Promise<RowAnalysis> {
    const messages: string[] = []
    const cache = context.cache as Record<string, unknown>
    const c = cache as EquipCache

    const siteName = (row.site_name ?? '').trim()
    const clientName = (row.client_name ?? '').trim()
    // N° d'unité : à défaut, le n° de série fabricant
    let serial = (row.serial_number ?? '').trim()
    if (!serial && row.manufacturer_serial) {
      serial = row.manufacturer_serial.trim()
      messages.push("N° d'unité absent : le n° de série fabricant est utilisé")
    }

    if (!siteName) return invalid(row, 'Nom du site obligatoire')
    if (!serial) return invalid(row, "N° d'unité obligatoire")

    // Famille : colonne dédiée, sinon déduite du type / de la désignation
    const family = resolveFamily(row.family) ?? resolveFamily(row.subtype)
    if (!family) {
      return invalid(
        row,
        row.family
          ? `Famille "${row.family}" non reconnue. Utilise : ${EQUIPMENT_FAMILIES.map((f) => EQUIPMENT_FAMILY_LABELS[f]).join(', ')}`
          : 'Famille manquante : ajoute une colonne « Famille » (Extincteurs, RIA, BAES…)',
      )
    }

    // Client (optionnel) puis site
    let client: Client | undefined
    if (clientName) {
      client = (await getClientsIndex(cache)).get(normalize(clientName))
      if (!client) {
        return invalid(row, `Client "${clientName}" introuvable : importe d'abord tes clients (Clients → Importer).`)
      }
    }

    const candidates = (await getSitesIndex(cache)).get(normalize(siteName)) ?? []
    let site: Site | undefined
    if (client) {
      site = candidates.find((s) => s.client_id === client.id)
    } else if (candidates.length > 1) {
      return invalid(row, `Plusieurs sites s'appellent "${siteName}" : ajoute une colonne « Client » pour préciser.`)
    } else {
      site = candidates[0]
    }

    let createSite = false
    if (!site) {
      if (!client) {
        return invalid(
          row,
          `Site "${siteName}" introuvable : ajoute une colonne « Client » pour le créer automatiquement, ou crée-le d'abord.`,
        )
      }
      createSite = true
      if (!c.sitesToCreate) c.sitesToCreate = new Set()
      const siteKey = `${client.id}::${normalize(siteName)}`
      if (!c.sitesToCreate.has(siteKey)) {
        c.sitesToCreate.add(siteKey)
        messages.push(`Nouveau site "${siteName}" créé pour ${client.name}`)
      }
    }

    // Années
    if (row.install_year && parseYear(row.install_year) === null) {
      messages.push(`Année "${row.install_year}" non reconnue (ignorée)`)
    }

    const values: Record<string, string | null> = {
      ...row,
      serial_number: serial,
      __resolved_site_id: site?.id ?? null,
      __resolved_client_id: site?.client_id ?? client?.id ?? null,
      __resolved_family: family,
      __create_site: createSite ? '1' : null,
    }

    // Doublon dans le fichier (même site + famille + n°)
    const siteRef = site?.id ?? `new:${client?.id}:${normalize(siteName)}`
    const key = `${siteRef}::${family}::${serial}`
    if (!c.serialsInFile) c.serialsInFile = new Set()
    if (c.serialsInFile.has(key)) {
      return invalid(row, `Équipement ${EQUIPMENT_FAMILY_LABELS[family]} n°${serial} en double dans le fichier (seule la 1re ligne est importée)`)
    }
    c.serialsInFile.add(key)

    // Doublon en base : (site, famille, n°) déjà existant ?
    if (site) {
      const serials = await getExistingSerials(cache)
      if (serials.has(`${site.id}::${family}::${serial}`)) {
        return { index: 0, values, status: 'duplicate', messages, existingId: null }
      }
    }

    return { index: 0, values, status: 'valid', messages }
  },

  async importRow(row, analysis, context): Promise<'created' | 'updated' | 'skipped'> {
    if (analysis.status !== 'valid') {
      if (analysis.status === 'duplicate' && analysis.duplicateAction === 'skip') return 'skipped'
      if (analysis.status === 'invalid') return 'skipped'
    }

    const cache = context.cache as Record<string, unknown>
    const c = cache as EquipCache
    const clientId = row.__resolved_client_id
    const family = row.__resolved_family as EquipmentFamily
    if (!clientId) throw new Error('Client non résolu')

    // Site : existant, ou créé à la première ligne qui le mentionne
    let siteId = row.__resolved_site_id
    if (!siteId && row.__create_site === '1') {
      const siteName = (row.site_name ?? '').trim()
      const siteKey = `${clientId}::${normalize(siteName)}`
      if (!c.createdSites) c.createdSites = new Map()
      siteId = c.createdSites.get(siteKey) ?? null
      if (!siteId) {
        const site = await createSite(
          { client_id: clientId, name: siteName, address: row.site_address ?? undefined },
          context.organizationId,
        )
        siteId = site.id
        c.createdSites.set(siteKey, siteId)
      }
    }
    if (!siteId) throw new Error('Site non résolu')

    // Zone : lookup + création à la volée
    let zoneId: string | undefined
    const zoneName = (row.zone_name ?? '').trim()
    if (zoneName) {
      const zonesIndex = await getZonesIndex(siteId, cache)
      const zoneKey = `${siteId}::${normalize(zoneName)}`
      let zone = zonesIndex.get(zoneKey)
      if (!zone) {
        zone = await createZone(
          { site_id: siteId, name: zoneName },
          context.organizationId,
        )
        zonesIndex.set(zoneKey, zone)
      }
      zoneId = zone.id
    }

    // N° de série fabricant → notes (s'il n'a pas servi de N° d'unité)
    const serial = (row.serial_number ?? '').trim()
    const mfr = (row.manufacturer_serial ?? '').trim()
    const notes = [
      row.notes,
      mfr && mfr !== serial ? `N° série fabricant : ${mfr}` : null,
    ].filter(Boolean).join(' · ')

    const input: CreateEquipmentUnitInput = {
      client_id: clientId,
      site_id: siteId,
      zone_id: zoneId,
      family,
      subtype: row.subtype ?? undefined,
      serial_number: serial,
      implantation: row.implantation ?? undefined,
      brand: row.brand ?? undefined,
      model: row.model ?? undefined,
      install_year: parseYear(row.install_year) ?? undefined,
      next_replacement_year: parseYear(row.next_replacement_year) ?? undefined,
      status: 'active',
      notes: notes || undefined,
    }

    await batchCreateEquipmentUnits([input], context.organizationId)
    return 'created'
  },
}

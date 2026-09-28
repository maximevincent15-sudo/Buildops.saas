import { listClients, createClient, updateClient } from '../../clients/api'
import { parseCompanyNumber } from '../../clients/companyLookup'
import type { Client, CreateClientInput } from '../../clients/schemas'
import type { ImportDefinition, RowAnalysis } from '../types'

function normalizeName(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ')
}

function isValidEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)
}

/**
 * Définition de l'import clients (Phase A.1).
 *
 * Champs acceptés (colonnes du fichier) :
 *  - Nom* : raison sociale du client
 *  - Contact : personne à contacter
 *  - Email : email du contact (validé)
 *  - Téléphone : libre
 *  - Adresse : libre (+ Code postal / Ville si colonnes séparées)
 *  - SIREN / SIRET : validé (clé de contrôle), ignoré si invalide
 *  - Notes : notes internes libres
 *
 * Les intitulés des exports d'autres logiciels sont reconnus (aliases).
 *
 * Dédup : par nom (case-insensitive, espaces normalisés).
 */
export const clientsImportDefinition: ImportDefinition = {
  entityLabel: 'client',
  entityLabelPlural: 'clients',
  templateFilename: 'clients-firovia.xlsx',
  description:
    'Importe la liste de tes clients depuis Excel, CSV ou l\'export de ton logiciel actuel (Optim-BTP, Batigest, logiciel maison…). ' +
    'Les intitulés courants sont reconnus automatiquement (Raison sociale, Tél, Mail, CP, Ville, SIRET…) ; sinon, renomme tes colonnes comme dans le template.',
  fields: [
    {
      key: 'name',
      label: 'Nom',
      aliases: ['Raison sociale', 'Nom client', 'Nom du client', 'Client', 'Société', 'Entreprise', 'Dénomination', 'Nom / Raison sociale', 'Nom société'],
      required: true,
      example: 'Valoris SA',
      hint: "Raison sociale ou nom d'enseigne",
    },
    {
      key: 'contact_name',
      label: 'Contact',
      aliases: ['Interlocuteur', 'Nom du contact', 'Contact principal', 'Responsable', 'Correspondant', 'Nom contact'],
      example: 'M. Dupont',
    },
    {
      key: 'contact_email',
      label: 'Email',
      aliases: ['E-mail', 'Mail', 'Courriel', 'Adresse email', 'Adresse mail', 'Email contact', 'Mail contact'],
      example: 'contact@valoris.fr',
    },
    {
      key: 'contact_phone',
      label: 'Téléphone',
      aliases: ['Tél', 'Tel', 'Téléphone fixe', 'Tél fixe', 'N° de téléphone', 'Téléphone contact', 'Portable', 'Mobile', 'GSM', 'Tél portable'],
      example: '0123456789',
    },
    {
      key: 'address',
      label: 'Adresse',
      aliases: ['Adresse 1', 'Adresse ligne 1', 'Adresse postale', 'Rue', 'Voie'],
      example: '12 rue des Lilas',
    },
    {
      key: 'postal_code',
      label: 'Code postal',
      aliases: ['CP', 'Code_postal'],
      example: '75010',
    },
    {
      key: 'city',
      label: 'Ville',
      aliases: ['Commune', 'Localité'],
      example: 'Paris',
    },
    {
      key: 'company_number',
      label: 'SIREN / SIRET',
      aliases: ['SIRET', 'SIREN', 'N° SIRET', 'Numéro SIRET', 'N° SIREN'],
      example: '552 081 317',
      hint: 'Optionnel — ignoré s\'il est invalide',
    },
    {
      key: 'notes',
      label: 'Notes internes',
      aliases: ['Notes', 'Observations', 'Observation', 'Remarques', 'Commentaire', 'Commentaires'],
      example: 'Parking sous-sol, demander M. Dupont',
    },
  ],

  async validateRow(row, context): Promise<RowAnalysis> {
    const messages: string[] = []
    const values = row
    const name = (values.name ?? '').trim()

    // Validation : nom obligatoire
    if (!name) {
      return {
        index: 0,
        values,
        status: 'invalid',
        messages: ['Nom du client obligatoire'],
      }
    }

    // Validation : email (si présent)
    const email = values.contact_email ?? ''
    if (email && !isValidEmail(email)) {
      messages.push(`Email "${email}" invalide (sera quand même importé)`)
    }

    // SIREN / SIRET (si présent) : ignoré s'il est invalide
    const companyNumber = values.company_number ?? ''
    if (companyNumber && !parseCompanyNumber(companyNumber).ok) {
      messages.push(`SIREN/SIRET "${companyNumber}" invalide (ignoré)`)
    }

    // Doublon à l'intérieur du même fichier
    const cacheSeen = context.cache as { clientNamesInFile?: Set<string> }
    if (!cacheSeen.clientNamesInFile) cacheSeen.clientNamesInFile = new Set()
    const nameKey = normalizeName(name)
    if (cacheSeen.clientNamesInFile.has(nameKey)) {
      return {
        index: 0,
        values,
        status: 'invalid',
        messages: [`Client "${name}" présent plusieurs fois dans le fichier (seule la 1re ligne est importée)`],
      }
    }
    cacheSeen.clientNamesInFile.add(nameKey)

    // Dédup : charge la liste des clients existants une fois et garde en cache
    const cache = context.cache as { clientsByName?: Map<string, Client> }
    if (!cache.clientsByName) {
      const existing = await listClients()
      cache.clientsByName = new Map(
        existing.map((c) => [normalizeName(c.name), c]),
      )
    }
    const existingClient = cache.clientsByName.get(normalizeName(name))

    if (existingClient) {
      return {
        index: 0,
        values,
        status: 'duplicate',
        messages,
        existingId: existingClient.id,
      }
    }

    return {
      index: 0,
      values,
      status: 'valid',
      messages,
    }
  },

  async importRow(row, analysis, context): Promise<'created' | 'updated' | 'skipped'> {
    const cityLine = [row.postal_code, row.city].filter(Boolean).join(' ')
    const address = [row.address, cityLine].filter(Boolean).join(', ')
    const companyNumber = row.company_number ?? ''
    const input: CreateClientInput = {
      name: (row.name ?? '').trim(),
      company_number: parseCompanyNumber(companyNumber).ok ? companyNumber : undefined,
      contact_name: row.contact_name ?? undefined,
      contact_email: row.contact_email ?? undefined,
      contact_phone: row.contact_phone ?? undefined,
      address: address || undefined,
      notes: row.notes ?? undefined,
    }

    if (analysis.status === 'duplicate' && analysis.duplicateAction === 'update' && analysis.existingId) {
      await updateClient(analysis.existingId, input)
      return 'updated'
    }
    if (analysis.status === 'valid') {
      await createClient(input, context.organizationId)
      return 'created'
    }
    return 'skipped'
  },
}

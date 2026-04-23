import { listClients, createClient, updateClient } from '../../clients/api'
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
 *  - Adresse : libre
 *  - Notes : notes internes libres
 *
 * Dédup : par nom (case-insensitive, espaces normalisés).
 */
export const clientsImportDefinition: ImportDefinition = {
  entityLabel: 'client',
  entityLabelPlural: 'clients',
  templateFilename: 'clients-buildops.xlsx',
  description:
    'Importe la liste de tes clients depuis Excel, CSV ou tout autre outil (Google Sheets, Optim-BTP, Batigest…). ' +
    'Exporte simplement en .xlsx ou .csv et colle tes colonnes dans le template.',
  fields: [
    {
      key: 'name',
      label: 'Nom',
      required: true,
      example: 'Valoris SA',
      hint: "Raison sociale ou nom d'enseigne",
    },
    {
      key: 'contact_name',
      label: 'Contact',
      example: 'M. Dupont',
    },
    {
      key: 'contact_email',
      label: 'Email',
      example: 'contact@valoris.fr',
    },
    {
      key: 'contact_phone',
      label: 'Téléphone',
      example: '0123456789',
    },
    {
      key: 'address',
      label: 'Adresse',
      example: '12 rue des Lilas, 75010 Paris',
    },
    {
      key: 'notes',
      label: 'Notes internes',
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
    const input: CreateClientInput = {
      name: (row.name ?? '').trim(),
      contact_name: row.contact_name ?? undefined,
      contact_email: row.contact_email ?? undefined,
      contact_phone: row.contact_phone ?? undefined,
      address: row.address ?? undefined,
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

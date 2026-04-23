import { createTechnician, listTechnicians, updateTechnician } from '../../technicians/api'
import type { CreateTechnicianInput, Technician } from '../../technicians/schemas'
import type { ImportDefinition, RowAnalysis } from '../types'

function normalizeName(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ')
}

function isValidEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)
}

/**
 * Import techniciens (Phase A.2).
 * Dédup par (prénom + nom) normalisés.
 */
export const techniciansImportDefinition: ImportDefinition = {
  entityLabel: 'technicien',
  entityLabelPlural: 'techniciens',
  templateFilename: 'techniciens-buildops.xlsx',
  description:
    'Importe la liste de tes techniciens depuis Excel ou CSV. Prénom et nom sont obligatoires, le reste est facultatif.',
  fields: [
    { key: 'first_name', label: 'Prénom', required: true, example: 'Thomas' },
    { key: 'last_name', label: 'Nom', required: true, example: 'Moreau' },
    { key: 'role', label: 'Rôle', example: 'Chef d\'équipe' },
    { key: 'email', label: 'Email', example: 'thomas.moreau@entreprise.fr' },
    { key: 'phone', label: 'Téléphone', example: '0612345678' },
    { key: 'notes', label: 'Notes internes', example: 'habilitation électrique B1V' },
  ],

  async validateRow(row, context): Promise<RowAnalysis> {
    const messages: string[] = []
    const firstName = (row.first_name ?? '').trim()
    const lastName = (row.last_name ?? '').trim()

    if (!firstName || !lastName) {
      return {
        index: 0,
        values: row,
        status: 'invalid',
        messages: ['Prénom et nom obligatoires'],
      }
    }

    const email = row.email ?? ''
    if (email && !isValidEmail(email)) {
      messages.push(`Email "${email}" invalide (sera quand même importé)`)
    }

    const cache = context.cache as { techniciansByName?: Map<string, Technician> }
    if (!cache.techniciansByName) {
      const existing = await listTechnicians()
      cache.techniciansByName = new Map(
        existing.map((t) => [
          `${normalizeName(t.first_name)}::${normalizeName(t.last_name)}`,
          t,
        ]),
      )
    }
    const key = `${normalizeName(firstName)}::${normalizeName(lastName)}`
    const existingTech = cache.techniciansByName.get(key)

    if (existingTech) {
      return {
        index: 0,
        values: row,
        status: 'duplicate',
        messages,
        existingId: existingTech.id,
      }
    }

    return { index: 0, values: row, status: 'valid', messages }
  },

  async importRow(row, analysis, context): Promise<'created' | 'updated' | 'skipped'> {
    const input: CreateTechnicianInput = {
      first_name: (row.first_name ?? '').trim(),
      last_name: (row.last_name ?? '').trim(),
      role: row.role ?? undefined,
      email: row.email ?? undefined,
      phone: row.phone ?? undefined,
      notes: row.notes ?? undefined,
    }
    if (analysis.status === 'duplicate' && analysis.duplicateAction === 'update' && analysis.existingId) {
      await updateTechnician(analysis.existingId, input)
      return 'updated'
    }
    if (analysis.status === 'valid') {
      await createTechnician(input, context.organizationId)
      return 'created'
    }
    return 'skipped'
  },
}

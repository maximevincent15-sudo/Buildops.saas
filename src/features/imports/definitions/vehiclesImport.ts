import { createVehicle, listVehicles, updateVehicle } from '../../vehicles/api'
import type { CreateVehicleInput, Vehicle } from '../../vehicles/schemas'
import { parseFlexibleDate, parseFlexibleInt, resolveTechnicianByName } from '../helpers'
import type { ImportDefinition, RowAnalysis } from '../types'

function normalizePlate(s: string): string {
  return s.replace(/[^A-Za-z0-9]/g, '').toUpperCase()
}

/**
 * Import véhicules (Phase A.3).
 * Dédup par plaque normalisée.
 */
export const vehiclesImportDefinition: ImportDefinition = {
  entityLabel: 'véhicule',
  entityLabelPlural: 'véhicules',
  templateFilename: 'vehicules-buildops.xlsx',
  description:
    "Importe ton parc véhicules. La plaque est obligatoire. Les dates peuvent être au format JJ/MM/AAAA ou AAAA-MM-JJ. Le nom du technicien assigné est optionnel — s'il n'existe pas dans tes techniciens BuildOps, on mettra le véhicule au pool commun.",
  fields: [
    { key: 'license_plate', label: 'Plaque', required: true, example: 'AB-123-CD' },
    { key: 'brand', label: 'Marque', example: 'Renault' },
    { key: 'model', label: 'Modèle', example: 'Kangoo' },
    { key: 'year', label: 'Année', example: '2021' },
    { key: 'mileage', label: 'Kilométrage', example: '85000' },
    { key: 'technician_name', label: 'Technicien assigné', example: 'Thomas Moreau' },
    { key: 'next_mot_date', label: 'Prochain CT', example: '15/06/2026' },
    { key: 'next_insurance_date', label: 'Échéance assurance', example: '31/12/2026' },
    { key: 'next_service_date', label: 'Prochaine vidange', example: '10/09/2026' },
    { key: 'notes', label: 'Notes internes', example: 'Clé chez Thomas' },
  ],

  async validateRow(row, context): Promise<RowAnalysis> {
    const messages: string[] = []
    const plate = (row.license_plate ?? '').trim()
    if (!plate) {
      return {
        index: 0,
        values: row,
        status: 'invalid',
        messages: ['Plaque d\'immatriculation obligatoire'],
      }
    }

    // Validation année
    const yearStr = (row.year ?? '').trim()
    if (yearStr) {
      const y = parseFlexibleInt(yearStr)
      if (y === null || y < 1950 || y > 2100) {
        messages.push(`Année "${yearStr}" invalide (sera ignorée)`)
      }
    }

    // Validation dates
    for (const [key, label] of [
      ['next_mot_date', 'Prochain CT'],
      ['next_insurance_date', 'Échéance assurance'],
      ['next_service_date', 'Prochaine vidange'],
    ] as const) {
      const raw = row[key]
      if (raw && !parseFlexibleDate(raw)) {
        messages.push(`${label} : date "${raw}" non reconnue, sera ignorée`)
      }
    }

    // Vérif technicien
    if (row.technician_name) {
      const tech = await resolveTechnicianByName(row.technician_name, context.cache ?? {})
      if (!tech) {
        messages.push(`Technicien "${row.technician_name}" introuvable → véhicule mis au pool commun`)
      }
    }

    // Dédup par plaque normalisée
    const cache = context.cache as { vehiclesByPlate?: Map<string, Vehicle> }
    if (!cache.vehiclesByPlate) {
      const existing = await listVehicles()
      cache.vehiclesByPlate = new Map(
        existing.map((v) => [normalizePlate(v.license_plate), v]),
      )
    }
    const existingVehicle = cache.vehiclesByPlate.get(normalizePlate(plate))

    if (existingVehicle) {
      return {
        index: 0,
        values: row,
        status: 'duplicate',
        messages,
        existingId: existingVehicle.id,
      }
    }

    return { index: 0, values: row, status: 'valid', messages }
  },

  async importRow(row, analysis, context): Promise<'created' | 'updated' | 'skipped'> {
    const cache = context.cache ?? {}
    const tech = row.technician_name
      ? await resolveTechnicianByName(row.technician_name, cache)
      : null
    const yearParsed = parseFlexibleInt(row.year)
    const mileageParsed = parseFlexibleInt(row.mileage)

    const input: CreateVehicleInput = {
      license_plate: (row.license_plate ?? '').trim(),
      brand: row.brand ?? undefined,
      model: row.model ?? undefined,
      year: yearParsed ?? undefined,
      mileage: mileageParsed ?? undefined,
      technician_id: tech?.id ?? undefined,
      next_mot_date: parseFlexibleDate(row.next_mot_date) ?? undefined,
      next_insurance_date: parseFlexibleDate(row.next_insurance_date) ?? undefined,
      next_service_date: parseFlexibleDate(row.next_service_date) ?? undefined,
      notes: row.notes ?? undefined,
    }

    if (analysis.status === 'duplicate' && analysis.duplicateAction === 'update' && analysis.existingId) {
      await updateVehicle(analysis.existingId, input)
      return 'updated'
    }
    if (analysis.status === 'valid') {
      await createVehicle(input, context.organizationId)
      return 'created'
    }
    return 'skipped'
  },
}

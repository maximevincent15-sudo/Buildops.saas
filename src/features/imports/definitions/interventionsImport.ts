import { listClients, createClient } from '../../clients/api'
import type { Client } from '../../clients/schemas'
import { createIntervention, setInterventionStatus } from '../../planning/api'
import type { CreateInterventionInput } from '../../planning/schemas'
import { parseFlexibleDate, resolveTechnicianByName } from '../helpers'
import type { ImportDefinition, RowAnalysis } from '../types'

const VALID_EQUIPMENT_CODES = ['extincteurs', 'ria', 'desenfumage', 'ssi', 'extinction_auto'] as const
type EquipmentCode = (typeof VALID_EQUIPMENT_CODES)[number]

/**
 * Parse une liste d'équipements à partir d'un texte libre.
 * Accepte : "Extincteurs + RIA", "Extincteurs,RIA", "extincteurs;ria", etc.
 * Matche aussi quelques synonymes courants.
 */
function parseEquipmentTypes(input: string | null | undefined): EquipmentCode[] {
  if (!input) return []
  const parts = input
    .split(/[,;+/\n]+/)
    .map((p) => p.trim().toLowerCase())
    .map((p) =>
      p
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, ''),
    )
    .filter(Boolean)

  const result: EquipmentCode[] = []
  for (const p of parts) {
    if (p.includes('extinct') && p.includes('auto')) result.push('extinction_auto')
    else if (p.includes('extinct')) result.push('extincteurs')
    else if (p.includes('ria') || p.includes('robinet')) result.push('ria')
    else if (p.includes('desenfum') || p.includes('fumée') || p.includes('fumee')) result.push('desenfumage')
    else if (p.includes('ssi') || p.includes('alarm')) result.push('ssi')
  }
  return Array.from(new Set(result))
}

/**
 * Parse une priorité à partir d'un texte libre.
 * 'urgente' / 'urgent' → urgente
 * 'réglementaire' / 'regl' → reglementaire
 * sinon → normale
 */
function parsePriority(input: string | null | undefined): 'normale' | 'urgente' | 'reglementaire' {
  if (!input) return 'normale'
  const s = input.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  if (s.includes('urgent')) return 'urgente'
  if (s.startsWith('regl')) return 'reglementaire'
  return 'normale'
}

/**
 * Parse un statut texte vers un code BuildOps.
 * - "terminé", "fait", "done", "archivé" → terminee
 * - "en cours" → en_cours
 * - "planifié", "prévu" → planifiee (si date renseignée), sinon a_planifier
 * - par défaut : planifiee si date, sinon a_planifier
 */
function parseStatus(input: string | null | undefined, hasDate: boolean): string {
  if (!input) return hasDate ? 'planifiee' : 'a_planifier'
  const s = input.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim()
  if (s.includes('termin') || s.includes('fait') || s === 'done' || s.includes('archiv')) return 'terminee'
  if (s.includes('cours')) return 'en_cours'
  if (s.includes('planif') || s.includes('prevu') || s.includes('a faire')) return hasDate ? 'planifiee' : 'a_planifier'
  return hasDate ? 'planifiee' : 'a_planifier'
}

/**
 * Import interventions (Phase A.4 + A.5 combinées).
 *
 * Cet import sert à la fois :
 *  - au planning à venir (statut 'planifiee' / 'a_planifier')
 *  - à l'historique (statut 'terminee') pour déclencher immédiatement les
 *    alertes réglementaires à partir des anciennes dates de contrôle
 *
 * Comportement :
 *  - Si le client n'existe pas encore, on le crée automatiquement avec juste
 *    le nom (tu pourras enrichir sa fiche après)
 *  - Si le technicien n'existe pas, on laisse le champ vide (le nom textuel
 *    est conservé dans `technician_name` pour référence)
 *  - Pas de dédup : chaque ligne est une nouvelle intervention (la référence
 *    INT-XXXX est générée automatiquement)
 */
export const interventionsImportDefinition: ImportDefinition = {
  entityLabel: 'intervention',
  entityLabelPlural: 'interventions',
  templateFilename: 'interventions-buildops.xlsx',
  description:
    "Importe ton planning (à venir) ET/OU ton historique d'interventions. Les interventions avec statut 'terminée' alimentent directement les alertes réglementaires : tu verras tout de suite les prochains contrôles à planifier.",
  fields: [
    { key: 'client_name', label: 'Client', required: true, example: 'Valoris SA' },
    { key: 'site_name', label: 'Site', example: 'Bâtiment A' },
    { key: 'address', label: 'Adresse', example: '12 rue des Lilas, 75010 Paris' },
    {
      key: 'equipment_types',
      label: 'Équipements',
      required: true,
      example: 'Extincteurs + RIA',
    },
    { key: 'scheduled_date', label: 'Date', example: '15/05/2026' },
    { key: 'technician_name', label: 'Technicien', example: 'Thomas Moreau' },
    { key: 'priority', label: 'Priorité', example: 'normale' },
    {
      key: 'status',
      label: 'Statut',
      example: 'terminée',
    },
    { key: 'notes', label: 'Notes', example: 'Accès parking sous-sol' },
  ],

  async validateRow(row, context): Promise<RowAnalysis> {
    const messages: string[] = []
    const clientName = (row.client_name ?? '').trim()
    if (!clientName) {
      return {
        index: 0,
        values: row,
        status: 'invalid',
        messages: ['Nom du client obligatoire'],
      }
    }

    // Équipements : au moins un parseable
    const equipments = parseEquipmentTypes(row.equipment_types)
    if (equipments.length === 0) {
      return {
        index: 0,
        values: row,
        status: 'invalid',
        messages: [
          "Aucun équipement reconnu (accepte : extincteurs, ria, désenfumage, ssi, extinction automatique)",
        ],
      }
    }

    // Date si fournie
    if (row.scheduled_date) {
      const d = parseFlexibleDate(row.scheduled_date)
      if (!d) {
        messages.push(`Date "${row.scheduled_date}" non reconnue → l'intervention sera "à planifier"`)
      }
    }

    // Client : check s'il existe (on garde en cache)
    const cache = context.cache as { clientsByName?: Map<string, Client> }
    if (!cache.clientsByName) {
      const existing = await listClients()
      cache.clientsByName = new Map(
        existing.map((c) => [c.name.trim().toLowerCase(), c]),
      )
    }
    const clientExists = cache.clientsByName.has(clientName.toLowerCase())
    if (!clientExists) {
      messages.push(`Client "${clientName}" non trouvé → sera créé automatiquement`)
    }

    // Technicien : check s'il existe
    if (row.technician_name) {
      const tech = await resolveTechnicianByName(row.technician_name, context.cache ?? {})
      if (!tech) {
        messages.push(`Technicien "${row.technician_name}" non trouvé → laissé non assigné`)
      }
    }

    return { index: 0, values: row, status: 'valid', messages }
  },

  async importRow(row, _analysis, context): Promise<'created' | 'updated' | 'skipped'> {
    void _analysis // on ne fait pas de dédup sur interventions (toujours nouveau)
    const cache = context.cache as {
      clientsByName?: Map<string, Client>
    }

    // Résolution / création du client
    const clientName = (row.client_name ?? '').trim()
    const clientLower = clientName.toLowerCase()
    let client = cache.clientsByName?.get(clientLower)
    if (!client) {
      client = await createClient(
        {
          name: clientName,
          contact_name: undefined,
          contact_email: undefined,
          contact_phone: undefined,
          address: row.address ?? undefined,
          notes: undefined,
        },
        context.organizationId,
      )
      if (cache.clientsByName) cache.clientsByName.set(clientLower, client)
    }

    // Résolution du tech
    const tech = row.technician_name
      ? await resolveTechnicianByName(row.technician_name, context.cache ?? {})
      : null

    const equipments = parseEquipmentTypes(row.equipment_types) as CreateInterventionInput['equipment_types']
    const scheduledDate = parseFlexibleDate(row.scheduled_date)
    const hasDate = !!scheduledDate

    const input: CreateInterventionInput = {
      client_name: clientName,
      client_id: client.id,
      site_name: row.site_name ?? undefined,
      address: row.address ?? undefined,
      equipment_types: equipments,
      scheduled_date: scheduledDate ?? undefined,
      technician_name: row.technician_name ?? undefined,
      technician_id: tech?.id ?? undefined,
      priority: parsePriority(row.priority),
      notes: row.notes ?? undefined,
    }

    const created = await createIntervention(input, context.organizationId)

    // Si statut explicite != a_planifier/planifiee, on met à jour le statut
    const targetStatus = parseStatus(row.status, hasDate)
    if (targetStatus !== 'a_planifier' && targetStatus !== 'planifiee') {
      await setInterventionStatus(created.id, targetStatus)
    }

    return 'created'
  },
}

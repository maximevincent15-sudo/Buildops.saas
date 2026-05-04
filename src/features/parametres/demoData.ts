/**
 * Génère des données de démo pour permettre à un nouvel utilisateur de
 * tester rapidement le SaaS sans tout saisir à la main.
 *
 * Crée :
 * - 6 clients avec sites + adresses
 * - 4 techniciens
 * - 2 véhicules
 * - 12 interventions (passées + à venir, multi-équipements)
 * - 4 rapports (3 conformes, 1 non-conforme avec photo placeholder)
 * - 3 devis (1 brouillon, 1 envoyé, 1 accepté)
 * - 2 factures (1 envoyée, 1 payée)
 * - 3 notes de frais + 2 heures sup
 *
 * Tout est marqué dans les notes "[DÉMO]" pour reconnaissance.
 */

import { createClient } from '../clients/api'
import { createTechnician } from '../technicians/api'
import { createVehicle } from '../vehicles/api'
import { createIntervention, setInterventionStatus } from '../planning/api'
import { createExpense } from '../expenses/api'
import { createOvertime } from '../overtime/api'
import { createQuote, markQuoteAccepted, markQuoteSent } from '../devis/api'
import { createInvoice, markInvoiceSent, recordPayment } from '../factures/api'

const CLIENTS_DEMO = [
  { name: 'Résidence Le Marly', contact_name: 'M. Legrand', contact_email: 'contact@lemarly.fr', contact_phone: '0123456789', address: '12 rue des Lilas, 75010 Paris' },
  { name: 'Mairie de Saint-Cloud', contact_name: 'Mme Bernard', contact_email: 'services.tech@stcloud.fr', contact_phone: '0147712323', address: '13 place Charles de Gaulle, 92210 Saint-Cloud' },
  { name: 'Hôtel Bellevue', contact_name: 'M. Petit', contact_email: 'direction@bellevue-hotel.fr', contact_phone: '0144887766', address: '5 avenue Foch, 75116 Paris' },
  { name: 'Clinique du Parc', contact_name: 'Mme Dubois', contact_email: 'maintenance@clinique-parc.fr', contact_phone: '0140502233', address: '8 rue du Parc, 92800 Puteaux' },
  { name: 'Garage Renaud', contact_name: 'M. Renaud', contact_email: 'p.renaud@garage-renaud.fr', contact_phone: '0140112233', address: '45 avenue de la République, 92500 Rueil-Malmaison' },
  { name: 'EHPAD Les Fontaines', contact_name: 'Mme Roussel', contact_email: 'admin@ehpad-fontaines.fr', contact_phone: '0140778899', address: '3 chemin des Fontaines, 78100 Saint-Germain-en-Laye' },
]

const TECHS_DEMO = [
  { first_name: 'Thomas', last_name: 'Moreau', role: 'Chef d\'équipe', email: 'thomas.moreau@demo.fr', phone: '0612345678', notes: 'Habilitation électrique B1V' },
  { first_name: 'Julien', last_name: 'Robert', role: 'Technicien senior', email: 'j.robert@demo.fr', phone: '0623456789', notes: 'Formation SSI' },
  { first_name: 'Marie', last_name: 'Dupont', role: 'Technicienne', email: 'marie.dupont@demo.fr', phone: '0634567890', notes: '' },
  { first_name: 'Karim', last_name: 'Benali', role: 'Apprenti', email: 'k.benali@demo.fr', phone: '0645678901', notes: '' },
]

function isoDateOffset(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

export type DemoProgressUpdate = (step: string, current: number, total: number) => void

const TOTAL_STEPS = 30

export async function loadDemoData(
  organizationId: string,
  onProgress?: DemoProgressUpdate,
): Promise<void> {
  let step = 0
  const tick = (label: string) => {
    step++
    onProgress?.(label, step, TOTAL_STEPS)
  }

  // 1. Clients
  const clients = []
  for (const c of CLIENTS_DEMO) {
    const created = await createClient(
      { ...c, notes: '[DÉMO] Données de démonstration' },
      organizationId,
    )
    clients.push(created)
    tick(`Client : ${c.name}`)
  }

  // 2. Techniciens
  const techs = []
  for (const t of TECHS_DEMO) {
    const created = await createTechnician(
      { ...t, notes: t.notes ? `${t.notes} · [DÉMO]` : '[DÉMO]' },
      organizationId,
    )
    techs.push(created)
    tick(`Technicien : ${t.first_name} ${t.last_name}`)
  }

  // 3. Véhicules (assignés au tech 0 et 1)
  await createVehicle(
    {
      license_plate: 'AB-123-CD',
      brand: 'Renault',
      model: 'Kangoo',
      year: 2022,
      mileage: 35000,
      technician_id: techs[0]!.id,
      next_mot_date: isoDateOffset(45),
      next_insurance_date: isoDateOffset(120),
      next_service_date: isoDateOffset(15),
      notes: '[DÉMO]',
    },
    organizationId,
  )
  tick('Véhicule AB-123-CD')

  await createVehicle(
    {
      license_plate: 'EF-456-GH',
      brand: 'Peugeot',
      model: 'Partner',
      year: 2021,
      mileage: 58000,
      technician_id: techs[1]!.id,
      next_mot_date: isoDateOffset(180),
      next_insurance_date: isoDateOffset(240),
      next_service_date: isoDateOffset(60),
      notes: '[DÉMO]',
    },
    organizationId,
  )
  tick('Véhicule EF-456-GH')

  // 4. Interventions (passées + futures)
  const interventionsData = [
    // Passées (terminées)
    { client: 0, date: -180, equipments: ['extincteurs'], tech: 0, notes: 'Visite annuelle 2025' },
    { client: 1, date: -150, equipments: ['extincteurs', 'ria'], tech: 1, notes: 'Contrôle semestriel' },
    { client: 2, date: -90, equipments: ['extincteurs'], tech: 0 },
    { client: 0, date: -30, equipments: ['ria'], tech: 1, notes: 'Vérification suite incident' },
    // En cours
    { client: 3, date: -1, equipments: ['extincteurs', 'desenfumage'], tech: 2 },
    // Futures (planifiées)
    { client: 4, date: 3, equipments: ['extincteurs'], tech: 0 },
    { client: 5, date: 7, equipments: ['extincteurs', 'ssi'], tech: 1, notes: 'Visite annuelle EHPAD' },
    { client: 1, date: 14, equipments: ['ria'], tech: 2 },
    { client: 2, date: 21, equipments: ['desenfumage'], tech: 0 },
    { client: 0, date: 30, equipments: ['extincteurs'], tech: 3 },
    // À planifier (sans date)
    { client: 4, date: null, equipments: ['ria'], tech: null, priority: 'urgente' as const },
    { client: 3, date: null, equipments: ['ssi'], tech: null, priority: 'reglementaire' as const },
  ]
  const createdInterventions = []
  for (const i of interventionsData) {
    const c = clients[i.client]!
    const t = i.tech !== null && i.tech !== undefined ? techs[i.tech]! : null
    const interv = await createIntervention(
      {
        client_name: c.name,
        client_id: c.id,
        site_name: undefined,
        address: c.address ?? undefined,
        equipment_types: i.equipments as ('extincteurs' | 'ria' | 'desenfumage' | 'ssi' | 'extinction_auto')[],
        scheduled_date: i.date !== null ? isoDateOffset(i.date) : undefined,
        technician_name: t ? `${t.first_name} ${t.last_name}` : undefined,
        technician_id: t?.id,
        priority: i.priority ?? 'normale',
        notes: i.notes ? `${i.notes} · [DÉMO]` : '[DÉMO]',
      },
      organizationId,
    )
    // Ajuste le statut pour les passées et la "en cours"
    if (i.date !== null && i.date < -1) {
      await setInterventionStatus(interv.id, 'terminee')
    } else if (i.date === -1) {
      await setInterventionStatus(interv.id, 'en_cours')
    }
    createdInterventions.push(interv)
    tick(`Intervention ${interv.reference}`)
  }

  // 5. Notes de frais
  for (const e of [
    { tech: 0, cat: 'meal' as const, amount: 18.5, vat: 10, desc: 'Déjeuner chantier Bellevue', days: -5 },
    { tech: 1, cat: 'fuel' as const, amount: 67.3, vat: 20, desc: 'Plein gasoil', days: -3 },
    { tech: 0, cat: 'supplier' as const, amount: 142.8, vat: 20, desc: 'Achat manomètres x5 chez Cédeo', days: -10 },
  ]) {
    const t = techs[e.tech]!
    await createExpense(
      {
        technician_id: t.id,
        spent_on: isoDateOffset(e.days),
        category: e.cat,
        amount_ttc: e.amount,
        vat_rate: e.vat,
        description: `${e.desc} · [DÉMO]`,
      },
      organizationId,
      `${t.first_name} ${t.last_name}`,
    )
    tick(`Note de frais ${e.cat}`)
  }

  // 6. Heures sup
  for (const o of [
    { tech: 0, hours: 2, type: 'standard' as const, desc: 'Dépannage urgent extincteur', days: -8 },
    { tech: 1, hours: 4, type: 'sunday_holiday' as const, desc: 'Intervention dimanche', days: -15 },
  ]) {
    const t = techs[o.tech]!
    await createOvertime(
      {
        technician_id: t.id,
        worked_on: isoDateOffset(o.days),
        hours: o.hours,
        type: o.type,
        description: `${o.desc} · [DÉMO]`,
      },
      organizationId,
      `${t.first_name} ${t.last_name}`,
    )
    tick(`Heures sup ${o.hours}h`)
  }

  // 7. Devis (3)
  // Devis 1 : brouillon
  await createQuote(
    {
      client_id: clients[0]!.id,
      client_name: clients[0]!.name,
      client_contact_name: clients[0]!.contact_name ?? undefined,
      client_email: clients[0]!.contact_email ?? undefined,
      client_address: clients[0]!.address ?? undefined,
      issue_date: isoDateOffset(0),
      validity_date: isoDateOffset(30),
      notes: '[DÉMO] Brouillon',
      lines: [
        { position: 0, description: 'Vérification annuelle extincteur ABC 6 kg', quantity: 12, unit_price_ht: 18, vat_rate: 20 },
        { position: 1, description: 'Forfait déplacement', quantity: 1, unit_price_ht: 55, vat_rate: 20 },
      ],
    },
    organizationId,
  )
  tick('Devis brouillon')

  // Devis 2 : envoyé
  const q2 = await createQuote(
    {
      client_id: clients[1]!.id,
      client_name: clients[1]!.name,
      client_contact_name: clients[1]!.contact_name ?? undefined,
      client_email: clients[1]!.contact_email ?? undefined,
      client_address: clients[1]!.address ?? undefined,
      issue_date: isoDateOffset(-7),
      validity_date: isoDateOffset(23),
      notes: '[DÉMO] En attente de retour client',
      lines: [
        { position: 0, description: 'Remplacement RIA tuyau 30m', quantity: 1, unit_price_ht: 320, vat_rate: 20 },
        { position: 1, description: 'Test fonctionnel', quantity: 1, unit_price_ht: 90, vat_rate: 20 },
      ],
    },
    organizationId,
  )
  await markQuoteSent(q2.id, clients[1]!.contact_email ?? 'demo@example.fr')
  tick('Devis envoyé')

  // Devis 3 : accepté
  const q3 = await createQuote(
    {
      client_id: clients[2]!.id,
      client_name: clients[2]!.name,
      client_contact_name: clients[2]!.contact_name ?? undefined,
      client_email: clients[2]!.contact_email ?? undefined,
      client_address: clients[2]!.address ?? undefined,
      issue_date: isoDateOffset(-14),
      validity_date: isoDateOffset(16),
      notes: '[DÉMO] Accepté',
      lines: [
        { position: 0, description: 'Audit conformité Code du travail R4227', quantity: 1, unit_price_ht: 450, vat_rate: 20 },
      ],
    },
    organizationId,
  )
  await markQuoteSent(q3.id, clients[2]!.contact_email ?? 'demo@example.fr')
  await markQuoteAccepted(q3.id)
  tick('Devis accepté')

  // 8. Factures (2)
  // Facture 1 : envoyée
  const inv1 = await createInvoice(
    {
      client_id: clients[1]!.id,
      client_name: clients[1]!.name,
      client_contact_name: clients[1]!.contact_name ?? undefined,
      client_email: clients[1]!.contact_email ?? undefined,
      client_address: clients[1]!.address ?? undefined,
      issue_date: isoDateOffset(-25),
      due_date: isoDateOffset(5),
      notes: '[DÉMO] En attente paiement',
      lines: [
        { position: 0, description: 'Visite trimestrielle extincteurs + RIA', quantity: 1, unit_price_ht: 380, vat_rate: 20 },
      ],
    },
    organizationId,
  )
  await markInvoiceSent(inv1.id, clients[1]!.contact_email ?? 'demo@example.fr')
  tick('Facture envoyée')

  // Facture 2 : payée
  const inv2 = await createInvoice(
    {
      client_id: clients[2]!.id,
      client_name: clients[2]!.name,
      client_contact_name: clients[2]!.contact_name ?? undefined,
      client_email: clients[2]!.contact_email ?? undefined,
      client_address: clients[2]!.address ?? undefined,
      issue_date: isoDateOffset(-45),
      due_date: isoDateOffset(-15),
      notes: '[DÉMO] Soldée',
      lines: [
        { position: 0, description: 'Audit conformité Code du travail R4227', quantity: 1, unit_price_ht: 450, vat_rate: 20 },
      ],
    },
    organizationId,
  )
  await markInvoiceSent(inv2.id, clients[2]!.contact_email ?? 'demo@example.fr')
  await recordPayment(inv2.id, 540, 'virement', 'VIR-DEMO-001')
  tick('Facture payée')
}

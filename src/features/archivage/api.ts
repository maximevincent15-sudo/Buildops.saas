import { supabase } from '../../shared/lib/supabase'

/**
 * Représente un document archivé (rapport / devis / facture).
 * On agrège les 3 sources pour avoir une vue unifiée dans la page Archivage.
 */
export type ArchivedDocument = {
  id: string
  kind: 'report' | 'quote' | 'invoice'
  reference: string
  /** Date d'émission / finalisation */
  date: string
  client_name: string
  client_id: string | null
  site_name: string | null
  pdf_url: string | null
  /** Pour les rapports : id de l'intervention parent (pour ouvrir le rapport) */
  intervention_id?: string
  /** Statut affichable */
  status: string
  /** Montant TTC (devis/factures uniquement) */
  amount_ttc?: number
}

/**
 * Récupère tous les documents archivés de l'organisation, fusionnés et triés
 * par date descendante.
 *
 * Sources :
 * - Rapports finalisés (completed_at non null) + intervention pour la référence
 * - Devis (sauf draft) + ses infos client
 * - Factures (sauf draft) + ses infos client
 */
export async function listArchivedDocuments(): Promise<ArchivedDocument[]> {
  const docs: ArchivedDocument[] = []

  // ─── Rapports finalisés ─────────────────────────────────────────────
  try {
    const { data: reports, error: rErr } = await supabase
      .from('reports')
      .select(`
        id, intervention_id, completed_at, pdf_url, created_at,
        intervention:interventions ( id, reference, client_name, client_id, site_name, status )
      `)
      .not('completed_at', 'is', null)
      .order('completed_at', { ascending: false })

    if (!rErr && reports) {
      for (const r of reports as unknown as Array<{
        id: string
        intervention_id: string
        completed_at: string | null
        pdf_url: string | null
        created_at: string
        intervention: {
          id: string
          reference: string
          client_name: string
          client_id: string | null
          site_name: string | null
          status: string
        } | null
      }>) {
        const interv = r.intervention
        if (!interv) continue
        docs.push({
          id: r.id,
          kind: 'report',
          reference: interv.reference,
          date: r.completed_at ?? r.created_at,
          client_name: interv.client_name,
          client_id: interv.client_id,
          site_name: interv.site_name,
          pdf_url: r.pdf_url,
          intervention_id: r.intervention_id,
          status: 'finalisé',
        })
      }
    }
  } catch (e) {
    console.warn('Erreur chargement rapports archivés:', e)
  }

  // ─── Devis (sauf draft) ─────────────────────────────────────────────
  try {
    const { data: quotes, error: qErr } = await supabase
      .from('quotes')
      .select('id, reference, issue_date, client_name, client_id, site_name, pdf_url, status, total_ttc')
      .neq('status', 'draft')
      .order('issue_date', { ascending: false })

    if (!qErr && quotes) {
      for (const q of quotes as unknown as Array<{
        id: string
        reference: string
        issue_date: string
        client_name: string
        client_id: string | null
        site_name: string | null
        pdf_url: string | null
        status: string
        total_ttc: number
      }>) {
        docs.push({
          id: q.id,
          kind: 'quote',
          reference: q.reference,
          date: q.issue_date,
          client_name: q.client_name,
          client_id: q.client_id,
          site_name: q.site_name,
          pdf_url: q.pdf_url,
          status: q.status,
          amount_ttc: Number(q.total_ttc),
        })
      }
    }
  } catch (e) {
    console.warn('Erreur chargement devis archivés:', e)
  }

  // ─── Factures (sauf draft) ──────────────────────────────────────────
  try {
    const { data: invoices, error: iErr } = await supabase
      .from('invoices')
      .select('id, reference, issue_date, client_name, client_id, site_name, pdf_url, status, total_ttc')
      .neq('status', 'draft')
      .order('issue_date', { ascending: false })

    if (!iErr && invoices) {
      for (const inv of invoices as unknown as Array<{
        id: string
        reference: string
        issue_date: string
        client_name: string
        client_id: string | null
        site_name: string | null
        pdf_url: string | null
        status: string
        total_ttc: number
      }>) {
        docs.push({
          id: inv.id,
          kind: 'invoice',
          reference: inv.reference,
          date: inv.issue_date,
          client_name: inv.client_name,
          client_id: inv.client_id,
          site_name: inv.site_name,
          pdf_url: inv.pdf_url,
          status: inv.status,
          amount_ttc: Number(inv.total_ttc),
        })
      }
    }
  } catch (e) {
    console.warn('Erreur chargement factures archivées:', e)
  }

  // Tri unifié par date descendante
  docs.sort((a, b) => b.date.localeCompare(a.date))
  return docs
}

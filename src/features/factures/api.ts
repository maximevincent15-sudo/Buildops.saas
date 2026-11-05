import { supabase } from '../../shared/lib/supabase'
import { cleanLineFormat } from '../../shared/lib/lineFormat'
import { computeQuoteTotals } from '../devis/constants'
import { getQuote } from '../devis/api'
import { netTotalTtc } from './constants'
import type { Invoice, InvoiceLine, InvoiceLineInput, InvoiceWithLines, UpsertInvoiceInput } from './schemas'

export async function listInvoices(): Promise<Invoice[]> {
  const { data, error } = await supabase
    .from('invoices')
    .select('*')
    .order('issue_date', { ascending: false })
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as Invoice[]
}

export async function getInvoice(id: string): Promise<InvoiceWithLines | null> {
  const { data: invoice, error: iErr } = await supabase
    .from('invoices')
    .select('*')
    .eq('id', id)
    .maybeSingle()
  if (iErr) throw iErr
  if (!invoice) return null

  const { data: lines, error: lErr } = await supabase
    .from('invoice_lines')
    .select('*')
    .eq('invoice_id', id)
    .order('position', { ascending: true })
  if (lErr) throw lErr

  return {
    ...(invoice as Invoice),
    lines: (lines ?? []) as InvoiceLine[],
  }
}

export async function createInvoice(
  input: UpsertInvoiceInput,
  organizationId: string,
  /** Facture issue d'un contrat de maintenance (« Facturer le mois ») */
  contractLink?: { contract_id: string; contract_period_start?: string | null },
  options: { isDeposit?: boolean } = {},
): Promise<InvoiceWithLines> {
  const totals = computeQuoteTotals(
    input.lines.map((l) => ({
      quantity: l.quantity,
      unit_price_ht: l.unit_price_ht,
      vat_rate: l.vat_rate,
    })),
  )

  const { data: invoice, error: iErr } = await supabase
    .from('invoices')
    .insert({
      organization_id: organizationId,
      quote_id: input.quote_id || null,
      client_id: input.client_id || null,
      client_name: input.client_name,
      client_contact_name: input.client_contact_name || null,
      client_address: input.client_address || null,
      client_siren: input.client_siren || null,
      client_email: input.client_email || null,
      intervention_id: input.intervention_id || null,
      site_name: input.site_name || null,
      site_address: input.site_address || null,
      dossier_number: input.dossier_number?.trim() || null,
      issue_date: input.issue_date,
      due_date: input.due_date || null,
      notes: input.notes || null,
      total_ht: totals.total_ht,
      total_vat: totals.total_vat,
      total_ttc: totals.total_ttc,
      status: 'draft',
      ...(options.isDeposit ? { is_deposit: true } : {}),
      ...(contractLink ? { contract_id: contractLink.contract_id, contract_period_start: contractLink.contract_period_start ?? null } : {}),
    })
    .select()
    .single()
  if (iErr) throw iErr

  const linesPayload = input.lines.map((l, i) => ({
    invoice_id: (invoice as Invoice).id,
    position: l.position ?? i,
    description: l.description.trim(),
    quantity: l.quantity,
    unit_price_ht: l.unit_price_ht,
    vat_rate: l.vat_rate,
    format: cleanLineFormat(l.format),
    deposit_invoice_id: l.deposit_invoice_id ?? null,
  }))
  const { error: lErr } = await supabase.from('invoice_lines').insert(linesPayload)
  if (lErr) {
    // Pas de brouillon sans lignes (ex. acompte déjà déduit ailleurs)
    await supabase.from('invoices').delete().eq('id', (invoice as Invoice).id)
    throw lErr
  }

  const full = await getInvoice((invoice as Invoice).id)
  if (!full) throw new Error('Facture introuvable après création')
  return full
}

export async function updateInvoice(
  id: string,
  input: UpsertInvoiceInput,
): Promise<InvoiceWithLines> {
  const totals = computeQuoteTotals(
    input.lines.map((l) => ({
      quantity: l.quantity,
      unit_price_ht: l.unit_price_ht,
      vat_rate: l.vat_rate,
    })),
  )

  const { error: iErr } = await supabase
    .from('invoices')
    .update({
      client_id: input.client_id || null,
      client_name: input.client_name,
      client_contact_name: input.client_contact_name || null,
      client_address: input.client_address || null,
      client_siren: input.client_siren || null,
      client_email: input.client_email || null,
      intervention_id: input.intervention_id || null,
      quote_id: input.quote_id || null,
      site_name: input.site_name || null,
      site_address: input.site_address || null,
      dossier_number: input.dossier_number?.trim() || null,
      issue_date: input.issue_date,
      due_date: input.due_date || null,
      notes: input.notes || null,
      total_ht: totals.total_ht,
      total_vat: totals.total_vat,
      total_ttc: totals.total_ttc,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
  if (iErr) throw iErr

  const { error: delErr } = await supabase
    .from('invoice_lines')
    .delete()
    .eq('invoice_id', id)
  if (delErr) throw delErr

  const linesPayload = input.lines.map((l, i) => ({
    invoice_id: id,
    position: l.position ?? i,
    description: l.description.trim(),
    quantity: l.quantity,
    unit_price_ht: l.unit_price_ht,
    vat_rate: l.vat_rate,
    format: cleanLineFormat(l.format),
    deposit_invoice_id: l.deposit_invoice_id ?? null,
  }))
  const { error: lErr } = await supabase.from('invoice_lines').insert(linesPayload)
  if (lErr) throw lErr

  const full = await getInvoice(id)
  if (!full) throw new Error('Facture introuvable après update')
  return full
}

export async function deleteInvoice(id: string): Promise<void> {
  const { error } = await supabase.from('invoices').delete().eq('id', id)
  if (error) throw error
}

// ─── Workflow ─────────────────────────────────────────────────────────

/**
 * Émet un brouillon : la base lui donne son numéro définitif, la date du
 * jour et décale l'échéance d'autant (déclencheur invoices_assign_number).
 */
export async function issueInvoice(id: string): Promise<InvoiceWithLines> {
  const { error } = await supabase
    .from('invoices')
    .update({ status: 'sent' })
    .eq('id', id)
    .eq('status', 'draft')
  if (error) throw error
  const full = await getInvoice(id)
  if (!full) throw new Error('Facture introuvable après émission')
  return full
}

/** Note l'envoi au client (émet d'abord la facture si elle est encore en brouillon) */
export async function markInvoiceSent(id: string, recipientEmail: string): Promise<void> {
  const { error: issueErr } = await supabase.from('invoices').update({ status: 'sent' }).eq('id', id).eq('status', 'draft')
  if (issueErr) throw issueErr
  const { error } = await supabase
    .from('invoices')
    .update({ sent_at: new Date().toISOString(), sent_to_email: recipientEmail })
    .eq('id', id)
  if (error) throw error
}

/**
 * Enregistre un règlement. Si le total (avoirs déduits) est atteint, passe
 * statut 'paid', avec la date du règlement (le jour même par défaut).
 */
export async function recordPayment(
  id: string,
  amount: number,
  method: string,
  reference: string | null,
  /** Date du règlement (AAAA-MM-JJ), si saisi après coup */
  paidOn?: string | null,
): Promise<void> {
  // Récupère le total, les avoirs et le déjà payé
  const { data: inv, error: getErr } = await supabase
    .from('invoices')
    .select('total_ttc, credited_ttc, amount_paid')
    .eq('id', id)
    .single()
  if (getErr) throw getErr

  const totalTtc = netTotalTtc(inv as { total_ttc: number; credited_ttc?: number })
  const previouslyPaid = Number((inv as { amount_paid: number }).amount_paid ?? 0)
  const newPaid = Math.min(totalTtc, previouslyPaid + amount)

  // Statut : payé si total atteint, sinon partiellement payé
  const isFullyPaid = newPaid >= totalTtc - 0.01 // tolérance arrondi
  const update: Record<string, unknown> = {
    amount_paid: newPaid,
    payment_method: method || null,
    payment_reference: reference || null,
  }
  if (isFullyPaid) {
    update.status = 'paid'
    update.paid_at = paidOn && paidOn < new Date().toISOString().slice(0, 10) ? `${paidOn}T12:00:00` : new Date().toISOString()
  } else {
    update.status = 'partially_paid'
  }

  const { error } = await supabase.from('invoices').update(update).eq('id', id)
  if (error) throw error
}

/** Annule les règlements : la facture émise redevient « envoyée » (jamais brouillon) */
export async function resetInvoicePayment(id: string): Promise<void> {
  const { error } = await supabase
    .from('invoices')
    .update({
      status: 'sent',
      amount_paid: 0,
      paid_at: null,
      payment_method: null,
      payment_reference: null,
    })
    .eq('id', id)
  if (error) throw error
}

export async function setInvoicePdfUrl(id: string, pdfUrl: string): Promise<void> {
  const { error } = await supabase
    .from('invoices')
    .update({ pdf_url: pdfUrl })
    .eq('id', id)
  if (error) throw error
}

// ─── Avoirs ───────────────────────────────────────────────────────────

/** Avoirs d'une facture (brouillons compris), du plus ancien au plus récent */
export async function listCreditNotes(invoiceId: string): Promise<Invoice[]> {
  const { data, error } = await supabase
    .from('invoices')
    .select('*')
    .eq('credited_invoice_id', invoiceId)
    .order('created_at', { ascending: true })
  if (error) throw error
  return (data ?? []) as Invoice[]
}

/**
 * Crée l'avoir d'une facture émise, en brouillon (reprend le client, le site
 * et le dossier de la facture). Montants des lignes en positif.
 */
export async function createCreditNote(
  invoice: Invoice,
  lines: InvoiceLineInput[],
  reason: string,
): Promise<InvoiceWithLines> {
  const totals = computeQuoteTotals(lines.map((l) => ({ quantity: l.quantity, unit_price_ht: l.unit_price_ht, vat_rate: l.vat_rate })))
  const { data: note, error } = await supabase
    .from('invoices')
    .insert({
      organization_id: invoice.organization_id,
      kind: 'credit_note',
      credited_invoice_id: invoice.id,
      client_id: invoice.client_id,
      client_name: invoice.client_name,
      client_contact_name: invoice.client_contact_name,
      client_address: invoice.client_address,
      client_siren: invoice.client_siren,
      client_email: invoice.client_email,
      intervention_id: invoice.intervention_id,
      site_name: invoice.site_name,
      site_address: invoice.site_address,
      dossier_number: invoice.dossier_number,
      issue_date: new Date().toISOString().slice(0, 10),
      due_date: null,
      notes: reason.trim() || null,
      total_ht: totals.total_ht,
      total_vat: totals.total_vat,
      total_ttc: totals.total_ttc,
      status: 'draft',
    })
    .select()
    .single()
  if (error) throw error
  const noteId = (note as Invoice).id
  const { error: lErr } = await supabase.from('invoice_lines').insert(lines.map((l, i) => ({
    invoice_id: noteId,
    position: i,
    description: l.description.trim(),
    quantity: l.quantity,
    unit_price_ht: l.unit_price_ht,
    vat_rate: l.vat_rate,
    format: cleanLineFormat(l.format),
  })))
  if (lErr) {
    await supabase.from('invoices').delete().eq('id', noteId)
    throw lErr
  }
  const full = await getInvoice(noteId)
  if (!full) throw new Error('Avoir introuvable après création')
  return full
}

// ─── Acomptes ─────────────────────────────────────────────────────────

const round2 = (n: number) => Math.round(n * 100) / 100

export type QuoteDeposit = {
  id: string
  reference: string
  status: Invoice['status']
  issue_date: string
  total_ht: number
  total_ttc: number
  credited_ttc: number
  /** Facture (non annulée) qui déduit déjà cet acompte */
  deducted_in: string | null
}

/** Factures d'acompte d'un devis, avec la facture qui les déduit le cas échéant */
export async function listQuoteDeposits(quoteId: string): Promise<QuoteDeposit[]> {
  const { data, error } = await supabase
    .from('invoices')
    .select('id, reference, status, issue_date, total_ht, total_ttc, credited_ttc')
    .eq('quote_id', quoteId)
    .eq('is_deposit', true)
    .order('created_at', { ascending: true })
  if (error) throw error
  const deposits = (data ?? []) as Array<Omit<QuoteDeposit, 'deducted_in'>>
  if (deposits.length === 0) return []
  const { data: uses, error: uErr } = await supabase
    .from('invoice_lines')
    .select('deposit_invoice_id, invoices!invoice_lines_invoice_id_fkey(reference, status)')
    .in('deposit_invoice_id', deposits.map((d) => d.id))
  if (uErr) throw uErr
  const deductedIn = new Map<string, string>()
  for (const u of (uses ?? []) as unknown as Array<{ deposit_invoice_id: string; invoices: { reference: string; status: string } | null }>) {
    if (u.invoices && u.invoices.status !== 'cancelled') deductedIn.set(u.deposit_invoice_id, u.invoices.reference)
  }
  return deposits.map((d) => ({ ...d, deducted_in: deductedIn.get(d.id) ?? null }))
}

/**
 * Facture d'acompte d'un devis, en brouillon : un pourcentage ou un montant
 * TTC du devis, réparti par taux de TVA comme le devis. Payable à réception.
 */
export async function createDepositInvoice(
  quoteId: string,
  organizationId: string,
  share: { percent: number } | { amountTtc: number },
): Promise<InvoiceWithLines> {
  const quote = await getQuote(quoteId)
  if (!quote) throw new Error('Devis introuvable')
  const totals = computeQuoteTotals(quote.lines.map((l) => ({ quantity: Number(l.quantity), unit_price_ht: Number(l.unit_price_ht), vat_rate: Number(l.vat_rate) })))
  if (totals.total_ttc <= 0) throw new Error('Le devis n\'a pas de montant.')
  const ratio = 'percent' in share ? share.percent / 100 : share.amountTtc / totals.total_ttc
  if (!(ratio > 0) || ratio > 1) throw new Error('L\'acompte doit être compris entre 0 et le montant du devis.')
  const label = 'percent' in share
    ? `Acompte de ${String(share.percent).replace('.', ',')} % sur le devis ${quote.reference}`
    : `Acompte sur le devis ${quote.reference}`
  const rates = Object.keys(totals.ht_by_rate).filter((r) => (totals.ht_by_rate[r] ?? 0) !== 0)
  const today = new Date().toISOString().slice(0, 10)
  return createInvoice(
    {
      quote_id: quote.id,
      client_id: quote.client_id ?? undefined,
      client_name: quote.client_name,
      client_contact_name: quote.client_contact_name ?? undefined,
      client_address: quote.client_address ?? undefined,
      client_siren: quote.client_siren ?? undefined,
      client_email: quote.client_email ?? undefined,
      site_name: quote.site_name ?? undefined,
      site_address: quote.site_address ?? undefined,
      dossier_number: quote.dossier_number ?? undefined,
      issue_date: today,
      // Acompte payable à réception
      due_date: today,
      lines: rates.map((rate, i) => ({
        position: i,
        description: `${label}${rates.length > 1 ? ` (TVA ${rate.replace('.', ',')} %)` : ''}\nMontant du devis : ${totals.total_ht.toFixed(2).replace('.', ',')} € HT`,
        quantity: 1,
        unit_price_ht: round2((totals.ht_by_rate[rate] ?? 0) * ratio),
        vat_rate: Number(rate),
      })),
    },
    organizationId,
    undefined,
    { isDeposit: true },
  )
}

/**
 * Lignes de déduction des acomptes émis d'un devis, pas encore déduits :
 * une ligne négative par taux de TVA (au prorata si l'acompte a un avoir).
 */
async function depositDeductionLines(quoteId: string, firstPosition: number): Promise<InvoiceLineInput[]> {
  const deposits = (await listQuoteDeposits(quoteId))
    .filter((d) => d.status !== 'draft' && d.status !== 'cancelled' && !d.deducted_in)
  if (deposits.length === 0) return []
  const { data, error } = await supabase
    .from('invoice_lines')
    .select('invoice_id, quantity, unit_price_ht, vat_rate')
    .in('invoice_id', deposits.map((d) => d.id))
  if (error) throw error
  const lines = (data ?? []) as Array<{ invoice_id: string; quantity: number; unit_price_ht: number; vat_rate: number }>
  const out: InvoiceLineInput[] = []
  for (const d of deposits) {
    const own = lines.filter((l) => l.invoice_id === d.id)
    const t = computeQuoteTotals(own.map((l) => ({ quantity: Number(l.quantity), unit_price_ht: Number(l.unit_price_ht), vat_rate: Number(l.vat_rate) })))
    const net = Number(d.total_ttc) > 0 ? (Number(d.total_ttc) - Number(d.credited_ttc ?? 0)) / Number(d.total_ttc) : 0
    const rates = Object.keys(t.ht_by_rate).filter((r) => (t.ht_by_rate[r] ?? 0) !== 0)
    const date = new Date(`${d.issue_date}T12:00:00`).toLocaleDateString('fr-FR')
    for (const rate of rates) {
      out.push({
        position: firstPosition + out.length,
        description: `Acompte ${d.reference} du ${date} déjà facturé${rates.length > 1 ? ` (TVA ${rate.replace('.', ',')} %)` : ''}`,
        quantity: 1,
        unit_price_ht: -round2((t.ht_by_rate[rate] ?? 0) * net),
        vat_rate: Number(rate),
        deposit_invoice_id: d.id,
      })
    }
  }
  return out.filter((l) => l.unit_price_ht !== 0)
}

// ─── Transformation devis → facture ───────────────────────────────────

export async function createInvoiceFromQuote(
  quoteId: string,
  organizationId: string,
): Promise<InvoiceWithLines> {
  const quote = await getQuote(quoteId)
  if (!quote) throw new Error('Devis introuvable')

  // Date d'émission = aujourd'hui ; échéance = +30j
  const issueDate = new Date().toISOString().slice(0, 10)
  const due = new Date()
  due.setDate(due.getDate() + 30)
  const dueDate = due.toISOString().slice(0, 10)

  return createInvoice(
    {
      quote_id: quote.id,
      client_id: quote.client_id ?? undefined,
      client_name: quote.client_name,
      client_contact_name: quote.client_contact_name ?? undefined,
      client_address: quote.client_address ?? undefined,
      client_siren: quote.client_siren ?? undefined,
      client_email: quote.client_email ?? undefined,
      intervention_id: quote.intervention_id ?? undefined,
      site_name: quote.site_name ?? undefined,
      site_address: quote.site_address ?? undefined,
      dossier_number: quote.dossier_number ?? undefined,
      issue_date: issueDate,
      due_date: dueDate,
      notes: quote.notes ?? undefined,
      lines: [
        ...quote.lines.map((l, i) => ({
          position: i,
          description: l.description,
          quantity: Number(l.quantity),
          unit_price_ht: Number(l.unit_price_ht),
          vat_rate: Number(l.vat_rate),
          format: l.format ?? null,
        })),
        // Acomptes déjà facturés sur ce devis : déduits automatiquement
        ...(await depositDeductionLines(quote.id, quote.lines.length)),
      ],
    },
    organizationId,
  )
}

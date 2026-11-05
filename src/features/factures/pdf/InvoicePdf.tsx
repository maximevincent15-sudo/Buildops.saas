import { Document, Page, StyleSheet, Text, View } from '@react-pdf/renderer'
import { lineStylePdf } from '../../../shared/lib/lineFormat'
import type { LineFormat } from '../../../shared/lib/lineFormat'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import { formatCompanyNumber } from '../../clients/companyLookup'
import { computeQuoteTotals, formatAmount, formatNumber } from '../../devis/constants'
import { VAT_MENTION_TEXT } from '../../parametres/api'
import type { InvoicingSettings } from '../../parametres/api'
import { PdfLogo } from '../../parametres/pdf/PdfLogo'
import { hasFinalNumber, isCreditNote, paymentMethodLabel } from '../constants'
import type { InvoiceWithLines } from '../schemas'

const colors = {
  ink: '#1C2130',
  ink2: '#5A6070',
  ink3: '#9AA0AE',
  acc: '#3A5CA8',
  red: '#A83A3A',
  redLt: '#F0DADA',
  grn: '#2E7D5E',
  grnLt: '#D4EDE5',
  org: '#C45A1A',
  orgLt: '#F4D9BF',
  border: '#E6E8EC',
  borderLight: '#F2F3F5',
  bg: '#F8F9FB',
}

const styles = StyleSheet.create({
  page: {
    padding: 36,
    paddingBottom: 60,
    fontFamily: 'Helvetica',
    fontSize: 9.5,
    color: colors.ink,
    lineHeight: 1.4,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 24,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomStyle: 'solid',
    borderBottomColor: colors.ink,
  },
  orgName: {
    fontSize: 18,
    fontFamily: 'Helvetica-Bold',
    color: colors.ink,
    marginBottom: 4,
  },
  orgInfo: { fontSize: 8, color: colors.ink2, lineHeight: 1.5 },
  headerMeta: { alignItems: 'flex-end' },
  docLabel: {
    fontSize: 9,
    color: colors.ink3,
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    marginBottom: 3,
  },
  docRef: { fontSize: 16, fontFamily: 'Helvetica-Bold', color: colors.acc },
  docDate: { fontSize: 8.5, color: colors.ink2, marginTop: 4 },
  // Bandeau échéance (mis en avant pour facture)
  dueBanner: {
    backgroundColor: colors.bg,
    padding: 8,
    paddingHorizontal: 12,
    borderRadius: 4,
    marginTop: 6,
    borderLeftWidth: 3,
    borderLeftStyle: 'solid',
    borderLeftColor: colors.acc,
    alignSelf: 'flex-end',
  },
  dueBannerOverdue: { borderLeftColor: colors.red, backgroundColor: colors.redLt },
  dueBannerPaid: { borderLeftColor: colors.grn, backgroundColor: colors.grnLt },
  dueBannerLabel: {
    fontSize: 7,
    color: colors.ink3,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  dueBannerValue: { fontSize: 11, fontFamily: 'Helvetica-Bold', marginTop: 2 },
  dueBannerValueOverdue: { color: colors.red },
  dueBannerValuePaid: { color: colors.grn },
  // Adresses
  addressBlock: { flexDirection: 'row', marginBottom: 18, gap: 20 },
  addressCol: { flex: 1 },
  addressLabel: {
    fontSize: 7.5,
    color: colors.ink3,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 4,
  },
  addressName: { fontFamily: 'Helvetica-Bold', fontSize: 11, marginBottom: 2 },
  addressLine: { fontSize: 9.5, color: colors.ink2, marginBottom: 1 },
  // Tableau
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: colors.ink,
    color: '#FFFFFF',
    paddingVertical: 6,
    paddingHorizontal: 8,
    fontSize: 8.5,
    fontFamily: 'Helvetica-Bold',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  tableRow: {
    flexDirection: 'row',
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderBottomWidth: 0.5,
    borderBottomStyle: 'solid',
    borderBottomColor: colors.border,
  },
  colDesc: { flex: 4 },
  descDetail: { fontSize: 8, color: colors.ink2, marginTop: 2 },
  colQty: { flex: 1, textAlign: 'right' },
  colPu: { flex: 1.4, textAlign: 'right' },
  colVat: { flex: 0.8, textAlign: 'right' },
  colTotal: { flex: 1.6, textAlign: 'right' },
  // Totaux
  totalsBlock: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 12 },
  totalsBox: { width: 280 },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
    paddingHorizontal: 10,
    fontSize: 9.5,
  },
  totalRowGrand: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    paddingHorizontal: 10,
    fontSize: 12,
    fontFamily: 'Helvetica-Bold',
    backgroundColor: colors.ink,
    color: '#FFFFFF',
    marginTop: 2,
  },
  totalRowPayment: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
    paddingHorizontal: 10,
    fontSize: 9.5,
    color: colors.grn,
  },
  totalRowRemaining: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
    paddingHorizontal: 10,
    fontSize: 11,
    fontFamily: 'Helvetica-Bold',
    color: colors.red,
    backgroundColor: colors.redLt,
    borderRadius: 3,
    marginTop: 2,
  },
  // Bloc paiement (IBAN/BIC mis en avant)
  paymentBlock: {
    marginTop: 18,
    padding: 12,
    backgroundColor: colors.bg,
    borderRadius: 4,
    borderLeftWidth: 3,
    borderLeftStyle: 'solid',
    borderLeftColor: colors.acc,
  },
  paymentTitle: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 9.5,
    textTransform: 'uppercase',
    letterSpacing: 1,
    color: colors.acc,
    marginBottom: 6,
  },
  paymentLine: { fontSize: 10, marginBottom: 2 },
  // Notes
  notes: {
    marginTop: 14,
    padding: 12,
    backgroundColor: colors.bg,
    borderRadius: 4,
    fontSize: 9.5,
    lineHeight: 1.5,
  },
  notesTitle: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 8.5,
    textTransform: 'uppercase',
    letterSpacing: 1,
    color: colors.ink2,
    marginBottom: 4,
  },
  // Mentions légales
  legal: {
    marginTop: 12,
    fontSize: 7.5,
    color: colors.ink3,
    lineHeight: 1.5,
    fontStyle: 'italic',
  },
  cancelledStamp: {
    position: 'absolute',
    top: 200,
    left: 100,
    right: 100,
    paddingVertical: 14,
    border: 3,
    borderStyle: 'solid',
    borderColor: colors.red,
    color: colors.red,
    backgroundColor: colors.redLt,
    fontSize: 28,
    fontFamily: 'Helvetica-Bold',
    textAlign: 'center',
    letterSpacing: 4,
    transform: 'rotate(-12deg)',
    opacity: 0.7,
  },
  draftStamp: {
    position: 'absolute',
    top: 330,
    left: 120,
    right: 120,
    paddingVertical: 12,
    border: 2.5,
    borderStyle: 'solid',
    borderColor: colors.ink3,
    color: colors.ink3,
    fontSize: 26,
    fontFamily: 'Helvetica-Bold',
    textAlign: 'center',
    letterSpacing: 4,
    transform: 'rotate(-12deg)',
    opacity: 0.6,
  },
  creditRef: { fontSize: 8.5, color: colors.ink, marginTop: 4, fontFamily: 'Helvetica-Bold' },
  paidStamp: {
    position: 'absolute',
    top: 200,
    right: 80,
    paddingVertical: 12,
    paddingHorizontal: 18,
    border: 2.5,
    borderStyle: 'solid',
    borderColor: colors.grn,
    color: colors.grn,
    fontSize: 22,
    fontFamily: 'Helvetica-Bold',
    textAlign: 'center',
    letterSpacing: 3,
    transform: 'rotate(-12deg)',
    opacity: 0.85,
  },
  footer: {
    position: 'absolute',
    bottom: 18,
    left: 36,
    right: 36,
    fontSize: 7,
    color: colors.ink3,
    textAlign: 'center',
    paddingTop: 6,
    borderTopWidth: 0.5,
    borderTopStyle: 'solid',
    borderTopColor: colors.border,
    lineHeight: 1.5,
  },
})

type Props = {
  invoice: InvoiceWithLines
  organizationName: string
  settings: InvoicingSettings | null
  /** N° client de la fiche client (si renseigné) */
  clientNumber?: string | null
  /** Avoir : facture d'origine (numéro et date) */
  creditedInvoice?: { reference: string; issue_date: string } | null
  /** Facture d'acompte : devis concerné (numéro et date) */
  depositQuote?: { reference: string; issue_date: string } | null
}

function longDate(iso: string | null | undefined): string {
  return iso ? format(new Date(iso), 'd MMMM yyyy', { locale: fr }) : ''
}

export function InvoicePdf({ invoice, organizationName, settings, clientNumber, creditedInvoice, depositQuote }: Props) {
  const isCredit = isCreditNote(invoice)
  // Brouillon : pas encore de numéro ni de date (attribués à l'envoi)
  const isDraft = !hasFinalNumber(invoice.reference) || invoice.status === 'draft'
  const draftNumbered = isDraft && hasFinalNumber(invoice.reference)
  const totals = computeQuoteTotals(
    invoice.lines.map((l) => ({
      quantity: Number(l.quantity),
      unit_price_ht: Number(l.unit_price_ht),
      vat_rate: Number(l.vat_rate),
    })),
  )

  const issueLabel = longDate(invoice.issue_date)
  const dueLabel = !isCredit && invoice.due_date ? longDate(invoice.due_date) : null
  // Brouillon : délai de paiement (l'échéance est recalculée à l'envoi)
  const dueDays = invoice.due_date && invoice.issue_date
    ? Math.round((new Date(invoice.due_date).getTime() - new Date(invoice.issue_date).getTime()) / 86400000)
    : null

  const totalTtc = Number(invoice.total_ttc)
  const amountPaid = isCredit ? 0 : Number(invoice.amount_paid ?? 0)
  const remaining = Math.max(0, totalTtc - amountPaid)
  const isPaid = !isCredit && !isDraft && (invoice.status === 'paid' || (totalTtc > 0 && amountPaid >= totalTtc - 0.01))
  const isCancelled = invoice.status === 'cancelled'

  // Détection retard côté PDF
  const isOverdueDoc =
    !isDraft && !isPaid && !isCancelled && invoice.due_date && new Date(invoice.due_date) < new Date()

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* HEADER */}
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <PdfLogo url={settings?.logo_url} />
            <Text style={styles.orgName}>{organizationName || 'Maintenance'}</Text>
            {settings && (
              <View style={styles.orgInfo}>
                {settings.legal_address && <Text>{settings.legal_address}</Text>}
                {(settings.legal_postal_code || settings.legal_city) && (
                  <Text>{[settings.legal_postal_code, settings.legal_city].filter(Boolean).join(' ')}</Text>
                )}
                {settings.legal_phone && <Text>Tél : {settings.legal_phone}</Text>}
                {settings.legal_email && <Text>{settings.legal_email}</Text>}
                {settings.siret && <Text>SIRET : {settings.siret}</Text>}
                {settings.vat_number && <Text>TVA : {settings.vat_number}</Text>}
              </View>
            )}
          </View>
          <View style={styles.headerMeta}>
            <Text style={styles.docLabel}>{isCredit ? 'Avoir' : invoice.is_deposit ? 'Facture d\'acompte' : 'Facture'}</Text>
            <Text style={styles.docRef}>{isDraft && !draftNumbered ? 'BROUILLON' : invoice.reference}</Text>
            {isDraft ? (
              <Text style={styles.docDate}>{draftNumbered ? 'Brouillon : date fixée à l\'envoi' : 'Numéro et date attribués à l\'envoi'}</Text>
            ) : (
              <Text style={styles.docDate}>{isCredit ? 'Émis' : 'Émise'} le {issueLabel}</Text>
            )}
            {isCredit && creditedInvoice && (
              <Text style={styles.creditRef}>
                Se rapporte à la facture {creditedInvoice.reference} du {longDate(creditedInvoice.issue_date)}
              </Text>
            )}
            {invoice.is_deposit && depositQuote && (
              <Text style={styles.creditRef}>
                Acompte sur le devis {depositQuote.reference} du {longDate(depositQuote.issue_date)}
              </Text>
            )}
            {isDraft && !isCredit && dueDays !== null && dueDays >= 0 && (
              <View style={styles.dueBanner}>
                <Text style={styles.dueBannerLabel}>Délai de paiement</Text>
                <Text style={styles.dueBannerValue}>{dueDays === 0 ? 'À réception' : `${dueDays} jours après l'envoi`}</Text>
              </View>
            )}
            {!isDraft && dueLabel && (
              <View
                style={
                  isPaid
                    ? [styles.dueBanner, styles.dueBannerPaid]
                    : isOverdueDoc
                      ? [styles.dueBanner, styles.dueBannerOverdue]
                      : styles.dueBanner
                }
              >
                <Text style={styles.dueBannerLabel}>
                  {isPaid ? 'Soldée' : isOverdueDoc ? 'En retard depuis' : 'À régler avant le'}
                </Text>
                <Text
                  style={
                    isPaid
                      ? [styles.dueBannerValue, styles.dueBannerValuePaid]
                      : isOverdueDoc
                        ? [styles.dueBannerValue, styles.dueBannerValueOverdue]
                        : styles.dueBannerValue
                  }
                >
                  {dueLabel}
                </Text>
              </View>
            )}
          </View>
        </View>

        {/* TAMPON BROUILLON / ANNULÉ / PAYÉ */}
        {isDraft && (
          <Text style={styles.draftStamp}>BROUILLON</Text>
        )}
        {isCancelled && !isDraft && (
          <Text style={styles.cancelledStamp}>ANNULÉE</Text>
        )}
        {isPaid && !isCancelled && (
          <Text style={styles.paidStamp}>PAYÉE</Text>
        )}

        {/* CLIENT + SITE */}
        <View style={styles.addressBlock}>
          <View style={styles.addressCol}>
            <Text style={styles.addressLabel}>{isCredit ? 'Client' : 'Facturé à'}</Text>
            <Text style={styles.addressName}>{invoice.client_name}</Text>
            {clientNumber && <Text style={styles.addressLine}>N° client : {clientNumber}</Text>}
            {invoice.dossier_number && <Text style={styles.addressLine}>N° de dossier : {invoice.dossier_number}</Text>}
            {invoice.client_contact_name && <Text style={styles.addressLine}>{invoice.client_contact_name}</Text>}
            {invoice.client_address && <Text style={styles.addressLine}>{invoice.client_address}</Text>}
            {invoice.client_email && <Text style={styles.addressLine}>{invoice.client_email}</Text>}
            {invoice.client_siren && <Text style={styles.addressLine}>SIREN : {formatCompanyNumber(invoice.client_siren)}</Text>}
          </View>
          {(invoice.site_name || invoice.site_address) && (
            <View style={styles.addressCol}>
              <Text style={styles.addressLabel}>Lieu d'intervention</Text>
              {invoice.site_name && <Text style={styles.addressName}>{invoice.site_name}</Text>}
              {invoice.site_address && <Text style={styles.addressLine}>{invoice.site_address}</Text>}
            </View>
          )}
        </View>

        {/* TABLEAU */}
        <View style={styles.tableHeader}>
          <Text style={styles.colDesc}>Description</Text>
          <Text style={styles.colQty}>Qté</Text>
          <Text style={styles.colPu}>PU HT</Text>
          <Text style={styles.colVat}>TVA</Text>
          <Text style={styles.colTotal}>Total HT</Text>
        </View>
        {invoice.lines.map((l) => {
          const ht = Number(l.quantity) * Number(l.unit_price_ht)
          return (
            <View key={l.id} style={styles.tableRow} wrap={false}>
              <LineDescription text={l.description} format={l.format} />
              <Text style={styles.colQty}>{formatNumber(Number(l.quantity), 2)}</Text>
              <Text style={styles.colPu}>{formatAmount(Number(l.unit_price_ht))}</Text>
              <Text style={styles.colVat}>{formatNumber(Number(l.vat_rate), 1)}%</Text>
              <Text style={styles.colTotal}>{formatAmount(ht)}</Text>
            </View>
          )
        })}

        {/* TOTAUX */}
        <View style={styles.totalsBlock}>
          <View style={styles.totalsBox}>
            <View style={styles.totalRow}>
              <Text>Total HT</Text>
              <Text>{formatAmount(totals.total_ht)}</Text>
            </View>
            {Object.entries(totals.vat_by_rate).map(([rate, vat]) => (
              <View key={rate} style={styles.totalRow}>
                <Text>TVA {rate}%</Text>
                <Text>{formatAmount(vat)}</Text>
              </View>
            ))}
            <View style={styles.totalRowGrand}>
              <Text>{isCredit ? 'Total TTC de l\'avoir' : 'Total TTC'}</Text>
              <Text>{formatAmount(totals.total_ttc)}</Text>
            </View>
            {amountPaid > 0 && !isCancelled && (
              <>
                <View style={styles.totalRowPayment}>
                  <Text>
                    Acompte / Réglé
                    {invoice.payment_method ? ` (${paymentMethodLabel(invoice.payment_method)})` : ''}
                  </Text>
                  <Text>− {formatAmount(amountPaid)}</Text>
                </View>
                {!isPaid && (
                  <View style={styles.totalRowRemaining}>
                    <Text>Reste à payer</Text>
                    <Text>{formatAmount(remaining)}</Text>
                  </View>
                )}
              </>
            )}
          </View>
        </View>

        {/* COORDONNÉES BANCAIRES (uniquement si non payée + non annulée, jamais sur un avoir) */}
        {!isCredit && !isPaid && !isCancelled && settings && (settings.iban || settings.bic) && (
          <View style={styles.paymentBlock} wrap={false}>
            <Text style={styles.paymentTitle}>Règlement par virement bancaire</Text>
            {settings.bank_name && (
              <Text style={styles.paymentLine}>Banque : {settings.bank_name}</Text>
            )}
            {settings.iban && (
              <Text style={styles.paymentLine}>
                IBAN : <Text style={{ fontFamily: 'Helvetica-Bold' }}>{settings.iban}</Text>
              </Text>
            )}
            {settings.bic && (
              <Text style={styles.paymentLine}>
                BIC : <Text style={{ fontFamily: 'Helvetica-Bold' }}>{settings.bic}</Text>
              </Text>
            )}
            <Text style={[styles.paymentLine, { color: colors.ink3, marginTop: 4 }]}>
              {isDraft && !draftNumbered
                ? 'Merci d\'indiquer le numéro de la facture dans le libellé du virement.'
                : <>Merci d'indiquer la référence <Text style={{ fontFamily: 'Helvetica-Bold' }}>{invoice.reference}</Text> dans le libellé du virement.</>}
            </Text>
          </View>
        )}

        {/* NOTES */}
        {invoice.notes ? (
          <View style={styles.notes}>
            <Text style={styles.notesTitle}>{isCredit ? 'Motif' : 'Notes'}</Text>
            <Text>{invoice.notes}</Text>
          </View>
        ) : null}

        {/* MENTIONS LÉGALES */}
        {settings && (
          <View style={styles.legal}>
            {!isCredit && settings.payment_terms && <Text>{settings.payment_terms}</Text>}
            {!isCredit && settings.late_penalty_text && <Text>{settings.late_penalty_text}</Text>}
            {!isCredit && settings.no_discount_text && <Text>{settings.no_discount_text}</Text>}
            {settings.vat_mention && VAT_MENTION_TEXT[settings.vat_mention] && <Text>{VAT_MENTION_TEXT[settings.vat_mention]}</Text>}
          </View>
        )}

        {/* FOOTER */}
        <Text style={styles.footer} fixed>
          {organizationName ? `${organizationName}` : ''}
          {settings?.legal_form && ` · ${settings.legal_form}`}
          {settings?.capital && ` au capital de ${settings.capital}`}
          {settings?.siret && ` · SIRET ${settings.siret}`}
          {settings?.ape_code && ` · APE ${settings.ape_code}`}
          {settings?.vat_number && ` · TVA ${settings.vat_number}`}
        </Text>
      </Page>
    </Document>
  )
}

/** Description d'une ligne : la désignation, puis la précision (délai, référence…) en plus petit, avec leur mise en forme */
function LineDescription({ text, format }: { text: string; format?: LineFormat | null }) {
  const [first, ...rest] = text.split('\n')
  const details = rest.join('\n').trim()
  return (
    <View style={styles.colDesc}>
      <Text style={lineStylePdf(format?.main, 9.5)}>{first}</Text>
      {details ? <Text style={[styles.descDetail, lineStylePdf(format?.detail, 8)]}>{details}</Text> : null}
    </View>
  )
}

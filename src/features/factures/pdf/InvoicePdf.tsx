import { Document, Page, StyleSheet, Text, View } from '@react-pdf/renderer'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import { computeQuoteTotals, formatAmount, formatNumber } from '../../devis/constants'
import type { InvoicingSettings } from '../../parametres/api'
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
}

export function InvoicePdf({ invoice, organizationName, settings }: Props) {
  const totals = computeQuoteTotals(
    invoice.lines.map((l) => ({
      quantity: Number(l.quantity),
      unit_price_ht: Number(l.unit_price_ht),
      vat_rate: Number(l.vat_rate),
    })),
  )

  const issueLabel = invoice.issue_date
    ? format(new Date(invoice.issue_date), 'd MMMM yyyy', { locale: fr })
    : ''
  const dueLabel = invoice.due_date
    ? format(new Date(invoice.due_date), 'd MMMM yyyy', { locale: fr })
    : null

  const totalTtc = Number(invoice.total_ttc)
  const amountPaid = Number(invoice.amount_paid ?? 0)
  const remaining = Math.max(0, totalTtc - amountPaid)
  const isPaid = invoice.status === 'paid' || amountPaid >= totalTtc - 0.01
  const isCancelled = invoice.status === 'cancelled'

  // Détection retard côté PDF
  const isOverdueDoc =
    !isPaid && !isCancelled && invoice.due_date && new Date(invoice.due_date) < new Date()

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* HEADER */}
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
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
            <Text style={styles.docLabel}>Facture</Text>
            <Text style={styles.docRef}>{invoice.reference}</Text>
            <Text style={styles.docDate}>Émise le {issueLabel}</Text>
            {dueLabel && (
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

        {/* TAMPON ANNULÉ / PAYÉ */}
        {isCancelled && (
          <Text style={styles.cancelledStamp}>ANNULÉE</Text>
        )}
        {isPaid && !isCancelled && (
          <Text style={styles.paidStamp}>PAYÉE</Text>
        )}

        {/* CLIENT + SITE */}
        <View style={styles.addressBlock}>
          <View style={styles.addressCol}>
            <Text style={styles.addressLabel}>Facturé à</Text>
            <Text style={styles.addressName}>{invoice.client_name}</Text>
            {invoice.client_contact_name && <Text style={styles.addressLine}>{invoice.client_contact_name}</Text>}
            {invoice.client_address && <Text style={styles.addressLine}>{invoice.client_address}</Text>}
            {invoice.client_email && <Text style={styles.addressLine}>{invoice.client_email}</Text>}
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
              <Text style={styles.colDesc}>{l.description}</Text>
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
              <Text>Total TTC</Text>
              <Text>{formatAmount(totals.total_ttc)}</Text>
            </View>
            {amountPaid > 0 && !isCancelled && (
              <>
                <View style={styles.totalRowPayment}>
                  <Text>
                    Acompte / Réglé
                    {invoice.payment_method ? ` (${invoice.payment_method})` : ''}
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

        {/* COORDONNÉES BANCAIRES (uniquement si non payée + non annulée) */}
        {!isPaid && !isCancelled && settings && (settings.iban || settings.bic) && (
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
              Merci d'indiquer la référence <Text style={{ fontFamily: 'Helvetica-Bold' }}>{invoice.reference}</Text> dans le libellé du virement.
            </Text>
          </View>
        )}

        {/* NOTES */}
        {invoice.notes ? (
          <View style={styles.notes}>
            <Text style={styles.notesTitle}>Notes</Text>
            <Text>{invoice.notes}</Text>
          </View>
        ) : null}

        {/* MENTIONS LÉGALES */}
        {settings && (
          <View style={styles.legal}>
            {settings.payment_terms && <Text>{settings.payment_terms}</Text>}
            {settings.late_penalty_text && <Text>{settings.late_penalty_text}</Text>}
            {settings.no_discount_text && <Text>{settings.no_discount_text}</Text>}
            <Text>TVA acquittée sur les débits.</Text>
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

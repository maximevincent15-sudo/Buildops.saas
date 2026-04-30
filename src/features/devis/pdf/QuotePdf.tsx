import { Document, Page, StyleSheet, Text, View } from '@react-pdf/renderer'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import type { InvoicingSettings } from '../../parametres/api'
import { computeQuoteTotals, formatAmount, formatNumber } from '../constants'
import type { QuoteWithLines } from '../schemas'

const colors = {
  ink: '#1C2130',
  ink2: '#5A6070',
  ink3: '#9AA0AE',
  acc: '#3A5CA8',
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
  orgInfo: {
    fontSize: 8,
    color: colors.ink2,
    lineHeight: 1.5,
  },
  headerMeta: { alignItems: 'flex-end' },
  docLabel: {
    fontSize: 9,
    color: colors.ink3,
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    marginBottom: 3,
  },
  docRef: {
    fontSize: 16,
    fontFamily: 'Helvetica-Bold',
    color: colors.acc,
  },
  docDate: {
    fontSize: 8.5,
    color: colors.ink2,
    marginTop: 4,
  },
  // Section adresses
  addressBlock: {
    flexDirection: 'row',
    marginBottom: 18,
    gap: 20,
  },
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
  // Tableau lignes
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
  totalsBlock: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 12,
  },
  totalsBox: {
    width: 240,
  },
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
  // Notes
  notes: {
    marginTop: 18,
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
    marginTop: 14,
    fontSize: 7.5,
    color: colors.ink3,
    lineHeight: 1.5,
    fontStyle: 'italic',
  },
  // Footer fixe
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
  quote: QuoteWithLines
  organizationName: string
  settings: InvoicingSettings | null
}

export function QuotePdf({ quote, organizationName, settings }: Props) {
  const totals = computeQuoteTotals(
    quote.lines.map((l) => ({
      quantity: Number(l.quantity),
      unit_price_ht: Number(l.unit_price_ht),
      vat_rate: Number(l.vat_rate),
    })),
  )

  const issueLabel = quote.issue_date
    ? format(new Date(quote.issue_date), 'd MMMM yyyy', { locale: fr })
    : ''
  const validityLabel = quote.validity_date
    ? format(new Date(quote.validity_date), 'd MMMM yyyy', { locale: fr })
    : null

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* HEADER */}
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={styles.orgName}>{organizationName || 'Maintenance'}</Text>
            {settings && (
              <View style={styles.orgInfo}>
                {settings.legal_address && (
                  <Text>{settings.legal_address}</Text>
                )}
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
            <Text style={styles.docLabel}>Devis</Text>
            <Text style={styles.docRef}>{quote.reference}</Text>
            <Text style={styles.docDate}>Émis le {issueLabel}</Text>
            {validityLabel && (
              <Text style={styles.docDate}>Valide jusqu'au {validityLabel}</Text>
            )}
          </View>
        </View>

        {/* CLIENT + SITE */}
        <View style={styles.addressBlock}>
          <View style={styles.addressCol}>
            <Text style={styles.addressLabel}>Client</Text>
            <Text style={styles.addressName}>{quote.client_name}</Text>
            {quote.client_contact_name && (
              <Text style={styles.addressLine}>{quote.client_contact_name}</Text>
            )}
            {quote.client_address && (
              <Text style={styles.addressLine}>{quote.client_address}</Text>
            )}
            {quote.client_email && (
              <Text style={styles.addressLine}>{quote.client_email}</Text>
            )}
          </View>
          {(quote.site_name || quote.site_address) && (
            <View style={styles.addressCol}>
              <Text style={styles.addressLabel}>Lieu d'intervention</Text>
              {quote.site_name && (
                <Text style={styles.addressName}>{quote.site_name}</Text>
              )}
              {quote.site_address && (
                <Text style={styles.addressLine}>{quote.site_address}</Text>
              )}
            </View>
          )}
        </View>

        {/* TABLEAU LIGNES */}
        <View style={styles.tableHeader}>
          <Text style={styles.colDesc}>Description</Text>
          <Text style={styles.colQty}>Qté</Text>
          <Text style={styles.colPu}>PU HT</Text>
          <Text style={styles.colVat}>TVA</Text>
          <Text style={styles.colTotal}>Total HT</Text>
        </View>
        {quote.lines.map((l) => {
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
          </View>
        </View>

        {/* NOTES */}
        {quote.notes ? (
          <View style={styles.notes}>
            <Text style={styles.notesTitle}>Notes</Text>
            <Text>{quote.notes}</Text>
          </View>
        ) : null}

        {/* MENTIONS LÉGALES */}
        {settings && (
          <View style={styles.legal}>
            {settings.payment_terms && (
              <Text>{settings.payment_terms}</Text>
            )}
            {settings.no_discount_text && (
              <Text>{settings.no_discount_text}</Text>
            )}
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

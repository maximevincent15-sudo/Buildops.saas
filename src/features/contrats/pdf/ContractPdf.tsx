import { Document, Page, StyleSheet, Text, View } from '@react-pdf/renderer'
import { formatCompanyNumber } from '../../clients/companyLookup'
import { formatAmount, formatNumber } from '../../devis/constants'
import type { InvoicingSettings } from '../../parametres/api'
import { PdfLogo } from '../../parametres/pdf/PdfLogo'
import {
  BILLING_FREQUENCY_LABELS, FREQUENCY_LABELS, contractAnnualTotals, fixedEnd, lineAnnualHt,
} from '../schemas'
import type { ContractWithDetails } from '../schemas'

const colors = {
  ink: '#1C2130',
  ink2: '#5A6070',
  ink3: '#9AA0AE',
  acc: '#3A5CA8',
  border: '#E6E8EC',
  bg: '#F8F9FB',
}

const styles = StyleSheet.create({
  page: { padding: 36, paddingBottom: 60, fontFamily: 'Helvetica', fontSize: 9.5, color: colors.ink, lineHeight: 1.4 },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start',
    marginBottom: 20, paddingBottom: 12, borderBottomWidth: 1, borderBottomStyle: 'solid', borderBottomColor: colors.ink,
  },
  orgName: { fontSize: 18, fontFamily: 'Helvetica-Bold', marginBottom: 4 },
  orgInfo: { fontSize: 8, color: colors.ink2, lineHeight: 1.5 },
  headerMeta: { alignItems: 'flex-end' },
  docLabel: { fontSize: 9, color: colors.ink3, textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 3 },
  docRef: { fontSize: 16, fontFamily: 'Helvetica-Bold', color: colors.acc },
  docDate: { fontSize: 8.5, color: colors.ink2, marginTop: 4 },
  parties: { flexDirection: 'row', gap: 20, marginBottom: 16 },
  partyCol: { flex: 1 },
  label: { fontSize: 7.5, color: colors.ink3, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 },
  partyName: { fontFamily: 'Helvetica-Bold', fontSize: 11, marginBottom: 2 },
  line: { fontSize: 9.5, color: colors.ink2, marginBottom: 1 },
  sectionTitle: {
    fontFamily: 'Helvetica-Bold', fontSize: 10, marginTop: 14, marginBottom: 6, paddingBottom: 3,
    borderBottomWidth: 0.5, borderBottomStyle: 'solid', borderBottomColor: colors.border,
  },
  tableHeader: {
    flexDirection: 'row', backgroundColor: colors.ink, color: '#FFFFFF', paddingVertical: 6, paddingHorizontal: 8,
    fontSize: 8, fontFamily: 'Helvetica-Bold', textTransform: 'uppercase', letterSpacing: 0.4,
  },
  tableRow: {
    flexDirection: 'row', paddingVertical: 5, paddingHorizontal: 8,
    borderBottomWidth: 0.5, borderBottomStyle: 'solid', borderBottomColor: colors.border,
  },
  colDesc: { flex: 4 },
  colQty: { flex: 0.8, textAlign: 'right' },
  colPu: { flex: 1.3, textAlign: 'right' },
  colFreq: { flex: 1.3, textAlign: 'right' },
  colTotal: { flex: 1.5, textAlign: 'right' },
  totalsBlock: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 10 },
  totalsBox: { width: 250 },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3, paddingHorizontal: 10 },
  totalRowGrand: {
    flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 7, paddingHorizontal: 10,
    fontSize: 11, fontFamily: 'Helvetica-Bold', backgroundColor: colors.ink, color: '#FFFFFF', marginTop: 2,
  },
  clause: { marginBottom: 4 },
  clauseTitle: { fontFamily: 'Helvetica-Bold' },
  signatures: { flexDirection: 'row', gap: 20, marginTop: 22 },
  signBox: { flex: 1, borderWidth: 0.5, borderStyle: 'solid', borderColor: colors.ink3, borderRadius: 4, padding: 10, height: 110 },
  signHint: { fontSize: 8, color: colors.ink3, marginTop: 3 },
  legal: { marginTop: 12, fontSize: 7.5, color: colors.ink3, lineHeight: 1.5, fontStyle: 'italic' },
  footer: {
    position: 'absolute', bottom: 18, left: 36, right: 36, fontSize: 7, color: colors.ink3, textAlign: 'center',
    paddingTop: 6, borderTopWidth: 0.5, borderTopStyle: 'solid', borderTopColor: colors.border, lineHeight: 1.5,
  },
})

export type ContractPdfClient = {
  name: string
  client_number: string | null
  contact_name: string | null
  address: string | null
  contact_email: string | null
  siren: string | null
}

export type ContractPdfSite = { id: string; name: string; address: string | null; postal_code: string | null; city: string | null }

type Props = {
  contract: ContractWithDetails
  organizationName: string
  settings: InvoicingSettings | null
  client: ContractPdfClient | null
  sites: ContractPdfSite[]
  issuedOn: string
}

function frDate(iso: string | null): string {
  if (!iso) return '—'
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

export function ContractPdf({ contract, organizationName, settings, client, sites, issuedOn }: Props) {
  const totals = contractAnnualTotals(contract.lines)
  const siteName = new Map(sites.map((s) => [s.id, s.name]))
  const end = fixedEnd(contract)
  const rate = contract.revision_rate

  return (
    <Document title={`Contrat ${contract.reference}`}>
      <Page size="A4" style={styles.page}>
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
              </View>
            )}
          </View>
          <View style={styles.headerMeta}>
            <Text style={styles.docLabel}>Contrat de maintenance</Text>
            <Text style={styles.docRef}>{contract.reference}</Text>
            <Text style={styles.docDate}>Établi le {frDate(issuedOn)}</Text>
          </View>
        </View>

        {/* Parties */}
        <View style={styles.parties}>
          <View style={styles.partyCol}>
            <Text style={styles.label}>Le prestataire</Text>
            <Text style={styles.partyName}>{organizationName}</Text>
            {settings?.legal_form && <Text style={styles.line}>{settings.legal_form}</Text>}
            {settings?.siret && <Text style={styles.line}>SIRET : {settings.siret}</Text>}
          </View>
          <View style={styles.partyCol}>
            <Text style={styles.label}>Le client</Text>
            <Text style={styles.partyName}>{client?.name ?? contract.client_name}</Text>
            {client?.client_number && <Text style={styles.line}>N° client : {client.client_number}</Text>}
            {client?.contact_name && <Text style={styles.line}>{client.contact_name}</Text>}
            {client?.address && <Text style={styles.line}>{client.address}</Text>}
            {client?.contact_email && <Text style={styles.line}>{client.contact_email}</Text>}
            {client?.siren && <Text style={styles.line}>SIREN : {formatCompanyNumber(client.siren)}</Text>}
          </View>
        </View>

        {/* Objet */}
        <Text style={styles.sectionTitle}>Objet</Text>
        <Text>
          {contract.title ? `${contract.title}. ` : ''}Le prestataire assure la vérification et la maintenance préventive
          des équipements de sécurité incendie décrits ci-dessous, aux fréquences indiquées. Chaque visite donne lieu
          à un rapport de vérification remis au client.
        </Text>

        {sites.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Sites couverts</Text>
            {sites.map((s) => (
              <Text key={s.id} style={styles.line}>
                • {s.name}{s.address || s.city ? ` — ${[s.address, [s.postal_code, s.city].filter(Boolean).join(' ')].filter(Boolean).join(', ')}` : ''}
              </Text>
            ))}
          </>
        )}

        {/* Prestations */}
        <Text style={styles.sectionTitle}>Prestations et prix</Text>
        <View style={styles.tableHeader}>
          <Text style={styles.colDesc}>Prestation</Text>
          <Text style={styles.colQty}>Qté</Text>
          <Text style={styles.colPu}>PU HT / visite</Text>
          <Text style={styles.colFreq}>Fréquence</Text>
          <Text style={styles.colTotal}>Par an HT</Text>
        </View>
        {contract.lines.map((l, i) => (
          <View key={l.id ?? i} style={styles.tableRow} wrap={false}>
            <Text style={styles.colDesc}>
              {l.description}{l.site_id && siteName.get(l.site_id) ? ` (${siteName.get(l.site_id)})` : ''}
            </Text>
            <Text style={styles.colQty}>{formatNumber(l.quantity, l.quantity % 1 === 0 ? 0 : 2)}</Text>
            <Text style={styles.colPu}>{formatAmount(l.unit_price_ht)}</Text>
            <Text style={styles.colFreq}>{FREQUENCY_LABELS[l.frequency]}</Text>
            <Text style={styles.colTotal}>{formatAmount(lineAnnualHt(l))}</Text>
          </View>
        ))}
        <View style={styles.totalsBlock}>
          <View style={styles.totalsBox}>
            <View style={styles.totalRow}><Text>Montant annuel HT</Text><Text>{formatAmount(totals.ht)}</Text></View>
            <View style={styles.totalRow}><Text>TVA</Text><Text>{formatAmount(totals.vat)}</Text></View>
            <View style={styles.totalRowGrand}><Text>Montant annuel TTC</Text><Text>{formatAmount(totals.ttc)}</Text></View>
          </View>
        </View>

        {/* Conditions */}
        <Text style={styles.sectionTitle}>Conditions</Text>
        <Text style={styles.clause}>
          <Text style={styles.clauseTitle}>Durée. </Text>
          Le contrat prend effet le {frDate(contract.start_date)} pour une durée de {contract.initial_months} mois.{' '}
          {contract.tacit_renewal
            ? `Il est ensuite reconduit tacitement par périodes de 12 mois, sauf dénonciation par l'une des parties par écrit au moins ${contract.notice_months} mois avant l'échéance.`
            : `Il prend fin le ${frDate(end)}, sauf renouvellement convenu entre les parties.`}
        </Text>
        <Text style={styles.clause}>
          <Text style={styles.clauseTitle}>Facturation. </Text>
          {contract.billing_mode === 'per_visit'
            ? 'Les prestations sont facturées après chaque visite, selon les prestations dues à cette visite.'
            : `Le montant annuel est facturé d'avance : ${BILLING_FREQUENCY_LABELS[contract.billing_frequency].toLowerCase()}, au début de chaque période.`}
          {settings?.payment_terms ? ` ${settings.payment_terms}.` : ''}
        </Text>
        {rate ? (
          <Text style={styles.clause}>
            <Text style={styles.clauseTitle}>Révision. </Text>
            Les prix sont révisés à chaque date anniversaire du contrat de {formatNumber(rate, rate % 1 === 0 ? 0 : 1)} %.
          </Text>
        ) : null}
        <Text style={styles.clause}>
          <Text style={styles.clauseTitle}>Prestations complémentaires. </Text>
          Les remplacements de matériel, recharges et interventions correctives non prévus ci-dessus font l'objet d'un devis préalable.
        </Text>

        {/* Signatures */}
        <View style={styles.signatures} wrap={false}>
          <View style={styles.signBox}>
            <Text style={styles.label}>Pour le prestataire</Text>
            <Text>{organizationName}</Text>
            <Text style={styles.signHint}>Nom, date et signature</Text>
          </View>
          <View style={styles.signBox}>
            <Text style={styles.label}>Pour le client</Text>
            <Text>{client?.name ?? contract.client_name}</Text>
            <Text style={styles.signHint}>Nom, qualité, date, signature et mention « Bon pour accord »</Text>
          </View>
        </View>

        {settings?.late_penalty_text && <Text style={styles.legal}>{settings.late_penalty_text}</Text>}

        <Text style={styles.footer} fixed>
          {organizationName}
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

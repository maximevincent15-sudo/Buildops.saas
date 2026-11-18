import { Document, Page, StyleSheet, Text, View } from '@react-pdf/renderer'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import type { InvoicingSettings } from '../../parametres/api'
import { DEFAULT_STANDARDS } from '../../rapports/workOrder'
import { pdfSafe } from '../../rapports/pdf/pdfText'
import { splitOtherStandards } from '../receptionReports'
import type { ReceptionReport } from '../receptionReports'
import { LegalFooter, OrgHeaderBlock } from './QuotePdf'
import { colors, styles as base } from './quotePdfStyles'

const s = StyleSheet.create({
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 },
  label: { fontFamily: 'Helvetica-Bold', fontSize: 9.5, textDecoration: 'underline' },
  value: { fontSize: 10, marginLeft: 4, flexShrink: 1 },
  line: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 8 },
  place: { fontSize: 10, textAlign: 'right' },
  muted: { fontSize: 9, color: colors.ink2 },
  section: { marginTop: 14 },
  sectionTitle: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 8.5,
    textTransform: 'uppercase',
    letterSpacing: 1,
    color: colors.ink2,
    marginBottom: 6,
  },
  desc: { fontSize: 10, lineHeight: 1.45 },
  checks: { flexDirection: 'row', flexWrap: 'wrap' },
  check: { flexDirection: 'row', alignItems: 'center', width: '50%', marginBottom: 5, paddingRight: 8 },
  box: { width: 8.5, height: 8.5, borderWidth: 0.8, borderStyle: 'solid', borderColor: colors.ink2, marginRight: 6, alignItems: 'center', justifyContent: 'center' },
  boxOn: { width: 5, height: 5, backgroundColor: colors.ink },
  checkLabel: { fontSize: 9.5 },
  note: { fontSize: 9.5, marginTop: 2 },
  delivery: { marginTop: 16, fontFamily: 'Helvetica-Bold', fontSize: 10 },
  signRow: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 22 },
  signBox: { width: '48%', padding: 10, borderWidth: 0.5, borderStyle: 'solid', borderColor: colors.border, borderRadius: 4, minHeight: 100 },
  signText: { fontSize: 9, color: colors.ink2, marginTop: 2 },
})

const frDate = (d: string) => format(new Date(d), 'dd/MM/yyyy', { locale: fr })

function Check({ label, checked }: { label: string; checked: boolean }) {
  return (
    <View style={s.check}>
      <View style={s.box}>{checked ? <View style={s.boxOn} /> : null}</View>
      <Text style={s.checkLabel}>{label}</Text>
    </View>
  )
}

/**
 * Procès-verbal de réception : document à part, adressé au client après une
 * installation (descriptif, référentiels cochés, date de livraison).
 */
export function ReceptionReportPdf({ report: raw, organizationName, settings }: { report: ReceptionReport; organizationName: string; settings: InvoicingSettings | null }) {
  // Textes nettoyés pour la police du PDF (« CO₂ »…)
  const report = pdfSafe(raw)
  const others = splitOtherStandards(report.other_standards)
  const defaults: string[] = [...DEFAULT_STANDARDS]
  // Normes proposées (cochées ou non), puis celles de l'entreprise, toujours cochées
  const items = [
    ...defaults.map((label) => ({ label, checked: report.standards.includes(label) })),
    ...report.standards.filter((x) => !defaults.includes(x)).map((label) => ({ label, checked: true })),
    ...others.map((label) => ({ label, checked: true })),
  ]
  const affair = [report.site_name, report.site_address].filter((x) => x && x.trim()).join(' — ')

  return (
    <Document title={`Procès-verbal ${report.reference}`}>
      <Page size="A4" style={base.page}>
        <View style={base.header}>
          <OrgHeaderBlock organizationName={organizationName} settings={settings} />
          <View style={base.headerMeta}>
            <Text style={base.docLabel}>Procès-verbal de réception</Text>
            <Text style={base.docRef}>{report.reference}</Text>
            {report.dossier_number && <Text style={base.docDate}>Dossier N° {report.dossier_number}</Text>}
            {report.quote_reference && <Text style={base.docDate}>Devis {report.quote_reference}</Text>}
            {report.order_reference && <Text style={base.docDate}>Votre commande : {report.order_reference}</Text>}
          </View>
        </View>

        <View style={s.topRow}>
          <View style={{ flex: 1, paddingRight: 16 }}>
            <View style={s.line}>
              <Text style={s.label}>Adressé à :</Text>
              <Text style={s.value}>{report.client_name}</Text>
            </View>
            {report.client_address && <Text style={[s.muted, { marginTop: -5, marginBottom: 8 }]}>{report.client_address}</Text>}
          </View>
          <Text style={s.place}>
            {report.issue_city?.trim() ? `${report.issue_city.trim()}, le ` : 'Le '}{frDate(report.issue_date)}
          </Text>
        </View>

        {report.client_contact_name?.trim() && (
          <View style={s.line}>
            <Text style={s.label}>À l'attention de :</Text>
            <Text style={s.value}>{report.client_contact_name.trim()}</Text>
          </View>
        )}

        {affair && (
          <View style={s.line}>
            <Text style={s.label}>Affaire :</Text>
            <Text style={s.value}>{affair}</Text>
          </View>
        )}

        {report.description?.trim() && (
          <View style={s.section} wrap={false}>
            <Text style={s.sectionTitle}>Descriptif</Text>
            <Text style={s.desc}>{report.description.trim()}</Text>
          </View>
        )}

        {items.length > 0 && (
          <View style={s.section} wrap={false}>
            <Text style={s.sectionTitle}>Référentiels</Text>
            <View style={s.checks}>{items.map((x) => <Check key={x.label} label={x.label} checked={x.checked} />)}</View>
            {report.standards_note?.trim() && <Text style={s.note}>{report.standards_note.trim()}</Text>}
          </View>
        )}

        {report.delivery_date && (
          <Text style={s.delivery}>Livraison le : {frDate(report.delivery_date)}</Text>
        )}

        <View style={s.signRow} wrap={false}>
          <View style={s.signBox}>
            <Text style={s.sectionTitle}>Pour {organizationName}</Text>
            {report.signatory_name?.trim() && <Text style={{ fontSize: 10 }}>{report.signatory_name.trim()}</Text>}
            <Text style={s.signText}>Signature et cachet</Text>
          </View>
        </View>

        <LegalFooter organizationName={organizationName} settings={settings} />
      </Page>
    </Document>
  )
}

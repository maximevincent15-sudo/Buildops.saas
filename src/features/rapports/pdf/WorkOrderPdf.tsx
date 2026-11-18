import { Document, Image, Page, StyleSheet, Text, View } from '@react-pdf/renderer'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import type { InvoicingSettings } from '../../parametres/api'
import { LegalFooter, OrgHeaderBlock } from '../../devis/pdf/QuotePdf'
import { colors, styles as base } from '../../devis/pdf/quotePdfStyles'
import { pdfSafe } from './pdfText'

/** Tout ce qu'imprime le bon d'intervention, déjà préparé */
export type WorkOrderPdfData = {
  reference: string
  visitDate: string | null
  clientName: string
  clientLines: string[]
  siteName: string | null
  siteAddress: string | null
  dossierNumber: string | null
  technicianName: string | null
  arrivalAt: string | null
  departureAt: string | null
  domains: Array<{ label: string; checked: boolean }>
  natures: Array<{ label: string; checked: boolean }>
  description: string
  safety: Array<{ label: string; checked: boolean }>
  standards: string[]
  finished: boolean
  finishedDate: string | null
  remaining: string
  signedByName: string | null
  signatureDataUrl: string | null
  signedAt: string | null
}

const s = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 2 },
  infoCell: { width: '25%', paddingRight: 8, marginBottom: 6 },
  infoLabel: { fontSize: 7, color: colors.ink3, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 1 },
  infoValue: { fontSize: 9.5, fontFamily: 'Helvetica-Bold' },
  section: { marginTop: 9 },
  sectionTitle: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 8.5,
    textTransform: 'uppercase',
    letterSpacing: 1,
    color: colors.ink2,
    marginBottom: 5,
  },
  checks: { flexDirection: 'row', flexWrap: 'wrap' },
  check: { flexDirection: 'row', alignItems: 'center', width: '25%', marginBottom: 3 },
  box: { width: 8, height: 8, borderWidth: 0.8, borderStyle: 'solid', borderColor: colors.ink2, marginRight: 5, alignItems: 'center', justifyContent: 'center' },
  boxOn: { width: 4.5, height: 4.5, backgroundColor: colors.ink },
  checkLabel: { fontSize: 9 },
  panel: { padding: 7, borderWidth: 0.5, borderStyle: 'solid', borderColor: colors.border, borderRadius: 4, minHeight: 30 },
  blank: { height: 32 },
  endRow: { flexDirection: 'row', gap: 12 },
  endCol: { flex: 1 },
  signRow: { flexDirection: 'row', gap: 16, marginTop: 12 },
  signBox: { flex: 1, padding: 9, borderWidth: 0.5, borderStyle: 'solid', borderColor: colors.border, borderRadius: 4, minHeight: 92 },
  signText: { fontSize: 8.5, color: colors.ink2 },
  signature: { marginTop: 4, height: 58, objectFit: 'contain', objectPositionX: 0 },
  muted: { fontSize: 8.5, color: colors.ink3 },
})

const frDate = (d: string | null) => (d ? format(new Date(d), 'd MMMM yyyy', { locale: fr }) : '—')
const clock = (d: string | null) => (d ? format(new Date(d), "HH'h'mm", { locale: fr }) : '—')

function Check({ label, checked }: { label: string; checked: boolean }) {
  return (
    <View style={s.check}>
      <View style={s.box}>{checked ? <View style={s.boxOn} /> : null}</View>
      <Text style={s.checkLabel}>{label}</Text>
    </View>
  )
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <View style={s.infoCell}>
      <Text style={s.infoLabel}>{label}</Text>
      <Text style={s.infoValue}>{value}</Text>
    </View>
  )
}

/** Bon d'intervention : une page, signée par le client à la fin de la visite */
export function WorkOrderPdf({ data: raw, organizationName, settings }: { data: WorkOrderPdfData; organizationName: string; settings: InvoicingSettings | null }) {
  // Textes nettoyés pour la police du PDF (« CO₂ »…)
  const data = pdfSafe(raw)
  return (
    <Document title={`Bon d'intervention ${data.reference}`}>
      <Page size="A4" style={[base.page, { paddingTop: 28, paddingBottom: 46 }]}>
        <View style={[base.header, { marginBottom: 14 }]}>
          <OrgHeaderBlock organizationName={organizationName} settings={settings} />
          <View style={base.headerMeta}>
            <Text style={base.docLabel}>Bon d'intervention</Text>
            <Text style={base.docRef}>{data.reference}</Text>
            <Text style={base.docDate}>du {frDate(data.visitDate)}</Text>
          </View>
        </View>

        <View style={[base.addressBlock, { marginBottom: 10 }]}>
          <View style={base.addressCol}>
            <Text style={base.addressLabel}>Client</Text>
            <Text style={base.addressName}>{data.clientName}</Text>
            {data.clientLines.map((l, i) => <Text key={i} style={base.addressLine}>{l}</Text>)}
          </View>
          <View style={base.addressCol}>
            <Text style={base.addressLabel}>Lieu d'intervention</Text>
            {data.siteName && <Text style={base.addressName}>{data.siteName}</Text>}
            {data.siteAddress && <Text style={base.addressLine}>{data.siteAddress}</Text>}
            {data.dossierNumber && <Text style={base.addressLine}>N° de dossier : {data.dossierNumber}</Text>}
          </View>
        </View>

        <View style={s.grid}>
          <Info label="Technicien" value={data.technicianName ?? '—'} />
          <Info label="Date" value={frDate(data.visitDate)} />
          <Info label="Arrivée" value={clock(data.arrivalAt)} />
          <Info label="Départ" value={clock(data.departureAt)} />
        </View>

        <View style={s.section} wrap={false}>
          <Text style={s.sectionTitle}>Domaines</Text>
          <View style={s.checks}>{data.domains.map((d) => <Check key={d.label} {...d} />)}</View>
        </View>

        <View style={s.section} wrap={false}>
          <Text style={s.sectionTitle}>Nature de l'intervention</Text>
          <View style={s.checks}>{data.natures.map((n) => <Check key={n.label} {...n} />)}</View>
          <View style={[s.panel, { marginTop: 4 }]}>
            {data.description.trim() ? <Text>{data.description.trim()}</Text> : <View style={s.blank} />}
          </View>
        </View>

        <View style={s.section} wrap={false}>
          <Text style={s.sectionTitle}>Sécurité sur place</Text>
          <View style={s.checks}>{data.safety.map((x) => <Check key={x.label} {...x} />)}</View>
        </View>

        {data.standards.length > 0 && (
          <View style={s.section} wrap={false}>
            <Text style={s.sectionTitle}>Référentiels</Text>
            <Text style={{ fontSize: 9 }}>{data.standards.join(' · ')}</Text>
          </View>
        )}

        <View style={[s.section, s.endRow]} wrap={false}>
          <View style={s.endCol}>
            <Text style={s.sectionTitle}>Travaux finis et testés</Text>
            <View style={s.panel}>
              <Check label={data.finished ? `RAS, le ${frDate(data.finishedDate)}` : 'RAS'} checked={data.finished} />
            </View>
          </View>
          <View style={s.endCol}>
            <Text style={s.sectionTitle}>Travaux restants à faire</Text>
            <View style={s.panel}>
              {data.remaining.trim() ? <Text style={{ fontSize: 9 }}>{data.remaining.trim()}</Text> : <Text style={s.muted}>Aucun</Text>}
            </View>
          </View>
        </View>

        <View style={s.signRow} wrap={false}>
          <View style={s.signBox}>
            <Text style={s.sectionTitle}>Le client</Text>
            {data.signatureDataUrl ? (
              <>
                <Text style={s.signText}>
                  {data.signedByName ? `${data.signedByName}` : 'Signé'}
                  {data.signedAt ? `, le ${format(new Date(data.signedAt), "d MMMM yyyy 'à' HH'h'mm", { locale: fr })}` : ''}
                </Text>
                <Image src={data.signatureDataUrl} style={s.signature} />
              </>
            ) : (
              <Text style={s.signText}>Nom, date, signature et cachet</Text>
            )}
          </View>
          <View style={s.signBox}>
            <Text style={s.sectionTitle}>Le technicien</Text>
            <Text style={s.signText}>{data.technicianName ?? ''}</Text>
          </View>
        </View>

        <LegalFooter organizationName={organizationName} settings={settings} />
      </Page>
    </Document>
  )
}

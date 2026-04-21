import { Document, Image, Page, StyleSheet, Text, View } from '@react-pdf/renderer'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import { EQUIPMENT_TYPES } from '../../../shared/constants/interventions'
import type { EquipmentType } from '../../../shared/constants/interventions'
import type { Intervention } from '../../planning/schemas'
import type { ChecklistItem } from '../checklists'
import type { Report } from '../schemas'

const colors = {
  ink: '#1C2130',
  ink2: '#5A6070',
  ink3: '#9AA0AE',
  acc: '#3A5CA8',
  grn: '#2E7D5E',
  grnLt: '#D4EDE5',
  red: '#A83A3A',
  redLt: '#F0DADA',
  gry: '#6B7A8D',
  gryLt: '#DDE2EA',
  border: '#E6E8EC',
  borderLight: '#F2F3F5',
  bg: '#F8F9FB',
}

const styles = StyleSheet.create({
  page: {
    padding: 36,
    paddingBottom: 50,
    fontFamily: 'Helvetica',
    fontSize: 10,
    color: colors.ink,
    lineHeight: 1.4,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginBottom: 18,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomStyle: 'solid',
    borderBottomColor: colors.ink,
  },
  orgName: {
    fontSize: 16,
    fontFamily: 'Helvetica-Bold',
    color: colors.ink,
  },
  headerMeta: {
    alignItems: 'flex-end',
  },
  reportLabel: {
    fontSize: 8,
    color: colors.ink3,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 2,
  },
  reportRef: {
    fontSize: 13,
    fontFamily: 'Helvetica-Bold',
    color: colors.acc,
  },
  section: {
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 8,
    fontFamily: 'Helvetica-Bold',
    color: colors.acc,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    marginBottom: 6,
  },
  infoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  infoItemHalf: {
    width: '50%',
    marginBottom: 6,
    paddingRight: 4,
  },
  infoItemFull: {
    width: '100%',
    marginBottom: 6,
  },
  infoLabel: {
    fontSize: 7,
    color: colors.ink3,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  infoValue: {
    fontSize: 10,
    fontFamily: 'Helvetica-Bold',
  },
  checklistRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 5,
    borderBottomWidth: 0.5,
    borderBottomStyle: 'solid',
    borderBottomColor: colors.border,
  },
  checklistLabel: {
    flex: 1,
    fontSize: 10,
    color: colors.ink,
    paddingRight: 10,
  },
  badge: {
    width: 42,
    paddingVertical: 3,
    paddingHorizontal: 2,
    textAlign: 'center',
    fontSize: 8,
    fontFamily: 'Helvetica-Bold',
    borderRadius: 3,
  },
  badgeOk: { backgroundColor: colors.grnLt, color: colors.grn },
  badgeNok: { backgroundColor: colors.redLt, color: colors.red },
  badgeNa: { backgroundColor: colors.gryLt, color: colors.gry },
  badgeEmpty: { backgroundColor: colors.borderLight, color: colors.ink3 },
  observations: {
    fontSize: 10,
    backgroundColor: colors.bg,
    padding: 10,
    borderRadius: 4,
    lineHeight: 1.5,
  },
  photosGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  photo: {
    width: 150,
    height: 112,
    objectFit: 'cover',
    marginRight: 8,
    marginBottom: 8,
    borderRadius: 3,
  },
  signatureBox: {
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: colors.border,
    borderRadius: 4,
    padding: 10,
    minHeight: 90,
  },
  signatureName: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 10,
    marginBottom: 6,
  },
  signatureImage: {
    maxHeight: 70,
    objectFit: 'contain',
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
  },
})

const BADGE_LABELS: Record<string, string> = { ok: 'OK', nok: 'NOK', na: 'N/A' }

type Props = {
  intervention: Intervention
  report: Report
  checklistItems: ChecklistItem[]
  organizationName: string
}

export function ReportPdf({ intervention, report, checklistItems, organizationName }: Props) {
  const equipmentLabel =
    EQUIPMENT_TYPES[intervention.equipment_type as EquipmentType] ?? intervention.equipment_type
  const dateLabel = intervention.scheduled_date
    ? format(new Date(intervention.scheduled_date), 'd MMMM yyyy', { locale: fr })
    : '—'
  const completedLabel = report.completed_at
    ? format(new Date(report.completed_at), "d MMMM yyyy 'à' HH:mm", { locale: fr })
    : '—'

  const responseByItemId = new Map(report.checklist.map((r) => [r.id, r]))
  const okCount = report.checklist.filter((r) => r.value === 'ok').length
  const nokCount = report.checklist.filter((r) => r.value === 'nok').length
  const naCount = report.checklist.filter((r) => r.value === 'na').length

  function badgeStyle(value: string | null | undefined) {
    if (value === 'ok') return [styles.badge, styles.badgeOk]
    if (value === 'nok') return [styles.badge, styles.badgeNok]
    if (value === 'na') return [styles.badge, styles.badgeNa]
    return [styles.badge, styles.badgeEmpty]
  }

  const checklistSummary =
    `${okCount} conforme${okCount > 1 ? 's' : ''}` +
    (nokCount > 0 ? ` · ${nokCount} non conforme${nokCount > 1 ? 's' : ''}` : '') +
    (naCount > 0 ? ` · ${naCount} non applicable${naCount > 1 ? 's' : ''}` : '')

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* HEADER */}
        <View style={styles.header} fixed>
          <Text style={styles.orgName}>{organizationName || 'Maintenance'}</Text>
          <View style={styles.headerMeta}>
            <Text style={styles.reportLabel}>Rapport d'intervention</Text>
            <Text style={styles.reportRef}>{intervention.reference}</Text>
          </View>
        </View>

        {/* INTERVENTION INFO */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Intervention</Text>
          <View style={styles.infoGrid}>
            <View style={styles.infoItemHalf}>
              <Text style={styles.infoLabel}>Client</Text>
              <Text style={styles.infoValue}>{intervention.client_name}</Text>
            </View>
            {intervention.site_name && (
              <View style={styles.infoItemHalf}>
                <Text style={styles.infoLabel}>Site</Text>
                <Text style={styles.infoValue}>{intervention.site_name}</Text>
              </View>
            )}
            {intervention.address && (
              <View style={styles.infoItemFull}>
                <Text style={styles.infoLabel}>Adresse</Text>
                <Text style={styles.infoValue}>{intervention.address}</Text>
              </View>
            )}
            <View style={styles.infoItemHalf}>
              <Text style={styles.infoLabel}>Équipement</Text>
              <Text style={styles.infoValue}>{equipmentLabel}</Text>
            </View>
            <View style={styles.infoItemHalf}>
              <Text style={styles.infoLabel}>Date prévue</Text>
              <Text style={styles.infoValue}>{dateLabel}</Text>
            </View>
            {intervention.technician_name && (
              <View style={styles.infoItemHalf}>
                <Text style={styles.infoLabel}>Technicien</Text>
                <Text style={styles.infoValue}>{intervention.technician_name}</Text>
              </View>
            )}
          </View>
        </View>

        {/* CHECKLIST */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Checklist — {checklistSummary}</Text>
          {checklistItems.map((item) => {
            const resp = responseByItemId.get(item.id)
            const value = resp?.value ?? null
            const label = value ? BADGE_LABELS[value] : '—'
            return (
              <View key={item.id} style={styles.checklistRow} wrap={false}>
                <Text style={styles.checklistLabel}>{item.label}</Text>
                <Text style={badgeStyle(value)}>{label}</Text>
              </View>
            )
          })}
        </View>

        {/* OBSERVATIONS */}
        {report.observations ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Observations et anomalies</Text>
            <Text style={styles.observations}>{report.observations}</Text>
          </View>
        ) : null}

        {/* PHOTOS */}
        {report.photos.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>
              Photos ({report.photos.length})
            </Text>
            <View style={styles.photosGrid}>
              {report.photos.map((photo) => (
                <Image key={photo.path} src={photo.url} style={styles.photo} />
              ))}
            </View>
          </View>
        ) : null}

        {/* SIGNATURE */}
        <View style={styles.section} wrap={false}>
          <Text style={styles.sectionTitle}>Validation client</Text>
          <View style={styles.signatureBox}>
            {report.signed_by_name ? (
              <Text style={styles.signatureName}>
                Signé par : {report.signed_by_name}
              </Text>
            ) : null}
            {report.signature_data_url ? (
              <Image src={report.signature_data_url} style={styles.signatureImage} />
            ) : (
              <Text style={{ color: colors.ink3, fontSize: 9 }}>
                Aucune signature électronique enregistrée.
              </Text>
            )}
          </View>
        </View>

        {/* FOOTER */}
        <Text style={styles.footer} fixed>
          {organizationName ? `${organizationName} — ` : ''}Rapport {intervention.reference} finalisé le {completedLabel}
        </Text>
      </Page>
    </Document>
  )
}

import { Document, Image, Page, StyleSheet, Text, View } from '@react-pdf/renderer'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import {
  EQUIPMENT_TYPES,
  formatEquipmentTypes,
} from '../../../shared/constants/interventions'
import type { EquipmentType } from '../../../shared/constants/interventions'
import type { Intervention } from '../../planning/schemas'
import type { ChecklistItem } from '../checklists'
import {
  RECOMMENDED_ACTION_LABEL,
  computeReportSummary,
  decodeChecklistId,
  responsesToByType,
} from '../schemas'
import type { ChecklistResponse, Report } from '../schemas'

const colors = {
  ink: '#1C2130',
  ink2: '#5A6070',
  ink3: '#9AA0AE',
  acc: '#3A5CA8',
  grn: '#2E7D5E',
  grnLt: '#D4EDE5',
  red: '#A83A3A',
  redLt: '#F0DADA',
  org: '#C45A1A',
  orgLt: '#F4D9BF',
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
  // Tampon Conforme / Non conforme
  stamp: {
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 4,
    borderWidth: 1.5,
    borderStyle: 'solid',
    textAlign: 'center',
    fontFamily: 'Helvetica-Bold',
    fontSize: 13,
    letterSpacing: 1.5,
    marginBottom: 14,
  },
  stampConform: {
    color: colors.grn,
    borderColor: colors.grn,
    backgroundColor: colors.grnLt,
  },
  stampNonConform: {
    color: colors.red,
    borderColor: colors.red,
    backgroundColor: colors.redLt,
  },
  stampPartial: {
    color: colors.org,
    borderColor: colors.org,
    backgroundColor: colors.orgLt,
  },
  // Synthèse
  summaryBox: {
    backgroundColor: colors.bg,
    padding: 10,
    borderRadius: 4,
    marginBottom: 14,
    borderLeftWidth: 3,
    borderLeftStyle: 'solid',
  },
  summaryBoxNonConform: {
    borderLeftColor: colors.red,
    backgroundColor: colors.redLt,
  },
  summaryBoxConform: {
    borderLeftColor: colors.grn,
    backgroundColor: colors.grnLt,
  },
  summaryTitle: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 11,
    marginBottom: 4,
  },
  summaryItem: {
    fontSize: 9,
    marginTop: 2,
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
  // Détail NOK : action + note + photos
  nokDetailBlock: {
    backgroundColor: colors.redLt,
    borderLeftWidth: 2,
    borderLeftStyle: 'solid',
    borderLeftColor: colors.red,
    padding: 8,
    marginTop: 4,
    marginBottom: 8,
  },
  nokLabel: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 9,
    color: colors.red,
    marginBottom: 3,
  },
  nokText: {
    fontSize: 9,
    marginBottom: 2,
  },
  nokActionBadge: {
    alignSelf: 'flex-start',
    backgroundColor: colors.red,
    color: '#FFFFFF',
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: 2,
    fontSize: 8,
    fontFamily: 'Helvetica-Bold',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  nokPhotos: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 4,
  },
  nokPhoto: {
    width: 110,
    height: 80,
    objectFit: 'cover',
    marginRight: 4,
    marginBottom: 4,
    borderRadius: 2,
  },
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

export type ReportPdfSection = {
  type: string              // 'extincteurs', 'ria', etc.
  label: string             // 'Extincteurs', 'RIA', etc.
  items: ChecklistItem[]    // items de checklist du type
  responses: ChecklistResponse[] // réponses (avec id sans préfixe)
}

type Props = {
  intervention: Intervention
  report: Report
  sections: ReportPdfSection[]
  organizationName: string
}

export function ReportPdf({ intervention, report, sections, organizationName }: Props) {
  const interventionEquipsLabel = formatEquipmentTypes(intervention.equipment_types)

  const dateLabel = intervention.scheduled_date
    ? format(new Date(intervention.scheduled_date), 'd MMMM yyyy', { locale: fr })
    : '—'
  const completedLabel = report.completed_at
    ? format(new Date(report.completed_at), "d MMMM yyyy 'à' HH:mm", { locale: fr })
    : '—'

  // Si `sections` est vide (ex: rapport legacy, ou appel direct avec ancien format),
  // on reconstitue depuis report.checklist.
  let effectiveSections = sections
  if (effectiveSections.length === 0 && report.checklist.length > 0) {
    // Legacy : on essaye de décoder au moins quelque chose
    const byType = responsesToByType(report.checklist, report.equipment_type)
    effectiveSections = Object.entries(byType).map(([t, responses]) => ({
      type: t,
      label: EQUIPMENT_TYPES[t as EquipmentType] ?? t,
      items: [], // pas de liste connue — on affiche juste les réponses par id
      responses,
    }))
    // Dans ce cas, on préfère utiliser les id comme labels
  }

  // Calculs globaux (tous les équipements)
  let totalItems = 0
  let okCount = 0
  let nokCount = 0
  let naCount = 0
  type AnomalyLine = { label: string; action?: string; note?: string; photos: { path: string; url: string }[]; reason?: string; typeLabel: string }
  const anomalies: AnomalyLine[] = []
  for (const sec of effectiveSections) {
    totalItems += sec.items.length || sec.responses.length
    for (const it of sec.items.length > 0 ? sec.items : sec.responses) {
      const r = sec.items.length > 0
        ? sec.responses.find((x) => x.id === (it as ChecklistItem).id)
        : (it as ChecklistResponse)
      if (!r) continue
      if (r.value === 'ok') okCount++
      else if (r.value === 'nok') {
        nokCount++
        const label =
          sec.items.length > 0
            ? (it as ChecklistItem).label
            : decodeChecklistId((it as ChecklistResponse).id)[1]
        anomalies.push({
          label,
          action: r.action,
          note: r.note,
          photos: r.photos ?? [],
          reason: r.noPhotoReason,
          typeLabel: sec.label,
        })
      }
      else if (r.value === 'na') naCount++
    }
  }
  const answered = okCount + nokCount + naCount
  const isConform = answered === totalItems ? nokCount === 0 : null
  const summary = { answered, total: totalItems, okCount, nokCount, naCount, isConform }
  void computeReportSummary // évite l'avertissement lint (on garde l'import pour compat future)

  function badgeStyle(value: string | null | undefined) {
    if (value === 'ok') return [styles.badge, styles.badgeOk]
    if (value === 'nok') return [styles.badge, styles.badgeNok]
    if (value === 'na') return [styles.badge, styles.badgeNa]
    return [styles.badge, styles.badgeEmpty]
  }

  const stampLabel =
    summary.isConform === true ? 'CONFORME' :
    summary.isConform === false ? 'NON CONFORME' :
    'INCOMPLET'
  const stampStyle =
    summary.isConform === true ? styles.stampConform :
    summary.isConform === false ? styles.stampNonConform :
    styles.stampPartial

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

        {/* TAMPON CONFORMITÉ */}
        <View style={[styles.stamp, stampStyle]}>
          <Text>{stampLabel}</Text>
        </View>

        {/* SYNTHÈSE */}
        {summary.isConform === false && anomalies.length > 0 ? (
          <View style={[styles.summaryBox, styles.summaryBoxNonConform]}>
            <Text style={styles.summaryTitle}>
              {summary.nokCount} anomalie{summary.nokCount > 1 ? 's' : ''} détectée{summary.nokCount > 1 ? 's' : ''}
            </Text>
            {anomalies.map((a, i) => (
              <Text key={i} style={styles.summaryItem}>
                • [{a.typeLabel}] {a.label}
                {a.action ? ` — ${RECOMMENDED_ACTION_LABEL[a.action as keyof typeof RECOMMENDED_ACTION_LABEL]}` : ''}
              </Text>
            ))}
          </View>
        ) : summary.isConform === true ? (
          <View style={[styles.summaryBox, styles.summaryBoxConform]}>
            <Text style={styles.summaryTitle}>
              Tous les points de contrôle sont conformes ({summary.okCount} OK
              {summary.naCount > 0 ? ` · ${summary.naCount} N/A` : ''}).
            </Text>
          </View>
        ) : null}

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
            <View style={styles.infoItemFull}>
              <Text style={styles.infoLabel}>Équipements contrôlés</Text>
              <Text style={styles.infoValue}>{interventionEquipsLabel}</Text>
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

        {/* CHECKLIST — une section par équipement contrôlé */}
        {effectiveSections.map((section) => {
          const secOk = section.responses.filter((r) => r.value === 'ok').length
          const secNok = section.responses.filter((r) => r.value === 'nok').length
          const secNa = section.responses.filter((r) => r.value === 'na').length
          const displayItems: Array<{ id: string; label: string; response: ChecklistResponse | undefined }> =
            section.items.length > 0
              ? section.items.map((it) => ({
                  id: it.id,
                  label: it.label,
                  response: section.responses.find((r) => r.id === it.id),
                }))
              : section.responses.map((r) => ({
                  id: r.id,
                  label: decodeChecklistId(r.id)[1],
                  response: r,
                }))
          return (
            <View key={section.type} style={styles.section}>
              <Text style={styles.sectionTitle}>
                Checklist — {section.label}
                {' · '}{secOk} conforme{secOk > 1 ? 's' : ''}
                {secNok > 0 ? ` · ${secNok} non conforme${secNok > 1 ? 's' : ''}` : ''}
                {secNa > 0 ? ` · ${secNa} N/A` : ''}
              </Text>
              {displayItems.map((item) => {
                const resp = item.response
                const value = resp?.value ?? null
                const label = value ? BADGE_LABELS[value] : '—'
                const isNok = value === 'nok'
                return (
                  <View key={item.id}>
                    <View style={styles.checklistRow} wrap={false}>
                      <Text style={styles.checklistLabel}>{item.label}</Text>
                      <Text style={badgeStyle(value)}>{label}</Text>
                    </View>
                    {isNok && (resp?.action || resp?.note || (resp?.photos && resp.photos.length > 0) || resp?.noPhotoReason) && (
                      <View style={styles.nokDetailBlock} wrap={false}>
                        {resp?.action && (
                          <Text style={styles.nokActionBadge}>
                            Action : {RECOMMENDED_ACTION_LABEL[resp.action]}
                          </Text>
                        )}
                        {resp?.note && (
                          <Text style={styles.nokText}>
                            <Text style={styles.nokLabel}>Précisions : </Text>
                            {resp.note}
                          </Text>
                        )}
                        {resp?.noPhotoReason && (
                          <Text style={styles.nokText}>
                            <Text style={styles.nokLabel}>Justification sans photo : </Text>
                            {resp.noPhotoReason}
                          </Text>
                        )}
                        {resp?.photos && resp.photos.length > 0 && (
                          <View style={styles.nokPhotos}>
                            {resp.photos.map((p) => (
                              <Image key={p.path} src={p.url} style={styles.nokPhoto} />
                            ))}
                          </View>
                        )}
                      </View>
                    )}
                  </View>
                )
              })}
            </View>
          )
        })}

        {/* OBSERVATIONS */}
        {report.observations ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Observations générales</Text>
            <Text style={styles.observations}>{report.observations}</Text>
          </View>
        ) : null}

        {/* PHOTOS COMPLÉMENTAIRES */}
        {report.photos.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>
              Photos complémentaires ({report.photos.length})
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

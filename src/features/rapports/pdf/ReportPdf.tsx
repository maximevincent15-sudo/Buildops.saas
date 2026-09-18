import { Document, Image, Page, StyleSheet, Text, View } from '@react-pdf/renderer'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import {
  ANOMALY_ACTION_LABELS,
  ANOMALY_PRIORITY_LABELS,
  ANOMALY_STATUS_LABELS,
} from '../../anomalies/schemas'
import type { Anomaly } from '../../anomalies/schemas'
import {
  EQUIPMENT_TYPES,
  formatEquipmentTypes,
} from '../../../shared/constants/interventions'
import type { EquipmentType } from '../../../shared/constants/interventions'
import type { InvoicingSettings } from '../../parametres/api'
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
  // ─── Registre APSAD nominatif ───
  unitStatsRow: {
    flexDirection: 'row',
    marginBottom: 10,
    gap: 6,
  },
  unitStatChip: {
    flexGrow: 1,
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 4,
    borderWidth: 0.5,
    borderStyle: 'solid',
  },
  unitStatLabel: {
    fontSize: 7,
    color: colors.ink3,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  unitStatValue: {
    fontSize: 14,
    fontFamily: 'Helvetica-Bold',
    marginTop: 2,
  },
  regTable: {
    borderWidth: 0.5,
    borderStyle: 'solid',
    borderColor: colors.border,
  },
  regRow: {
    flexDirection: 'row',
    borderBottomWidth: 0.5,
    borderBottomStyle: 'solid',
    borderBottomColor: colors.border,
  },
  regRowLast: {
    borderBottomWidth: 0,
  },
  regRowHead: {
    backgroundColor: colors.bg,
  },
  regCell: {
    paddingVertical: 4,
    paddingHorizontal: 4,
    borderRightWidth: 0.5,
    borderRightStyle: 'solid',
    borderRightColor: colors.border,
    fontSize: 8,
  },
  regCellHead: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 7,
    color: colors.ink2,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  regCellLast: {
    borderRightWidth: 0,
  },
  regVerdictConforme: { color: colors.grn },
  regVerdictSurveiller: { color: colors.org },
  regVerdictReformer: { color: colors.red, fontFamily: 'Helvetica-Bold' },
  regVerdictNonVerifie: { color: colors.ink3, fontStyle: 'italic' },
})

const BADGE_LABELS: Record<string, string> = { ok: 'OK', nok: 'NOK', na: 'N/A' }

export type ReportPdfSection = {
  type: string              // 'extincteurs', 'ria', etc.
  label: string             // 'Extincteurs', 'RIA', etc.
  items: ChecklistItem[]    // items de checklist du type
  responses: ChecklistResponse[] // réponses (avec id sans préfixe)
}

/** Une anomalie enrichie pour le PDF, avec les infos d'unité résolues. */
export type AnomalyPdfEntry = {
  anomaly: Anomaly
  unitSerial: string | null
  unitFamilyLabel: string | null
  unitSubtype: string | null
  unitImplantation: string | null
  unitZoneName: string | null
}

/** Une ligne du registre APSAD nominatif. Préparée par le caller. */
export type UnitReportEntry = {
  unitSerial: string
  zoneName: string | null
  parentZone: string | null
  implantation: string | null
  familyLabel: string
  subtype: string | null
  brand: string | null
  installYear: number | null
  verdict: 'non_verifie' | 'conforme' | 'surveiller' | 'reformer'
  verdictLabel: string
  observation: string | null
}

type Props = {
  intervention: Intervention
  report: Report
  sections: ReportPdfSection[]
  organizationName: string
  /** Contrôles unitaires (Slice E). Optionnel : si vide, la section n'apparaît pas. */
  unitEntries?: UnitReportEntry[]
  /** Identité juridique de l'entreprise intervenante (SIRET, adresse, etc.). Optionnel. */
  settings?: InvoicingSettings | null
  /** Anomalies persistantes (Slice M6) — remplace le résumé auto si fourni. */
  anomalyEntries?: AnomalyPdfEntry[]
  /** Type d'intervention affiché dans le bandeau (Préventive/Corrective/…). */
  interventionType?: string | null
  /** Date de la prochaine intervention planifiée (ISO date). */
  nextInterventionDate?: string | null
}

export function ReportPdf({
  intervention, report, sections, organizationName,
  unitEntries, settings, anomalyEntries,
  interventionType, nextInterventionDate,
}: Props) {
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

  // ─── Slice M6 : map "label du contrôle NOK" → [serials d'unités] ──────
  // Permet de préfixer chaque NOK dans la checklist par l'équipement précis
  // (ex : "EXT-07 — Date de péremption non dépassée")
  const nokUnitMap = new Map<string, string[]>()
  if (anomalyEntries) {
    for (const e of anomalyEntries) {
      const key = e.anomaly.checklist_item_label
      if (!key || !e.unitSerial) continue
      const prefix =
        e.unitFamilyLabel === 'Extincteurs' ? 'EXT'
        : e.unitFamilyLabel === 'RIA' ? 'RIA'
        : e.unitFamilyLabel === 'Désenfumage' ? 'DES'
        : e.unitFamilyLabel === 'BAES' ? 'BAES'
        : e.unitFamilyLabel === 'Portes coupe-feu' ? 'PCF'
        : e.unitFamilyLabel === 'Détection incendie' ? 'DET'
        : e.unitFamilyLabel === 'Colonnes sèches' ? 'COL'
        : 'EQP'
      const serial = e.unitSerial.padStart(2, '0')
      const arr = nokUnitMap.get(key) ?? []
      arr.push(`${prefix}-${serial}`)
      nokUnitMap.set(key, arr)
    }
  }

  // ─── Identité entreprise intervenante (P0 #2) ─────────────────────────
  const companyAddressLine = [
    settings?.legal_address?.trim(),
    [settings?.legal_postal_code, settings?.legal_city].filter(Boolean).join(' ').trim(),
  ]
    .filter(Boolean)
    .join(', ')
  const companyContactLine = [
    settings?.legal_phone?.trim(),
    settings?.legal_email?.trim(),
  ]
    .filter(Boolean)
    .join(' · ')
  const companyLegalLine = [
    settings?.siret ? `SIRET ${settings.siret}` : null,
    settings?.vat_number ? `TVA ${settings.vat_number}` : null,
    settings?.ape_code ? `APE ${settings.ape_code}` : null,
  ]
    .filter(Boolean)
    .join(' · ')
  const hasCompanyBlock = companyAddressLine || companyContactLine || companyLegalLine

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

        {/* IDENTITÉ ENTREPRISE INTERVENANTE (P0 #2) */}
        {hasCompanyBlock && (
          <View
            style={{
              marginBottom: 10,
              paddingBottom: 8,
              borderBottomWidth: 0.5,
              borderBottomStyle: 'solid',
              borderBottomColor: colors.border,
            }}
          >
            {companyAddressLine && (
              <Text style={{ fontSize: 9, color: colors.ink2, marginBottom: 2 }}>
                {companyAddressLine}
              </Text>
            )}
            {companyContactLine && (
              <Text style={{ fontSize: 9, color: colors.ink2, marginBottom: 2 }}>
                {companyContactLine}
              </Text>
            )}
            {companyLegalLine && (
              <Text style={{ fontSize: 8, color: colors.ink3 }}>
                {companyLegalLine}
              </Text>
            )}
          </View>
        )}

        {/* TAMPON CONFORMITÉ */}
        <View style={[styles.stamp, stampStyle]}>
          <Text>{stampLabel}</Text>
        </View>

        {/* SYNTHÈSE — Slice M6 : si anomalyEntries fourni, on ne montre PAS le
            résumé auto-calculé (les blocs anomalies persistantes sont mieux) */}
        {(!anomalyEntries || anomalyEntries.length === 0)
          && summary.isConform === false
          && anomalies.length > 0 ? (
          <View style={[styles.summaryBox, styles.summaryBoxNonConform]}>
            <Text style={styles.summaryTitle}>
              {summary.nokCount} anomalie{summary.nokCount > 1 ? 's' : ''} détectée{summary.nokCount > 1 ? 's' : ''}
            </Text>
            {anomalies.map((a, i) => {
              const anomalyText = a.note?.trim() || a.label
              const actionLabel = a.action
                ? RECOMMENDED_ACTION_LABEL[a.action as keyof typeof RECOMMENDED_ACTION_LABEL]
                : null
              const showControlLabel = a.note?.trim() && a.note.trim() !== a.label
              return (
                <View key={i} style={{ marginBottom: 4 }}>
                  <Text style={styles.summaryItem}>
                    • [{a.typeLabel}] {anomalyText}
                    {actionLabel ? ` — Action : ${actionLabel}` : ''}
                  </Text>
                  {showControlLabel && (
                    <Text
                      style={{
                        fontSize: 8,
                        color: colors.ink3,
                        marginLeft: 8,
                        marginTop: 1,
                      }}
                    >
                      Point de contrôle : {a.label}
                    </Text>
                  )}
                </View>
              )
            })}
          </View>
        ) : summary.isConform === true ? (
          <View style={[styles.summaryBox, styles.summaryBoxConform]}>
            <Text style={styles.summaryTitle}>
              Tous les points de contrôle sont conformes ({summary.okCount} OK
              {summary.naCount > 0 ? ` · ${summary.naCount} N/A` : ''}).
            </Text>
          </View>
        ) : null}

        {/* Slice M6 — Petites stats compactes remplaçant le bloc rose redondant */}
        {anomalyEntries && anomalyEntries.length > 0 && (
          <View
            style={{
              flexDirection: 'row',
              gap: 8,
              marginTop: 6,
              marginBottom: 4,
            }}
          >
            <View style={{ flex: 1, padding: 6, backgroundColor: '#F3F5F7', borderRadius: 4 }}>
              <Text style={{ fontSize: 7, color: colors.ink3, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                Contrôlés
              </Text>
              <Text style={{ fontSize: 13, fontFamily: 'Helvetica-Bold', color: colors.ink, marginTop: 1 }}>
                {(unitEntries?.length ?? summary.total) || summary.total}
              </Text>
            </View>
            <View style={{ flex: 1, padding: 6, backgroundColor: '#FDECEC', borderRadius: 4 }}>
              <Text style={{ fontSize: 7, color: colors.red, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                Anomalies
              </Text>
              <Text style={{ fontSize: 13, fontFamily: 'Helvetica-Bold', color: colors.red, marginTop: 1 }}>
                {anomalyEntries.length}
              </Text>
            </View>
            <View style={{ flex: 1, padding: 6, backgroundColor: '#FDF3E0', borderRadius: 4 }}>
              <Text style={{ fontSize: 7, color: colors.org, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                Actions ouvertes
              </Text>
              <Text style={{ fontSize: 13, fontFamily: 'Helvetica-Bold', color: colors.org, marginTop: 1 }}>
                {anomalyEntries.filter((e) => e.anomaly.status === 'open' || e.anomaly.status === 'planned').length}
              </Text>
            </View>
          </View>
        )}

        {/* ANOMALIES PERSISTANTES (Slice M6) — bloc par unité avec toutes les infos */}
        {anomalyEntries && anomalyEntries.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>
              Anomalies détectées et enregistrées ({anomalyEntries.length})
            </Text>
            {anomalyEntries.map((entry, i) => (
              <AnomalyBlock key={entry.anomaly.id ?? i} entry={entry} />
            ))}
          </View>
        )}

        {/* INTERVENTION INFO */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Intervention</Text>
          <View style={styles.infoGrid}>
            {interventionType && (
              <View style={styles.infoItemHalf}>
                <Text style={styles.infoLabel}>Type d'intervention</Text>
                <Text style={styles.infoValue}>{interventionType}</Text>
              </View>
            )}
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
            {/* P1 — Bandeau enrichi : horaires réels + contact site */}
            {intervention.start_time && (
              <View style={styles.infoItemHalf}>
                <Text style={styles.infoLabel}>Début d'intervention</Text>
                <Text style={styles.infoValue}>
                  {format(new Date(intervention.start_time), "d MMMM yyyy 'à' HH:mm", { locale: fr })}
                </Text>
              </View>
            )}
            {intervention.start_time && intervention.duration_minutes && (
              <View style={styles.infoItemHalf}>
                <Text style={styles.infoLabel}>Fin d'intervention</Text>
                <Text style={styles.infoValue}>
                  {format(
                    new Date(new Date(intervention.start_time).getTime()
                      + intervention.duration_minutes * 60000),
                    "HH:mm",
                    { locale: fr },
                  )}
                  {' '}({intervention.duration_minutes} min)
                </Text>
              </View>
            )}
            {intervention.chantier_contact_name && (
              <View style={styles.infoItemHalf}>
                <Text style={styles.infoLabel}>Contact sur site</Text>
                <Text style={styles.infoValue}>
                  {intervention.chantier_contact_name}
                  {intervention.chantier_contact_phone
                    ? ` · ${intervention.chantier_contact_phone}`
                    : ''}
                </Text>
              </View>
            )}
            {nextInterventionDate && (
              <View style={styles.infoItemFull}>
                <Text style={styles.infoLabel}>Prochaine intervention prévue</Text>
                <Text style={[styles.infoValue, { color: colors.acc, fontFamily: 'Helvetica-Bold' }]}>
                  {format(new Date(`${nextInterventionDate}T00:00:00`), 'd MMMM yyyy', { locale: fr })}
                </Text>
              </View>
            )}
          </View>
        </View>

        {/* REGISTRE APSAD NOMINATIF (si contrôles unitaires) */}
        {unitEntries && unitEntries.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>
              Registre nominatif — {unitEntries.length} équipement{unitEntries.length > 1 ? 's' : ''} contrôlé{unitEntries.length > 1 ? 's' : ''}
            </Text>

            {/* Compteurs par verdict */}
            {(() => {
              const cnt = { conforme: 0, surveiller: 0, reformer: 0, non_verifie: 0 }
              for (const e of unitEntries) cnt[e.verdict]++
              return (
                <View style={styles.unitStatsRow}>
                  <View style={[styles.unitStatChip, { borderColor: colors.grn, backgroundColor: colors.grnLt }]}>
                    <Text style={styles.unitStatLabel}>Conformes</Text>
                    <Text style={[styles.unitStatValue, { color: colors.grn }]}>{cnt.conforme}</Text>
                  </View>
                  <View style={[styles.unitStatChip, { borderColor: colors.org, backgroundColor: colors.orgLt }]}>
                    <Text style={styles.unitStatLabel}>À surveiller</Text>
                    <Text style={[styles.unitStatValue, { color: colors.org }]}>{cnt.surveiller}</Text>
                  </View>
                  <View style={[styles.unitStatChip, { borderColor: colors.red, backgroundColor: colors.redLt }]}>
                    <Text style={styles.unitStatLabel}>À réformer</Text>
                    <Text style={[styles.unitStatValue, { color: colors.red }]}>{cnt.reformer}</Text>
                  </View>
                  {cnt.non_verifie > 0 && (
                    <View style={[styles.unitStatChip, { borderColor: colors.border, backgroundColor: colors.bg }]}>
                      <Text style={styles.unitStatLabel}>Non vérifiés</Text>
                      <Text style={[styles.unitStatValue, { color: colors.ink3 }]}>{cnt.non_verifie}</Text>
                    </View>
                  )}
                </View>
              )
            })()}

            {/* Tableau nominatif */}
            <View style={styles.regTable}>
              {/* En-tête */}
              <View style={[styles.regRow, styles.regRowHead]}>
                <View style={[styles.regCell, { width: '7%' }]}><Text style={styles.regCellHead}>N°</Text></View>
                <View style={[styles.regCell, { width: '15%' }]}><Text style={styles.regCellHead}>Niv / Zone</Text></View>
                <View style={[styles.regCell, { width: '18%' }]}><Text style={styles.regCellHead}>Implantation</Text></View>
                <View style={[styles.regCell, { width: '12%' }]}><Text style={styles.regCellHead}>Type</Text></View>
                <View style={[styles.regCell, { width: '12%' }]}><Text style={styles.regCellHead}>Marque</Text></View>
                <View style={[styles.regCell, { width: '7%' }]}><Text style={styles.regCellHead}>Année</Text></View>
                <View style={[styles.regCell, styles.regCellLast, { width: '29%' }]}><Text style={styles.regCellHead}>Verdict · Observation</Text></View>
              </View>

              {/* Lignes */}
              {unitEntries.map((e, i) => {
                const verdictStyle =
                  e.verdict === 'conforme' ? styles.regVerdictConforme
                  : e.verdict === 'surveiller' ? styles.regVerdictSurveiller
                  : e.verdict === 'reformer' ? styles.regVerdictReformer
                  : styles.regVerdictNonVerifie
                const zoneLabel = [e.parentZone, e.zoneName].filter(Boolean).join(' · ') || '—'
                const verdictText = `${e.verdictLabel}${e.observation ? ` — ${e.observation}` : ''}`
                const isLast = i === unitEntries.length - 1
                return (
                  <View
                    key={i}
                    style={isLast ? [styles.regRow, styles.regRowLast] : styles.regRow}
                    wrap={false}
                  >
                    <View style={[styles.regCell, { width: '7%' }]}><Text style={{ fontFamily: 'Helvetica-Bold', fontSize: 8 }}>{e.unitSerial}</Text></View>
                    <View style={[styles.regCell, { width: '15%' }]}><Text style={{ fontSize: 8 }}>{zoneLabel}</Text></View>
                    <View style={[styles.regCell, { width: '18%' }]}><Text style={{ fontSize: 8 }}>{e.implantation ?? '—'}</Text></View>
                    <View style={[styles.regCell, { width: '12%' }]}><Text style={{ fontSize: 8 }}>{e.subtype ?? e.familyLabel}</Text></View>
                    <View style={[styles.regCell, { width: '12%' }]}><Text style={{ fontSize: 8 }}>{e.brand ?? '—'}</Text></View>
                    <View style={[styles.regCell, { width: '7%' }]}><Text style={{ fontSize: 8 }}>{e.installYear ?? '—'}</Text></View>
                    <View style={[styles.regCell, styles.regCellLast, { width: '29%' }]}>
                      <Text style={[{ fontSize: 8 }, verdictStyle]}>{verdictText}</Text>
                    </View>
                  </View>
                )
              })}
            </View>
          </View>
        )}

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
                const nokUnits = isNok ? nokUnitMap.get(item.label) : null
                return (
                  <View key={item.id}>
                    <View style={styles.checklistRow} wrap={false}>
                      <Text style={styles.checklistLabel}>
                        {nokUnits && nokUnits.length > 0 && (
                          <Text style={{ fontFamily: 'Helvetica-Bold', color: colors.red }}>
                            {nokUnits.join(', ')} —{' '}
                          </Text>
                        )}
                        {item.label}
                      </Text>
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

        {/* SIGNATURES — technicien + client */}
        <View style={styles.section} wrap={false}>
          <Text style={styles.sectionTitle}>Signatures</Text>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            {/* Technicien */}
            <View style={[styles.signatureBox, { flexGrow: 1, flexBasis: '50%' }]}>
              <Text style={{ fontSize: 7, color: colors.ink3, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                Technicien qualifié
              </Text>
              <Text style={styles.signatureName}>
                {intervention.technician_name ?? '—'}
              </Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}>
                <View style={{ paddingVertical: 2, paddingHorizontal: 6, backgroundColor: colors.grnLt, borderRadius: 3 }}>
                  <Text style={{ fontSize: 7, fontFamily: 'Helvetica-Bold', color: colors.grn }}>
                    ✓ Signé électroniquement
                  </Text>
                </View>
              </View>
              <Text style={{ fontSize: 7, color: colors.ink3, marginTop: 4 }}>
                Le {completedLabel} — Firovia
              </Text>
            </View>

            {/* Client — P1 : gestion des cas absence / refus / non requis */}
            <View style={[styles.signatureBox, { flexGrow: 1, flexBasis: '50%' }]}>
              <Text style={{ fontSize: 7, color: colors.ink3, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                Représentant client
              </Text>
              {(() => {
                const status = report.signature_status ?? 'pending'
                const note = report.signature_note

                // Cas signé (comportement historique)
                if (status === 'signed' || (status === 'pending' && report.signature_data_url)) {
                  return (
                    <>
                      <Text style={styles.signatureName}>{report.signed_by_name ?? '—'}</Text>
                      {report.signature_data_url ? (
                        <>
                          <Image src={report.signature_data_url} style={styles.signatureImage} />
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}>
                            <View style={{ paddingVertical: 2, paddingHorizontal: 6, backgroundColor: colors.grnLt, borderRadius: 3 }}>
                              <Text style={{ fontSize: 7, fontFamily: 'Helvetica-Bold', color: colors.grn }}>
                                ✓ Signé électroniquement
                              </Text>
                            </View>
                          </View>
                          <Text style={{ fontSize: 7, color: colors.ink3, marginTop: 4 }}>Le {completedLabel}</Text>
                        </>
                      ) : (
                        <Text style={{ color: colors.ink3, fontSize: 9, marginTop: 6 }}>
                          Aucune signature enregistrée.
                        </Text>
                      )}
                    </>
                  )
                }

                // Cas alternatifs — badge + motif
                const cfg =
                  status === 'client_absent'
                    ? { label: 'Client absent', bg: colors.orgLt, fg: colors.org, icon: '⊘' }
                    : status === 'client_refused'
                      ? { label: 'Refus de signature', bg: colors.redLt, fg: colors.red, icon: '✗' }
                      : status === 'not_required'
                        ? { label: 'Signature non requise', bg: colors.gryLt, fg: colors.gry, icon: '–' }
                        : { label: 'En attente', bg: colors.gryLt, fg: colors.gry, icon: '⏳' }

                return (
                  <>
                    <View style={{ paddingVertical: 3, paddingHorizontal: 8, backgroundColor: cfg.bg, borderRadius: 3, marginTop: 4, alignSelf: 'flex-start' }}>
                      <Text style={{ fontSize: 8, fontFamily: 'Helvetica-Bold', color: cfg.fg }}>
                        {cfg.icon} {cfg.label}
                      </Text>
                    </View>
                    {note && (
                      <Text style={{ fontSize: 9, color: colors.ink, marginTop: 8, lineHeight: 1.4 }}>
                        {note}
                      </Text>
                    )}
                    <Text style={{ fontSize: 7, color: colors.ink3, marginTop: 6 }}>
                      Constaté sur site par le technicien le {completedLabel}.
                    </Text>
                  </>
                )
              })()}
            </View>
          </View>

          {/* Mention technique (P0 #14 : plus de déclaration eIDAS non justifiée) */}
          <View
            style={{
              marginTop: 10,
              padding: 6,
              backgroundColor: '#F0F5FF',
              borderWidth: 0.5,
              borderStyle: 'solid',
              borderColor: '#C8D6EF',
              borderRadius: 3,
            }}
          >
            <Text style={{ fontSize: 7, color: '#3A4E7A', lineHeight: 1.4 }}>
              Rapport généré électroniquement le {completedLabel}.
              Identifiant unique : {intervention.reference}.
              La signature apposée par le représentant client atteste de la
              prise de connaissance du présent rapport et de ses constats.
            </Text>
          </View>
        </View>

        {/* FOOTER — mention discrète Firovia (P0 #2) */}
        <Text style={styles.footer} fixed>
          {organizationName ? `${organizationName} — ` : ''}Rapport {intervention.reference} finalisé le {completedLabel}
          {'  ·  '}Généré avec Firovia
        </Text>
      </Page>
    </Document>
  )
}

// ─── Slice M6 — Bloc rendu d'une anomalie dans le PDF ─────────────────

function AnomalyBlock({ entry }: { entry: AnomalyPdfEntry }) {
  const {
    anomaly,
    unitSerial,
    unitFamilyLabel,
    unitSubtype,
    unitImplantation,
    unitZoneName,
  } = entry

  // Palette selon priorité
  const prioBg =
    anomaly.priority === 'high' ? '#FDECEC'
    : anomaly.priority === 'normal' ? '#FDF3E0'
    : '#F3F5F7'
  const prioBorder =
    anomaly.priority === 'high' ? '#F0BFBF'
    : anomaly.priority === 'normal' ? '#F0D9A6'
    : colors.border
  const prioIcon =
    anomaly.priority === 'high' ? '●'
    : anomaly.priority === 'normal' ? '●'
    : '○'
  const prioColor =
    anomaly.priority === 'high' ? colors.red
    : anomaly.priority === 'normal' ? colors.org
    : colors.gry

  const dueLabel = anomaly.due_date
    ? format(new Date(`${anomaly.due_date}T00:00:00`), 'd MMM yyyy', { locale: fr })
    : null

  const unitHeader = [
    unitSerial ? `N°${unitSerial}` : null,
    unitFamilyLabel,
    unitSubtype,
  ]
    .filter(Boolean)
    .join(' · ')

  const locationLine = [
    unitZoneName ? `Zone ${unitZoneName}` : null,
    unitImplantation,
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <View
      style={{
        marginTop: 8,
        padding: 10,
        backgroundColor: prioBg,
        borderWidth: 0.5,
        borderStyle: 'solid',
        borderColor: prioBorder,
        borderRadius: 4,
        borderLeftWidth: 3,
        borderLeftColor: prioColor,
      }}
      wrap={false}
    >
      {/* Header : équipement + statut */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
        <Text style={{ fontSize: 10, fontFamily: 'Helvetica-Bold', color: colors.ink }}>
          <Text style={{ color: prioColor }}>{prioIcon} </Text>
          {unitHeader || 'Équipement'}
        </Text>
        <Text
          style={{
            fontSize: 7,
            fontFamily: 'Helvetica-Bold',
            color: prioColor,
            textTransform: 'uppercase',
            letterSpacing: 0.5,
          }}
        >
          {ANOMALY_STATUS_LABELS[anomaly.status]}
        </Text>
      </View>

      {/* Localisation */}
      {locationLine && (
        <Text style={{ fontSize: 8.5, color: colors.ink3, marginBottom: 3 }}>
          {locationLine}
        </Text>
      )}

      {/* Titre + description */}
      <Text style={{ fontSize: 9.5, color: colors.ink, marginTop: 3 }}>
        <Text style={{ fontFamily: 'Helvetica-Bold' }}>Anomalie : </Text>
        {anomaly.title}
      </Text>
      {anomaly.description && (
        <Text style={{ fontSize: 9, color: colors.ink2, marginTop: 2, fontStyle: 'italic' }}>
          {anomaly.description}
        </Text>
      )}

      {/* Meta ligne : action + priorité + échéance */}
      <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginTop: 5 }}>
        {anomaly.action && (
          <Text style={{ fontSize: 8, color: colors.ink2 }}>
            <Text style={{ fontFamily: 'Helvetica-Bold' }}>Action : </Text>
            {ANOMALY_ACTION_LABELS[anomaly.action]}
          </Text>
        )}
        <Text style={{ fontSize: 8, color: colors.ink2 }}>
          <Text style={{ fontFamily: 'Helvetica-Bold' }}>Priorité : </Text>
          {ANOMALY_PRIORITY_LABELS[anomaly.priority]}
        </Text>
        {dueLabel && (
          <Text style={{ fontSize: 8, color: colors.ink2 }}>
            <Text style={{ fontFamily: 'Helvetica-Bold' }}>Échéance : </Text>
            {dueLabel}
          </Text>
        )}
      </View>

      {/* Photos (jusqu'à 3) */}
      {anomaly.photos.length > 0 && (
        <View style={{ flexDirection: 'row', gap: 4, marginTop: 6 }}>
          {anomaly.photos.slice(0, 3).map((p, i) => (
            <Image
              key={`${p.path}-${i}`}
              src={p.url}
              style={{
                width: 60,
                height: 60,
                borderRadius: 3,
                objectFit: 'cover',
                borderWidth: 0.5,
                borderStyle: 'solid',
                borderColor: colors.border,
              }}
            />
          ))}
          {anomaly.photos.length > 3 && (
            <Text style={{ fontSize: 8, color: colors.ink3, alignSelf: 'center', marginLeft: 4 }}>
              + {anomaly.photos.length - 3}
            </Text>
          )}
        </View>
      )}
    </View>
  )
}

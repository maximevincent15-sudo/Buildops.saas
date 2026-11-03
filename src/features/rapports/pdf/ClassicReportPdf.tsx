import { Document, Image, Page, StyleSheet, Text, View } from '@react-pdf/renderer'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import { ANOMALY_ACTION_LABELS, ANOMALY_PRIORITY_LABELS } from '../../anomalies/schemas'
import { formatEquipmentTypes } from '../../../shared/constants/interventions'
import { PdfLogo } from '../../parametres/pdf/PdfLogo'
import type { ChecklistItem } from '../checklists'
import { RECOMMENDED_ACTION_LABEL, decodeChecklistId } from '../schemas'
import type { ChecklistResponse } from '../schemas'
import type { AnomalyPdfEntry, ReportPdfProps, UnitReportEntry } from './ReportPdf'

/**
 * Rapport d'intervention au format « compte rendu de vérification
 * classique » : entreprise et site, dates, conclusion générale, équipements
 * secteur par secteur (en état de fonctionner ou non), puis les annexes
 * (observations, non-conformités, photos). Mêmes données que le rapport
 * standard ; choisi dans Paramètres.
 */

type Props = ReportPdfProps & {
  /** Date de la vérification précédente du site (même type d'équipements) */
  previousVisitDate?: string | null
  /** Adresse du client, destinataire du compte rendu */
  clientAddress?: string | null
}

const ink = '#1C2130'
const ink2 = '#4A5163'
const ink3 = '#7A8091'
const line = '#C9CDD6'
const lineLight = '#E4E6EB'
const shade = '#F3F4F6'

const styles = StyleSheet.create({
  page: { paddingTop: 30, paddingBottom: 46, paddingHorizontal: 34, fontSize: 9, fontFamily: 'Helvetica', color: ink },
  topRow: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  box: { flexGrow: 1, flexBasis: '50%', borderWidth: 0.8, borderColor: line, borderStyle: 'solid', padding: 8 },
  boxLabel: { fontSize: 7, color: ink3, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 4 },
  boxStrong: { fontFamily: 'Helvetica-Bold', fontSize: 10, marginBottom: 2 },
  boxLine: { fontSize: 8.5, color: ink2, lineHeight: 1.35 },
  title: { fontFamily: 'Helvetica-Bold', fontSize: 15, textAlign: 'center', letterSpacing: 0.8, marginTop: 2 },
  subtitle: { fontSize: 9.5, textAlign: 'center', color: ink2, marginTop: 6, marginBottom: 12 },
  infoTable: { borderWidth: 0.8, borderColor: line, borderStyle: 'solid', marginBottom: 14 },
  infoRow: { flexDirection: 'row', borderBottomWidth: 0.5, borderBottomColor: lineLight, borderBottomStyle: 'solid' },
  infoKey: { width: '34%', padding: 5, backgroundColor: shade, fontSize: 8, color: ink2 },
  infoVal: { width: '66%', padding: 5, fontSize: 9, lineHeight: 1.3 },
  sectionTitle: { fontFamily: 'Helvetica-Bold', fontSize: 10.5, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6, marginTop: 4, paddingBottom: 3, borderBottomWidth: 1, borderBottomColor: ink, borderBottomStyle: 'solid' },
  section: { marginBottom: 14 },
  note: { fontSize: 8, color: ink2, marginBottom: 8, lineHeight: 1.3 },
  checkRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 5 },
  checkBox: { width: 10, height: 10, borderWidth: 0.9, borderColor: ink, borderStyle: 'solid', marginRight: 7, alignItems: 'center', justifyContent: 'center' },
  checkMark: { fontFamily: 'Helvetica-Bold', fontSize: 8, lineHeight: 1 },
  counts: { marginTop: 4, padding: 6, backgroundColor: shade, fontSize: 8.5, color: ink2, lineHeight: 1.3 },
  zoneTitle: { fontFamily: 'Helvetica-Bold', fontSize: 9, marginTop: 8, marginBottom: 3 },
  th: { flexDirection: 'row', backgroundColor: shade, borderWidth: 0.8, borderColor: line, borderStyle: 'solid' },
  thCell: { padding: 4, fontSize: 7.5, fontFamily: 'Helvetica-Bold', color: ink2 },
  // Lignes bordées une à une : un tableau coupé entre deux pages garde ses bords
  tr: { flexDirection: 'row', borderLeftWidth: 0.8, borderRightWidth: 0.8, borderBottomWidth: 0.8, borderColor: line, borderStyle: 'solid' },
  td: { padding: 4, fontSize: 8.5, lineHeight: 1.3 },
  annexItem: { marginBottom: 6, paddingLeft: 8, borderLeftWidth: 2, borderLeftColor: line, borderLeftStyle: 'solid' },
  annexHead: { fontFamily: 'Helvetica-Bold', fontSize: 9 },
  annexText: { fontSize: 8.5, color: ink2, lineHeight: 1.35 },
  empty: { fontSize: 8.5, color: ink3, fontStyle: 'italic' },
  photos: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 },
  photo: { width: 120, height: 90, objectFit: 'cover' },
  signRow: { flexDirection: 'row', gap: 10 },
  signBox: { flexGrow: 1, flexBasis: '50%', borderWidth: 0.8, borderColor: line, borderStyle: 'solid', padding: 8, minHeight: 80 },
  signImage: { height: 40, objectFit: 'contain', alignSelf: 'flex-start', marginTop: 4 },
  footer: { position: 'absolute', bottom: 18, left: 34, right: 34, fontSize: 7, color: ink3, textAlign: 'center', borderTopWidth: 0.5, borderTopColor: lineLight, borderTopStyle: 'solid', paddingTop: 4 },
})

// Polices standard du PDF : pas d'indices ni de coches Unicode
function pdfText(s: string | null | undefined): string {
  return (s ?? '')
    .replace(/[₀-₉]/g, (c) => String(c.charCodeAt(0) - 0x2080))
    .replace(/[✓✔]/g, 'X')
}

// Date illisible : null plutôt qu'une erreur qui empêcherait tout le PDF
function safeParseDate(input: string | null | undefined): Date | null {
  if (!input) return null
  const d = new Date(input)
  return Number.isNaN(d.getTime()) ? null : d
}

function frDate(d: string | null | undefined): string | null {
  const parsed = safeParseDate(d)
  return parsed ? format(parsed, 'dd/MM/yyyy', { locale: fr }) : null
}

/** « N°12 » pour un numéro simple, « EXT-03 » tel quel s'il a déjà un préfixe */
function unitNumber(serial: string): string {
  return /^\d+$/.test(serial.trim()) ? `N°${serial.trim()}` : serial.trim()
}

function designation(e: UnitReportEntry): string {
  return pdfText([e.familyLabel, e.subtype, e.brand, e.installYear ? String(e.installYear) : null].filter(Boolean).join(' · '))
}

const STATE_LABELS: Record<UnitReportEntry['verdict'], string> = {
  conforme: 'Oui',
  surveiller: 'Oui, à surveiller',
  reformer: 'Non, à réformer',
  non_verifie: 'Non vérifié',
}

type AnnexEntry = { head: string; text: string | null; photos: Array<{ url?: string }> }

function Checkbox({ checked, label }: { checked: boolean; label: string }) {
  return (
    <View style={styles.checkRow}>
      <View style={styles.checkBox}>{checked && <Text style={styles.checkMark}>X</Text>}</View>
      <Text style={{ fontSize: 9, fontFamily: checked ? 'Helvetica-Bold' : 'Helvetica' }}>{label}</Text>
    </View>
  )
}

function InfoRow({ k, v }: { k: string; v: string | null | undefined }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoKey}>{k}</Text>
      <Text style={styles.infoVal}>{pdfText(v) || '—'}</Text>
    </View>
  )
}

export function ClassicReportPdf({
  intervention, report, sections, organizationName,
  unitEntries = [], settings, anomalyEntries = [],
  interventionType, clientNumber, dossierNumber,
  previousVisitDate, clientAddress,
}: Props) {
  // ─── Entreprise et site ───
  const orgLines = [
    settings?.legal_address?.trim(),
    [settings?.legal_postal_code, settings?.legal_city].filter(Boolean).join(' ').trim(),
    [settings?.legal_phone?.trim() ? `Tél. ${settings.legal_phone.trim()}` : null, settings?.legal_email?.trim()].filter(Boolean).join(' · '),
    settings?.siret ? `SIRET ${settings.siret}` : null,
  ].filter((l): l is string => !!l)
  const siteAddress = [
    intervention.chantier_address?.trim(),
    [intervention.chantier_postal_code, intervention.chantier_city].filter(Boolean).join(' ').trim(),
  ].filter(Boolean).join(', ') || intervention.address?.trim() || null
  const siteContact = [intervention.chantier_contact_name?.trim(), intervention.chantier_contact_phone?.trim()].filter(Boolean).join(' · ')

  // ─── Dates : du jour prévu au jour de clôture ───
  const startLabel = frDate(intervention.scheduled_date) ?? frDate(report.completed_at)
  const endLabel = frDate(report.completed_at)
  const datesLabel = startLabel && endLabel && startLabel !== endLabel
    ? `du ${startLabel} au ${endLabel}`
    : startLabel ? `le ${startLabel}` : '—'
  const completedLabel = (() => {
    const d = safeParseDate(report.completed_at)
    return d ? format(d, "d MMMM yyyy 'à' HH:mm", { locale: fr }) : '—'
  })()

  // ─── Équipements ───
  const verdictBySerial = new Map(unitEntries.map((e) => [e.unitSerial, e.verdict]))
  const counts = {
    total: unitEntries.length,
    ok: unitEntries.filter((e) => e.verdict === 'conforme').length,
    watch: unitEntries.filter((e) => e.verdict === 'surveiller').length,
    out: unitEntries.filter((e) => e.verdict === 'reformer').length,
    notVerified: unitEntries.filter((e) => e.verdict === 'non_verifie').length,
  }
  const zones: Array<{ key: string; label: string; entries: UnitReportEntry[] }> = []
  for (const e of unitEntries) {
    const label = [e.parentZone, e.zoneName].filter(Boolean).join(' › ') || 'Sans secteur'
    const zone = zones.find((z) => z.key === label)
    if (zone) zone.entries.push(e)
    else zones.push({ key: label, label, entries: [e] })
  }

  // ─── Points de contrôle (checklists par type) ───
  const checklistTables = sections
    .map((sec) => {
      const rows = (sec.items.length > 0 ? sec.items : sec.responses).map((it) => {
        const r = sec.items.length > 0
          ? sec.responses.find((x) => x.id === (it as ChecklistItem).id)
          : (it as ChecklistResponse)
        const label = sec.items.length > 0 ? (it as ChecklistItem).label : decodeChecklistId((it as ChecklistResponse).id)[1]
        return { label, r }
      })
      return { label: sec.label, rows }
    })
    .filter((t) => t.rows.some((x) => x.r?.value))

  // ─── Annexes : observations (1) et non-conformités (2) ───
  const annex1: AnnexEntry[] = []
  const annex2: AnnexEntry[] = []
  let blocking = false
  if (report.observations?.trim()) annex1.push({ head: 'Observations générales', text: report.observations.trim(), photos: [] })
  const unitRef = (a: AnomalyPdfEntry) => [
    a.unitSerial ? unitNumber(a.unitSerial) : null,
    a.unitFamilyLabel,
    a.unitSubtype,
    [a.unitZoneName, a.unitImplantation].filter(Boolean).join(', ') || null,
  ].filter(Boolean).join(' · ')
  for (const a of anomalyEntries) {
    const an = a.anomaly
    const details = [
      an.description?.trim(),
      an.action ? `Action : ${ANOMALY_ACTION_LABELS[an.action]}` : null,
      `Priorité : ${ANOMALY_PRIORITY_LABELS[an.priority]}`,
      frDate(an.due_date) ? `À traiter avant le ${frDate(an.due_date)}` : null,
    ].filter(Boolean).join(' · ')
    const entry = { head: pdfText([unitRef(a), an.title].filter(Boolean).join(' — ')), text: pdfText(details), photos: an.photos ?? [] }
    // Équipement « à surveiller » : observation ; le reste : non-conformité
    if (a.unitSerial && verdictBySerial.get(a.unitSerial) === 'surveiller') annex1.push(entry)
    else {
      annex2.push(entry)
      if (an.priority === 'high') blocking = true
    }
  }
  const withAnomaly = new Set(anomalyEntries.map((a) => a.unitSerial).filter(Boolean))
  for (const e of unitEntries) {
    if (withAnomaly.has(e.unitSerial)) continue
    const head = pdfText([unitNumber(e.unitSerial), designation(e), e.implantation].filter(Boolean).join(' — '))
    if (e.verdict === 'reformer') annex2.push({ head, text: pdfText(e.observation) || 'À réformer', photos: [] })
    else if (e.verdict === 'surveiller' || (e.verdict === 'conforme' && e.observation?.trim())) {
      annex1.push({ head, text: pdfText(e.observation) || 'À surveiller', photos: [] })
    }
  }
  if (counts.out > 0) blocking = true
  for (const t of checklistTables) {
    for (const { label, r } of t.rows) {
      if (r?.value !== 'nok') continue
      annex2.push({
        head: pdfText(`${t.label} — ${label}`),
        text: pdfText([r.note, r.action ? `Action : ${RECOMMENDED_ACTION_LABEL[r.action]}` : null].filter(Boolean).join(' · ')) || null,
        photos: r.photos ?? [],
      })
    }
  }
  const noRemark = annex1.length === 0 && annex2.length === 0 && counts.notVerified === 0
  const generalPhotos = (report.photos ?? []).filter((p) => p.url)

  return (
    <Document title={`Rapport de vérification ${intervention.reference}`} author={organizationName}>
      <Page size="A4" style={styles.page}>
        {/* Entreprise vérificatrice et site visité */}
        <View style={styles.topRow}>
          <View style={styles.box}>
            <Text style={styles.boxLabel}>Entreprise vérificatrice</Text>
            <PdfLogo url={settings?.logo_url} height={30} />
            <Text style={styles.boxStrong}>{pdfText(organizationName)}</Text>
            {orgLines.map((l) => <Text key={l} style={styles.boxLine}>{pdfText(l)}</Text>)}
          </View>
          <View style={styles.box}>
            <Text style={styles.boxLabel}>Site vérifié</Text>
            <Text style={styles.boxStrong}>{pdfText(intervention.site_name) || pdfText(intervention.client_name)}</Text>
            {siteAddress && <Text style={styles.boxLine}>{pdfText(siteAddress)}</Text>}
            {siteContact && <Text style={styles.boxLine}>Contact sur site : {pdfText(siteContact)}</Text>}
            <Text style={[styles.boxLine, { marginTop: 4 }]}>Client : {pdfText(intervention.client_name)}</Text>
          </View>
        </View>

        <Text style={styles.title}>RAPPORT DE VÉRIFICATION</Text>
        <Text style={styles.subtitle}>{pdfText(formatEquipmentTypes(intervention.equipment_types))}</Text>

        <View style={styles.infoTable}>
          <InfoRow k="N° de rapport" v={intervention.reference} />
          {dossierNumber ? <InfoRow k="N° de dossier" v={dossierNumber} /> : null}
          {clientNumber ? <InfoRow k="N° client" v={clientNumber} /> : null}
          <InfoRow k="Date(s) de la vérification" v={datesLabel} />
          <InfoRow k="Vérification précédente" v={frDate(previousVisitDate) ? `le ${frDate(previousVisitDate)}` : null} />
          <InfoRow k="Vérificateur" v={intervention.technician_name} />
          {interventionType ? <InfoRow k="Nature de l'intervention" v={interventionType} /> : null}
        </View>

        {/* I. Conclusion générale */}
        <View style={styles.section} wrap={false}>
          <Text style={styles.sectionTitle}>I. Conclusion générale</Text>
          <Text style={styles.note}>
            Les observations et améliorations proposées figurent en annexe 1, les non-conformités en annexe 2.
          </Text>
          <Checkbox checked={noRemark} label="Aucune remarque : équipements en état de fonctionner" />
          <Checkbox checked={annex1.length > 0} label="Observations ou améliorations proposées (voir annexe 1)" />
          <Checkbox checked={annex2.length > 0} label="Non-conformités à corriger (voir annexe 2)" />
          <Checkbox checked={blocking} label="Non-conformités pouvant empêcher le fonctionnement (voir annexe 2)" />
          {counts.total > 0 && (
            <Text style={styles.counts}>
              {counts.total} équipement{counts.total > 1 ? 's' : ''} prévu{counts.total > 1 ? 's' : ''} : {counts.ok} en état de fonctionner
              {counts.watch > 0 ? `, ${counts.watch} à surveiller` : ''}
              {counts.out > 0 ? `, ${counts.out} à réformer` : ''}
              {counts.notVerified > 0 ? `, ${counts.notVerified} non vérifié${counts.notVerified > 1 ? 's' : ''} lors de cette visite` : ''}.
            </Text>
          )}
        </View>

        {/* II. Équipements, secteur par secteur */}
        {zones.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>II. Caractéristiques des équipements</Text>
            <Text style={styles.note}>Secteur par secteur : les équipements décrits sont-ils en état de fonctionner ?</Text>
            {zones.map((z) => (
              <View key={z.key}>
                {/* Le titre du secteur et l'en-tête du tableau ne restent jamais seuls en bas de page */}
                <View wrap={false} minPresenceAhead={30}>
                  <Text style={styles.zoneTitle}>{pdfText(z.label)}</Text>
                  <View style={styles.th}>
                    <Text style={[styles.thCell, { width: '11%' }]}>N°</Text>
                    <Text style={[styles.thCell, { width: '33%' }]}>Désignation</Text>
                    <Text style={[styles.thCell, { width: '20%' }]}>Emplacement</Text>
                    <Text style={[styles.thCell, { width: '14%' }]}>En état ?</Text>
                    <Text style={[styles.thCell, { width: '22%' }]}>Observation</Text>
                  </View>
                </View>
                <View>
                  {z.entries.map((e, i) => (
                    <View key={`${e.unitSerial}-${i}`} style={styles.tr} wrap={false}>
                      <Text style={[styles.td, { width: '11%', fontFamily: 'Helvetica-Bold' }]}>{pdfText(unitNumber(e.unitSerial))}</Text>
                      <Text style={[styles.td, { width: '33%' }]}>{designation(e)}</Text>
                      <Text style={[styles.td, { width: '20%' }]}>{pdfText(e.implantation) || '—'}</Text>
                      <Text style={[styles.td, { width: '14%', fontFamily: e.verdict === 'conforme' ? 'Helvetica' : 'Helvetica-Bold' }]}>{STATE_LABELS[e.verdict]}</Text>
                      <Text style={[styles.td, { width: '22%', color: ink2 }]}>{pdfText(e.observation) || ''}</Text>
                    </View>
                  ))}
                </View>
              </View>
            ))}
          </View>
        )}

        {/* Points de contrôle par type */}
        {checklistTables.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{zones.length > 0 ? 'III.' : 'II.'} Points de contrôle</Text>
            {checklistTables.map((t) => (
              <View key={t.label} style={{ marginBottom: 6 }}>
                <Text style={styles.zoneTitle} minPresenceAhead={30}>{pdfText(t.label)}</Text>
                <View style={{ borderTopWidth: 0.8, borderTopColor: line, borderTopStyle: 'solid' }}>
                  {t.rows.map(({ label, r }, i) => (
                    <View key={`${label}-${i}`} style={styles.tr} wrap={false}>
                      <Text style={[styles.td, { width: '78%' }]}>{pdfText(label)}</Text>
                      <Text style={[styles.td, { width: '22%', fontFamily: r?.value === 'nok' ? 'Helvetica-Bold' : 'Helvetica' }]}>
                        {r?.value === 'ok' ? 'Satisfaisant' : r?.value === 'nok' ? 'Non satisfaisant' : r?.value === 'na' ? 'Sans objet' : '—'}
                      </Text>
                    </View>
                  ))}
                </View>
              </View>
            ))}
          </View>
        )}

        {/* Annexe 1 */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Annexe 1 — Observations ou améliorations proposées</Text>
          {annex1.length === 0
            ? <Text style={styles.empty}>Aucune observation.</Text>
            : annex1.map((a, i) => <AnnexBlock key={`a1-${i}`} entry={a} />)}
        </View>

        {/* Annexe 2 */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Annexe 2 — Non-conformités</Text>
          {annex2.length === 0
            ? <Text style={styles.empty}>Aucune non-conformité.</Text>
            : annex2.map((a, i) => <AnnexBlock key={`a2-${i}`} entry={a} />)}
        </View>

        {generalPhotos.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Annexe 3 — Photos</Text>
            <View style={styles.photos}>
              {generalPhotos.map((p, i) => <Image key={`ph-${i}`} src={p.url} style={styles.photo} />)}
            </View>
          </View>
        )}

        {/* Envoi et signatures */}
        <View style={styles.section} wrap={false}>
          <Text style={styles.sectionTitle}>Envoi du compte rendu</Text>
          <View style={styles.infoTable}>
            <InfoRow k="Date" v={frDate(report.completed_at)} />
            <InfoRow k="Destinataire" v={[intervention.client_name, clientAddress?.trim()].filter(Boolean).join(' — ')} />
          </View>
          <View style={styles.signRow}>
            <View style={styles.signBox}>
              <Text style={styles.boxLabel}>Le vérificateur</Text>
              <Text style={styles.boxStrong}>{pdfText(intervention.technician_name) || '—'}</Text>
              <Text style={styles.boxLine}>{pdfText(organizationName)}</Text>
              <Text style={[styles.boxLine, { marginTop: 4 }]}>Rapport clos le {completedLabel}</Text>
            </View>
            <View style={styles.signBox}>
              <Text style={styles.boxLabel}>Le représentant du client</Text>
              {report.signed_by_name ? <Text style={styles.boxStrong}>{pdfText(report.signed_by_name)}</Text> : null}
              {report.signature_data_url
                ? <Image src={report.signature_data_url} style={styles.signImage} />
                : <Text style={styles.boxLine}>{CLIENT_STATUS_LABELS[report.signature_status ?? 'pending'] ?? 'Non signé'}</Text>}
              {report.signature_note ? <Text style={[styles.boxLine, { marginTop: 4 }]}>{pdfText(report.signature_note)}</Text> : null}
            </View>
          </View>
        </View>

        <Text
          style={styles.footer}
          fixed
          render={({ pageNumber, totalPages }) =>
            `${pdfText(organizationName)} — Rapport de vérification ${intervention.reference} — page ${pageNumber} / ${totalPages}`}
        />
      </Page>
    </Document>
  )
}

const CLIENT_STATUS_LABELS: Record<string, string> = {
  pending: 'Non signé',
  signed: 'Signé',
  client_absent: 'Client absent lors de la visite',
  client_refused: 'Le client a refusé de signer',
  not_required: 'Signature non requise',
}

function AnnexBlock({ entry }: { entry: AnnexEntry }) {
  const photos = entry.photos.filter((p) => p.url).slice(0, 3)
  return (
    <View style={styles.annexItem} wrap={false}>
      <Text style={styles.annexHead}>{entry.head}</Text>
      {entry.text ? <Text style={styles.annexText}>{entry.text}</Text> : null}
      {photos.length > 0 && (
        <View style={styles.photos}>
          {photos.map((p, i) => <Image key={i} src={p.url!} style={{ width: 90, height: 68, objectFit: 'cover' }} />)}
        </View>
      )}
    </View>
  )
}

import { Document, Image, Page, StyleSheet, Text, View } from '@react-pdf/renderer'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import { ANOMALY_ACTION_LABELS, ANOMALY_PRIORITY_LABELS } from '../../anomalies/schemas'
import { formatEquipmentTypes } from '../../../shared/constants/interventions'
import { EQUIPMENT_FAMILIES } from '../../equipment/schemas'
import { PdfLogo } from '../../parametres/pdf/PdfLogo'
import { computeConformity } from '../conformity'
import { RECOMMENDED_ACTION_LABEL } from '../schemas'
import type { ChecklistResponse } from '../schemas'
import { ReportPdf } from './ReportPdf'
import type { ReportPdfProps, UnitReportEntry } from './ReportPdf'
import { pdfSafe } from './pdfText'

/**
 * Rapport compact : la page 1 dit tout (résultat, points à traiter avec
 * échéance, résumé par famille, signatures) ; la liste complète des
 * équipements et les photos passent en annexes. Les rapports sans contrôle
 * appareil par appareil (anciens rapports) gardent la mise en page standard.
 */

const c = {
  ink: '#1C2130', ink2: '#5A6070', ink3: '#9AA0AE', acc: '#3A5CA8',
  grn: '#2E7D5E', grnLt: '#E3F2EC', red: '#A83A3A', redLt: '#F6E3E3',
  org: '#C45A1A', orgLt: '#FBEBDD', gry: '#6B7A8D', gryLt: '#EEF0F4',
  border: '#E3E6EB', bg: '#F6F7F9',
}

const s = StyleSheet.create({
  page: { paddingTop: 30, paddingHorizontal: 34, paddingBottom: 44, fontFamily: 'Helvetica', fontSize: 9, color: c.ink },
  h2: { fontSize: 8, fontFamily: 'Helvetica-Bold', color: c.acc, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 5 },
  small: { fontSize: 7.5, color: c.ink3 },
  footer: { position: 'absolute', bottom: 18, left: 34, right: 34, fontSize: 7, color: c.ink3, flexDirection: 'row', justifyContent: 'space-between' },
  th: { fontSize: 6.8, fontFamily: 'Helvetica-Bold', color: c.ink3, textTransform: 'uppercase', letterSpacing: 0.4 },
  row: { flexDirection: 'row', borderBottomWidth: 0.5, borderBottomStyle: 'solid', borderBottomColor: c.border, paddingVertical: 3.5 },
})

function safeDate(input: string | null | undefined): Date | null {
  if (!input) return null
  const d = new Date(input.length <= 10 ? `${input}T12:00:00` : input)
  return Number.isNaN(d.getTime()) ? null : d
}
const fmt = (input: string | null | undefined, pattern: string) => {
  const d = safeDate(input)
  return d ? format(d, pattern, { locale: fr }) : null
}

type TodoRow = { priority: 'high' | 'normal' | 'low'; what: string; where: string | null; problem: string; detail: string | null; action: string; due: string | null }

const PRIORITY_STYLE: Record<TodoRow['priority'], { fg: string; bg: string }> = {
  high: { fg: c.red, bg: c.redLt },
  normal: { fg: c.org, bg: c.orgLt },
  low: { fg: c.gry, bg: c.gryLt },
}

const VERDICT_FG: Record<UnitReportEntry['verdict'], string> = { conforme: c.grn, surveiller: c.org, reformer: c.red, non_verifie: c.gry }

function familyGroups(entries: UnitReportEntry[]) {
  const groups = new Map<string, { key: string; label: string; entries: UnitReportEntry[] }>()
  for (const e of entries) {
    const key = e.family ?? e.familyLabel
    if (!groups.has(key)) groups.set(key, { key, label: e.familyLabel, entries: [] })
    groups.get(key)!.entries.push(e)
  }
  const rank = (k: string) => { const i = (EQUIPMENT_FAMILIES as readonly string[]).indexOf(k); return i === -1 ? 99 : i }
  return [...groups.values()].sort((a, b) => rank(a.key) - rank(b.key) || a.label.localeCompare(b.label, 'fr'))
}

const zoneLine = (e: { zoneName: string | null; parentZone: string | null; implantation: string | null }) =>
  [e.parentZone, e.zoneName, e.implantation].filter(Boolean).join(' · ') || null

/** Points vérifiés sur les points applicables, « — » si le verdict a été posé sans cocher */
function pointsText(e: UnitReportEntry): string {
  const na = e.naItems?.length ?? 0
  return e.totalItems && (e.checkedCount ?? 0) > 0 ? `${(e.checkedCount ?? 0) - na}/${e.totalItems - na}` : '—'
}

/** Rapport compact (contrôles appareil par appareil) ; sinon la mise en page standard */
export function CompactReportPdf(props: ReportPdfProps) {
  if (!(props.unitEntries ?? []).some((e) => e.verdict !== 'non_verifie')) return <ReportPdf {...props} />
  return <CompactContent {...pdfSafe(props)} />
}

function CompactContent({
  intervention, report, sections, organizationName, unitEntries = [], settings, anomalyEntries = [],
  interventionType, nextInterventionDate, clientNumber, dossierNumber,
}: ReportPdfProps) {
  // ─── Résultat global : même calcul que l'écran, le mail et le portail ───
  let answered = 0
  let total = 0
  const siteNok: Array<{ section: string; r: ChecklistResponse; label: string }> = []
  for (const sec of sections) {
    total += sec.items.length || sec.responses.length
    for (const r of sec.responses) {
      if (r.value) answered++
      if (r.value === 'nok') siteNok.push({ section: sec.label, r, label: sec.items.find((it) => it.id === r.id)?.label ?? r.id })
    }
  }
  const conformity = computeConformity({ answered, total, nokCount: siteNok.length }, unitEntries.map((e) => e.verdict))
  const verified = unitEntries.filter((e) => e.verdict !== 'non_verifie')
  const notVerified = unitEntries.filter((e) => e.verdict === 'non_verifie')

  // ─── Points à traiter : anomalies enregistrées, puis verdicts sans anomalie, puis checklist du site ───
  const todo: TodoRow[] = []
  const withAnomaly = new Set<string>()
  for (const a of anomalyEntries) {
    if (a.anomaly.status === 'resolved' || a.anomaly.status === 'closed') continue
    if (a.unitSerial) withAnomaly.add(a.unitSerial)
    todo.push({
      priority: a.anomaly.priority,
      what: [a.unitSerial, a.unitFamilyLabel].filter(Boolean).join(' · ') || 'Site',
      where: [a.unitZoneName, a.unitImplantation].filter(Boolean).join(' · ') || null,
      problem: a.anomaly.title,
      detail: a.anomaly.description,
      action: a.anomaly.action ? ANOMALY_ACTION_LABELS[a.anomaly.action] : '—',
      due: fmt(a.anomaly.due_date, 'dd/MM/yyyy'),
    })
  }
  for (const e of verified) {
    if ((e.verdict !== 'surveiller' && e.verdict !== 'reformer') || withAnomaly.has(e.unitSerial)) continue
    todo.push({
      priority: e.verdict === 'reformer' ? 'high' : 'normal',
      what: `${e.unitSerial} · ${e.familyLabel}`,
      where: zoneLine(e),
      problem: e.observation ?? e.verdictLabel,
      detail: null,
      action: e.verdict === 'reformer' ? 'Remplacement' : 'À surveiller',
      due: null,
    })
  }
  for (const n of siteNok) {
    todo.push({
      priority: 'normal', what: `Site · ${n.section}`, where: null, problem: n.label, detail: n.r.note ?? null,
      action: n.r.action ? RECOMMENDED_ACTION_LABEL[n.r.action as keyof typeof RECOMMENDED_ACTION_LABEL] ?? '—' : '—', due: null,
    })
  }
  const order = { high: 0, normal: 1, low: 2 }
  todo.sort((a, b) => order[a.priority] - order[b.priority])

  const families = familyGroups(verified)
  const visitDate = fmt(report.completed_at ?? intervention.scheduled_date, 'd MMMM yyyy')
  const completedLabel = fmt(report.completed_at, "d MMMM yyyy 'à' HH:mm") ?? '—'
  const nextLabel = fmt(nextInterventionDate, 'd MMMM yyyy')
  const address = intervention.address || intervention.chantier_address || null
  const companyLines = [
    [settings?.legal_address, [settings?.legal_postal_code, settings?.legal_city].filter(Boolean).join(' ')].filter(Boolean).join(', '),
    [settings?.legal_phone, settings?.legal_email].filter(Boolean).join(' · '),
    [settings?.siret ? `SIRET ${settings.siret}` : null, settings?.vat_number ? `TVA ${settings.vat_number}` : null].filter(Boolean).join(' · '),
  ].filter(Boolean)

  const banner = conformity.isConform === true
    ? { label: 'CONFORME', sub: `${verified.length} équipement${verified.length > 1 ? 's' : ''} contrôlé${verified.length > 1 ? 's' : ''}, aucun point à traiter`, fg: c.grn, bg: c.grnLt }
    : conformity.isConform === false
      ? { label: 'NON CONFORME', sub: `${todo.length} point${todo.length > 1 ? 's' : ''} à traiter sur ${verified.length} équipement${verified.length > 1 ? 's' : ''} contrôlé${verified.length > 1 ? 's' : ''}`, fg: c.red, bg: c.redLt }
      : { label: 'INCOMPLET', sub: `${notVerified.length} équipement${notVerified.length > 1 ? 's' : ''} non vérifié${notVerified.length > 1 ? 's' : ''} sur ${unitEntries.length}`, fg: c.gry, bg: c.gryLt }

  const photos = [
    ...anomalyEntries.flatMap((a) => a.anomaly.photos.map((p) => ({ key: p.path, url: p.url, caption: `${a.unitSerial ? `${a.unitSerial} · ` : ''}${a.anomaly.title}` }))),
    ...report.photos.map((p, i) => ({ key: p.path, url: p.url, caption: `Photo du site ${i + 1}` })),
  ]
  const clientSigned = !!report.signature_data_url && (report.signature_status === 'signed' || report.signature_status === 'pending')
  // Petit site : la liste et les photos suivent sur la même page, sans saut de page
  const separatePages = verified.length > 15

  return (
    <Document title={`Rapport ${intervention.reference}`}>
      <Page size="A4" style={s.page}>
        {/* En-tête : entreprise à gauche, n° et date à droite */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', paddingBottom: 8, borderBottomWidth: 1, borderBottomStyle: 'solid', borderBottomColor: c.ink }}>
          <View style={{ flex: 1, paddingRight: 12 }}>
            <PdfLogo url={settings?.logo_url} height={30} />
            <Text style={{ fontSize: 12.5, fontFamily: 'Helvetica-Bold' }}>{organizationName}</Text>
            {companyLines.map((l, i) => <Text key={i} style={[s.small, { marginTop: 1.5, color: c.ink2 }]}>{l}</Text>)}
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={{ fontSize: 7, color: c.ink3, letterSpacing: 1, textTransform: 'uppercase' }}>Rapport de vérification</Text>
            <Text style={{ fontSize: 14, fontFamily: 'Helvetica-Bold', color: c.acc, marginTop: 2 }}>{intervention.reference}</Text>
            {visitDate && <Text style={{ fontSize: 8.5, color: c.ink2, marginTop: 2 }}>du {visitDate}</Text>}
          </View>
        </View>

        {/* Qui, où, quoi */}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', backgroundColor: c.bg, borderRadius: 4, paddingVertical: 6, paddingHorizontal: 8, marginTop: 8 }}>
          {[
            ['Client', intervention.client_name + (clientNumber ? ` (n° ${clientNumber})` : '')],
            ['Site', [intervention.site_name, address].filter(Boolean).join(' — ')],
            ['Technicien', intervention.technician_name ?? '—'],
            ['Intervention', [interventionType, dossierNumber ? `dossier ${dossierNumber}` : null].filter(Boolean).join(' · ') || '—'],
            ['Équipements', formatEquipmentTypes(intervention.equipment_types)],
            ['Prochaine visite', nextLabel ?? '—'],
          ].map(([k, v]) => (
            <View key={k} style={{ width: '50%', flexDirection: 'row', paddingVertical: 1.5, paddingRight: 6 }}>
              <Text style={{ width: 66, fontSize: 7.5, color: c.ink3 }}>{k}</Text>
              <Text style={{ flex: 1, fontSize: 8.5 }}>{v}</Text>
            </View>
          ))}
        </View>

        {/* Résultat */}
        <View style={{ marginTop: 10, borderRadius: 5, backgroundColor: banner.bg, borderLeftWidth: 4, borderLeftStyle: 'solid', borderLeftColor: banner.fg, paddingVertical: 9, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center' }}>
          <Text style={{ fontSize: 15, fontFamily: 'Helvetica-Bold', color: banner.fg, letterSpacing: 1 }}>{banner.label}</Text>
          <Text style={{ fontSize: 9.5, color: c.ink, marginLeft: 12, flex: 1 }}>{banner.sub}</Text>
        </View>

        {/* À traiter */}
        <View style={{ marginTop: 12 }}>
          <Text style={s.h2}>À traiter</Text>
          {todo.length === 0 ? (
            <Text style={{ fontSize: 9, color: c.grn }}>Aucun point à traiter.</Text>
          ) : (
            <View>
              <View style={[s.row, { paddingVertical: 2 }]}>
                <Text style={[s.th, { width: '11%' }]}>Priorité</Text>
                <Text style={[s.th, { width: '27%' }]}>Équipement</Text>
                <Text style={[s.th, { width: '36%' }]}>Constat</Text>
                <Text style={[s.th, { width: '14%' }]}>Action</Text>
                <Text style={[s.th, { width: '12%', textAlign: 'right' }]}>Avant le</Text>
              </View>
              {todo.map((t, i) => (
                <View key={i} style={s.row} wrap={false}>
                  <View style={{ width: '11%' }}>
                    <Text style={{ alignSelf: 'flex-start', fontSize: 7, fontFamily: 'Helvetica-Bold', color: PRIORITY_STYLE[t.priority].fg, backgroundColor: PRIORITY_STYLE[t.priority].bg, paddingVertical: 1.5, paddingHorizontal: 4, borderRadius: 2 }}>
                      {ANOMALY_PRIORITY_LABELS[t.priority]}
                    </Text>
                  </View>
                  <View style={{ width: '27%', paddingRight: 6 }}>
                    <Text style={{ fontSize: 8.5, fontFamily: 'Helvetica-Bold' }}>{t.what}</Text>
                    {t.where && <Text style={s.small}>{t.where}</Text>}
                  </View>
                  <View style={{ width: '36%', paddingRight: 6 }}>
                    <Text style={{ fontSize: 8.5 }}>{t.problem}</Text>
                    {t.detail && t.detail !== t.problem && <Text style={[s.small, { color: c.ink2 }]}>{t.detail}</Text>}
                  </View>
                  <Text style={{ width: '14%', fontSize: 8.5 }}>{t.action}</Text>
                  <Text style={{ width: '12%', fontSize: 8.5, textAlign: 'right', fontFamily: t.due ? 'Helvetica-Bold' : 'Helvetica' }}>{t.due ?? '—'}</Text>
                </View>
              ))}
            </View>
          )}
          {notVerified.length > 0 && (
            <Text style={{ fontSize: 8, color: c.org, marginTop: 5 }}>
              Non vérifiés ({notVerified.length}) : {notVerified.map((e) => `${e.unitSerial}${e.observation ? ` (${e.observation})` : ''}`).join(', ')}
            </Text>
          )}
        </View>

        {/* Résumé par famille */}
        <View style={{ marginTop: 12 }} wrap={false}>
          <Text style={s.h2}>Résumé par type d'équipement</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 5 }}>
            {families.map((g) => {
              const toTreat = g.entries.filter((e) => e.verdict === 'surveiller' || e.verdict === 'reformer').length
              const ok = g.entries.length - toTreat
              return (
                <View key={g.key} style={{ borderWidth: 0.5, borderStyle: 'solid', borderColor: toTreat ? c.org : c.border, borderRadius: 4, paddingVertical: 4, paddingHorizontal: 7, backgroundColor: toTreat ? c.orgLt : '#FFFFFF' }}>
                  <Text style={{ fontSize: 8, fontFamily: 'Helvetica-Bold' }}>{g.label}</Text>
                  <Text style={{ fontSize: 7.5, color: toTreat ? c.org : c.grn, marginTop: 1 }}>
                    {ok}/{g.entries.length} conforme{ok > 1 ? 's' : ''}{toTreat ? ` · ${toTreat} à traiter` : ''}
                  </Text>
                </View>
              )
            })}
          </View>
        </View>

        {/* Mot du technicien */}
        {(report.observations || report.conclusion) && (
          <View style={{ marginTop: 12 }}>
            <Text style={s.h2}>Observations du technicien</Text>
            {report.observations && <Text style={{ fontSize: 8.5, lineHeight: 1.4, color: c.ink }}>{report.observations}</Text>}
            {report.conclusion && (
              <Text style={{ fontSize: 8.5, lineHeight: 1.4, marginTop: 3 }}>
                <Text style={{ fontFamily: 'Helvetica-Bold' }}>Conclusion : </Text>{report.conclusion}
              </Text>
            )}
          </View>
        )}

        {/* Signatures */}
        <View style={{ marginTop: 12, flexDirection: 'row', gap: 10 }} wrap={false}>
          <View style={{ flex: 1, borderWidth: 0.5, borderStyle: 'solid', borderColor: c.border, borderRadius: 4, padding: 7 }}>
            <Text style={s.th}>Technicien</Text>
            <Text style={{ fontSize: 9, fontFamily: 'Helvetica-Bold', marginTop: 2 }}>{intervention.technician_name ?? '—'}</Text>
            <Text style={[s.small, { marginTop: 2 }]}>Signé électroniquement le {completedLabel}</Text>
          </View>
          {(clientSigned || report.signature_status === 'client_refused') && (
            <View style={{ flex: 1, borderWidth: 0.5, borderStyle: 'solid', borderColor: report.signature_status === 'client_refused' ? c.red : c.border, borderRadius: 4, padding: 7 }}>
              <Text style={s.th}>Client</Text>
              {report.signed_by_name && <Text style={{ fontSize: 9, fontFamily: 'Helvetica-Bold', marginTop: 2 }}>{report.signed_by_name}</Text>}
              {clientSigned
                ? <Image src={report.signature_data_url as string} style={{ height: 30, width: 110, objectFit: 'contain', marginTop: 2 }} />
                : <Text style={{ fontSize: 8, color: c.red, marginTop: 2 }}>Refus de signature{report.signature_note ? ` : ${report.signature_note}` : ''}</Text>}
            </View>
          )}
        </View>
        {report.signature_status === 'client_absent' && (
          <Text style={{ fontSize: 8, color: c.ink2, marginTop: 5 }}>
            Client absent lors de la visite{report.signature_note ? ` : ${report.signature_note}` : '.'}
          </Text>
        )}
        {clientSigned && (
          <Text style={[s.small, { marginTop: 5 }]}>La signature du client atteste de la prise de connaissance du présent rapport et de ses constats.</Text>
        )}

        {/* ─── Annexe 1 : tous les équipements contrôlés ─── */}
        <View break={separatePages} style={separatePages ? undefined : { marginTop: 16 }}>
          <Text style={[s.h2, { fontSize: 9 }]} minPresenceAhead={60}>Annexe 1 · Équipements contrôlés ({verified.length})</Text>
          <View style={[s.row, { paddingVertical: 2 }]} fixed>
            <Text style={[s.th, { width: '10%' }]}>N°</Text>
            <Text style={[s.th, { width: '27%' }]}>Emplacement</Text>
            <Text style={[s.th, { width: '33%' }]}>Type · marque · année</Text>
            <Text style={[s.th, { width: '8%' }]}>Points</Text>
            <Text style={[s.th, { width: '22%' }]}>Résultat</Text>
          </View>
          {families.map((g) => (
            <View key={g.key}>
              <Text style={{ fontSize: 8, fontFamily: 'Helvetica-Bold', color: c.ink2, marginTop: 6, marginBottom: 1 }} minPresenceAhead={30}>
                {g.label} ({g.entries.length})
              </Text>
              {g.entries.map((e, i) => {
                const extraOps = (e.operations ?? []).filter((op) => op !== 'Vérification')
                const unchecked = e.verdict !== 'non_verifie' && (e.checkedCount ?? 0) > 0 ? e.uncheckedItems?.length ?? 0 : 0
                const note = [e.observation, extraOps.length ? extraOps.join(', ') : null, unchecked ? `${unchecked} point${unchecked > 1 ? 's' : ''} non fait${unchecked > 1 ? 's' : ''}` : null].filter(Boolean).join(' · ')
                return (
                  <View key={`${e.unitSerial}-${i}`} style={[s.row, { paddingVertical: 2.5 }]} wrap={false}>
                    <Text style={{ width: '10%', fontSize: 7.8, fontFamily: 'Helvetica-Bold' }}>{e.unitSerial}</Text>
                    <Text style={{ width: '27%', fontSize: 7.8, paddingRight: 4 }}>{zoneLine(e) ?? '—'}</Text>
                    <Text style={{ width: '33%', fontSize: 7.8, paddingRight: 4 }}>{[e.subtype ?? e.familyLabel, e.brand, e.installYear].filter(Boolean).join(' · ')}</Text>
                    <Text style={{ width: '8%', fontSize: 7.8 }}>{pointsText(e)}</Text>
                    <View style={{ width: '22%' }}>
                      <Text style={{ fontSize: 7.8, fontFamily: 'Helvetica-Bold', color: VERDICT_FG[e.verdict] }}>{e.verdictLabel}</Text>
                      {note && <Text style={{ fontSize: 6.8, color: c.ink2 }}>{note}</Text>}
                    </View>
                  </View>
                )
              })}
            </View>
          ))}
        </View>

        {/* ─── Annexe 2 : photos et constats ─── */}
        {(photos.length > 0 || report.nonconformities) && (
          // Peu de photos : l'annexe reste d'un seul bloc (titre et photos ensemble)
          <View break={separatePages} wrap={photos.length > 4} style={separatePages ? undefined : { marginTop: 16 }}>
            <Text style={[s.h2, { fontSize: 9 }]}>Annexe 2 · Photos et constats</Text>
            {report.nonconformities && (
              <Text style={{ fontSize: 8.5, lineHeight: 1.4, marginBottom: 8 }}>
                <Text style={{ fontFamily: 'Helvetica-Bold' }}>Non-conformités constatées : </Text>{report.nonconformities}
              </Text>
            )}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' }}>
              {photos.map((p) => (
                <View key={p.key} style={{ width: '48.5%', marginBottom: 10 }} wrap={false}>
                  <Image src={p.url} style={{ width: '100%', height: 170, objectFit: 'cover', borderRadius: 3 }} />
                  <Text style={{ fontSize: 7.8, color: c.ink2, marginTop: 3 }}>{p.caption}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        <View style={s.footer} fixed>
          <Text>{organizationName} · Rapport {intervention.reference} · {intervention.site_name ?? intervention.client_name}</Text>
          <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber}/${totalPages} · Généré avec Firovia`} />
        </View>
      </Page>
    </Document>
  )
}

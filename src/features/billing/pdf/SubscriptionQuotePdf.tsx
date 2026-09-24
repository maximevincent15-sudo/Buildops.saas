import { Document, Page, StyleSheet, Text, View } from '@react-pdf/renderer'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import { formatCompanyNumber } from '../../clients/companyLookup'
import { CGV_URL, CGV_VERSION, FIROVIA_ISSUER, PLAN_OFFERS, computeYearlySavings } from '../constants'
import type { BillingPeriod, PlanOffer } from '../schemas'

/**
 * Devis d'abonnement Firovia généré en libre-service depuis /abonnement.
 * Émetteur : Firovia (Maxime Vincent EI). Client : l'organisation connectée.
 */

export type SubscriptionQuoteData = {
  reference: string
  issuedAt: Date
  validUntil: Date
  offer: PlanOffer
  period: BillingPeriod
  client: {
    name: string
    siret: string | null
    address: string | null
    contactName: string | null
    contactEmail: string | null
  }
}

const c = {
  ink: '#1C2130',
  ink2: '#5A6070',
  ink3: '#9AA0AE',
  acc: '#3A5CA8',
  border: '#E6E8EC',
  bg: '#F4F6F9',
  green: '#0E7A3F',
}

const s = StyleSheet.create({
  page: { padding: 34, paddingBottom: 56, fontFamily: 'Helvetica', fontSize: 9.5, color: c.ink, lineHeight: 1.35 },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start',
    paddingBottom: 12, marginBottom: 14, borderBottomWidth: 1, borderBottomStyle: 'solid', borderBottomColor: c.ink,
  },
  brand: { fontSize: 22, fontFamily: 'Helvetica-Bold', lineHeight: 1.1, marginBottom: 6 },
  brandAcc: { color: c.acc },
  issuerLine: { fontSize: 8.5, color: c.ink2 },
  docTitle: { fontSize: 20, fontFamily: 'Helvetica-Bold', textAlign: 'right', lineHeight: 1.1, marginBottom: 6 },
  docMeta: { fontSize: 9, color: c.ink2, textAlign: 'right' },
  blockLabel: { fontSize: 8, color: c.ink3, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 4 },
  clientBox: { backgroundColor: c.bg, borderRadius: 6, padding: 10, marginBottom: 14, width: '55%', alignSelf: 'flex-end' },
  clientName: { fontSize: 11, fontFamily: 'Helvetica-Bold', marginBottom: 2 },
  line: { color: c.ink2 },
  tableHead: {
    flexDirection: 'row', backgroundColor: c.ink, color: '#fff', paddingVertical: 6, paddingHorizontal: 8,
    fontFamily: 'Helvetica-Bold', fontSize: 8.5,
  },
  tableRow: { flexDirection: 'row', paddingVertical: 8, paddingHorizontal: 8, borderBottomWidth: 1, borderBottomStyle: 'solid', borderBottomColor: c.border },
  colDesc: { flex: 1, paddingRight: 8 },
  colQty: { width: 50, textAlign: 'center' },
  colPu: { width: 80, textAlign: 'right' },
  colTotal: { width: 80, textAlign: 'right' },
  descTitle: { fontFamily: 'Helvetica-Bold', marginBottom: 2 },
  descSub: { fontSize: 8.5, color: c.ink2 },
  totals: { marginTop: 6, marginLeft: 'auto', width: 260 },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 },
  totalFinal: {
    flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, paddingHorizontal: 8, marginTop: 4,
    backgroundColor: c.acc, color: '#fff', fontFamily: 'Helvetica-Bold', fontSize: 11, borderRadius: 4,
  },
  section: { marginTop: 10 },
  sectionTitle: { fontSize: 10, fontFamily: 'Helvetica-Bold', marginBottom: 6 },
  featureGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  feature: { flexDirection: 'row', marginBottom: 2, width: '50%', paddingRight: 8 },
  check: { color: c.green, width: 12, fontFamily: 'Helvetica-Bold' },
  bullet: { flexDirection: 'row', marginBottom: 2, color: c.ink2, fontSize: 8.5 },
  dot: { width: 10 },
  signRow: { flexDirection: 'row', marginTop: 12, gap: 16 },
  signBox: { flex: 1, borderWidth: 1, borderStyle: 'solid', borderColor: c.border, borderRadius: 6, padding: 10, height: 76 },
  signHint: { fontSize: 8, color: c.ink3 },
  footer: {
    position: 'absolute', bottom: 22, left: 34, right: 34, fontSize: 7.5, color: c.ink3, textAlign: 'center',
    borderTopWidth: 1, borderTopStyle: 'solid', borderTopColor: c.border, paddingTop: 6,
  },
})

function eur(n: number): string {
  return `${n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).replace(/[\u202f\u00a0]/g, ' ')} €`
}

/** Fonctionnalités complètes de la formule (Pro = Starter + Pro, sans les lignes de liaison). */
function fullFeatures(offer: PlanOffer): string[] {
  const own = offer.features.filter((f) => !/^Tout le plan/i.test(f))
  if (offer.plan !== 'pro') return own
  const starter = PLAN_OFFERS.find((o) => o.plan === 'starter')?.features ?? []
  return [...own, ...starter.filter((f) => !/techniciens$/i.test(f) && f !== 'Support email')]
}

export function SubscriptionQuotePdf({ data }: { data: SubscriptionQuoteData }) {
  const { offer, period, client } = data
  const price = offer.prices[period]
  const yearly = period === 'yearly'
  const savings = yearly ? computeYearlySavings(offer) : 0
  const fmt = (d: Date) => format(d, 'd MMMM yyyy', { locale: fr })

  return (
    <Document title={`Devis ${data.reference} — Firovia`} author="Firovia">
      <Page size="A4" style={s.page}>
        {/* En-tête */}
        <View style={s.header}>
          <View>
            <Text style={s.brand}><Text style={s.brandAcc}>Fir</Text>ovia</Text>
            <Text style={s.issuerLine}>{FIROVIA_ISSUER.legalName}</Text>
            <Text style={s.issuerLine}>{FIROVIA_ISSUER.address}</Text>
            <Text style={s.issuerLine}>SIRET {FIROVIA_ISSUER.siret} · {FIROVIA_ISSUER.email}</Text>
            <Text style={s.issuerLine}>{FIROVIA_ISSUER.vatMention}</Text>
          </View>
          <View>
            <Text style={s.docTitle}>DEVIS</Text>
            <Text style={s.docMeta}>{data.reference}</Text>
            <Text style={s.docMeta}>Émis le {fmt(data.issuedAt)}</Text>
            <Text style={s.docMeta}>Valable jusqu'au {fmt(data.validUntil)}</Text>
          </View>
        </View>

        {/* Client */}
        <View style={s.clientBox}>
          <Text style={s.blockLabel}>Client</Text>
          <Text style={s.clientName}>{client.name}</Text>
          {client.siret && <Text style={s.line}>SIRET {formatCompanyNumber(client.siret)}</Text>}
          {client.address && <Text style={s.line}>{client.address}</Text>}
          {client.contactName && <Text style={s.line}>À l'attention de {client.contactName}</Text>}
          {client.contactEmail && <Text style={s.line}>{client.contactEmail}</Text>}
        </View>

        {/* Détail */}
        <View style={s.tableHead}>
          <Text style={s.colDesc}>Description</Text>
          <Text style={s.colQty}>Qté</Text>
          <Text style={s.colPu}>PU HT</Text>
          <Text style={s.colTotal}>Total HT</Text>
        </View>
        <View style={s.tableRow}>
          <View style={s.colDesc}>
            <Text style={s.descTitle}>
              Abonnement Firovia — Formule {offer.label} ({offer.tagline.replace(/^Pour les PME de /i, '').replace(/^Pour /i, '')})
            </Text>
            <Text style={s.descSub}>
              {yearly
                ? `Période de 12 mois, payable d'avance. Économie de ${eur(savings)} HT par rapport à la formule mensuelle.`
                : `Abonnement mensuel payable d'avance, sans durée minimale. Soit ${eur(price.amount * 12)} HT sur 12 mois.`}
            </Text>
          </View>
          <Text style={s.colQty}>{yearly ? '1 an' : '1 mois'}</Text>
          <Text style={s.colPu}>{eur(price.amount)}</Text>
          <Text style={s.colTotal}>{eur(price.amount)}</Text>
        </View>

        <View style={s.totals}>
          <View style={s.totalRow}>
            <Text>Total HT</Text>
            <Text>{eur(price.amount)}</Text>
          </View>
          <View style={s.totalRow}>
            <Text style={{ color: c.ink2 }}>TVA (non applicable, art. 293 B du CGI)</Text>
            <Text style={{ color: c.ink2 }}>{eur(0)}</Text>
          </View>
          <View style={s.totalFinal}>
            <Text>{yearly ? 'Total à régler (12 mois)' : 'Total à régler par mois'}</Text>
            <Text>{eur(price.amount)}</Text>
          </View>
        </View>

        {/* Contenu de l'offre */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>Cette offre inclut</Text>
          <View style={s.featureGrid}>
          {fullFeatures(offer).map((f) => (
            <View key={f} style={s.feature}>
              <Text style={s.check}>•</Text>
              <Text>{f}</Text>
            </View>
          ))}
          <View style={s.feature}>
            <Text style={s.check}>•</Text>
            <Text>Mises à jour et sauvegardes quotidiennes incluses</Text>
          </View>
          </View>
        </View>

        {/* Conditions */}
        <View style={s.section} wrap={false}>
          <Text style={s.sectionTitle}>Conditions</Text>
          {[
            `Devis valable 30 jours, jusqu'au ${fmt(data.validUntil)}.`,
            yearly
              ? "Abonnement annuel payable d'avance, renouvelé tacitement pour 12 mois sauf résiliation avant l'échéance (rappel envoyé 30 jours avant)."
              : "Abonnement mensuel payable d'avance, renouvelé tacitement chaque mois, résiliable à tout moment (effet à la fin du mois en cours).",
            "Paiement par carte bancaire en ligne depuis l'espace Abonnement de Firovia (app.firovia.fr/abonnement), ou par virement à réception de facture sur demande.",
            'Retard de paiement : pénalités au taux de la BCE majoré de 10 points et indemnité forfaitaire de 40 € pour frais de recouvrement. Pas d\'escompte pour paiement anticipé.',
            `Offre soumise aux Conditions Générales de Vente de Firovia (version du ${CGV_VERSION.split('-').reverse().join('/')}), incluant l'accord de traitement des données (RGPD) : ${CGV_URL.replace('https://', '')}`,
          ].map((t) => (
            <View key={t} style={s.bullet}>
              <Text style={s.dot}>•</Text>
              <Text style={{ flex: 1 }}>{t}</Text>
            </View>
          ))}
        </View>

        {/* Bon pour accord */}
        <View style={s.signRow} wrap={false}>
          <View style={s.signBox}>
            <Text style={s.blockLabel}>Pour Firovia</Text>
            <Text>{FIROVIA_ISSUER.signatory}</Text>
            <Text style={s.signHint}>Fondateur</Text>
          </View>
          <View style={s.signBox}>
            <Text style={s.blockLabel}>Bon pour accord — Client</Text>
            <Text style={s.signHint}>Date, nom et qualité du signataire, cachet et signature précédée de « Bon pour accord »</Text>
          </View>
        </View>

        <Text style={s.footer} fixed>
          Firovia · {FIROVIA_ISSUER.legalName} · SIRET {FIROVIA_ISSUER.siret} · {FIROVIA_ISSUER.email} · {FIROVIA_ISSUER.vatMention}
        </Text>
      </Page>
    </Document>
  )
}

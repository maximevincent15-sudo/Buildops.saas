import { Document, Image, Page, Text, View } from '@react-pdf/renderer'
import { lineStylePdf } from '../../../shared/lib/lineFormat'
import type { LineFormat } from '../../../shared/lib/lineFormat'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import { VAT_MENTION_TEXT } from '../../parametres/api'
import type { InvoicingSettings } from '../../parametres/api'
import { PdfLogo } from '../../parametres/pdf/PdfLogo'
import { formatCompanyNumber } from '../../clients/companyLookup'
import { computeQuoteTotals, formatAmount, formatNumber } from '../constants'
import type { QuoteWithLines } from '../schemas'
import { styles } from './quotePdfStyles'

type Props = {
  quote: QuoteWithLines
  organizationName: string
  settings: InvoicingSettings | null
  /** N° client de la fiche client (si renseigné) */
  clientNumber?: string | null
  /** order_ack : accusé de réception de la commande (mêmes lignes et prix, sans « bon pour accord ») */
  variant?: 'quote' | 'order_ack'
}

const frLong = (d: string | null | undefined) => (d ? format(new Date(d), 'd MMMM yyyy', { locale: fr }) : '')

/** En-tête : logo et coordonnées de l'entreprise */
export function OrgHeaderBlock({ organizationName, settings }: { organizationName: string; settings: InvoicingSettings | null }) {
  return (
    <View style={{ flex: 1 }}>
      <PdfLogo url={settings?.logo_url} />
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
  )
}

/** Pied de page fixe : forme juridique, capital, SIRET, APE, TVA */
export function LegalFooter({ organizationName, settings }: { organizationName: string; settings: InvoicingSettings | null }) {
  return (
    <Text style={styles.footer} fixed>
      {organizationName ? `${organizationName}` : ''}
      {settings?.legal_form && ` · ${settings.legal_form}`}
      {settings?.capital && ` au capital de ${settings.capital}`}
      {settings?.siret && ` · SIRET ${settings.siret}`}
      {settings?.ape_code && ` · APE ${settings.ape_code}`}
      {settings?.vat_number && ` · TVA ${settings.vat_number}`}
    </Text>
  )
}

export function QuotePdf({ quote, organizationName, settings, clientNumber, variant = 'quote' }: Props) {
  const ack = variant === 'order_ack'
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

  // Commande : date saisie, sinon celle de l'acceptation du devis
  const orderDate = quote.order_date ?? quote.accepted_at ?? quote.signed_at ?? null
  const paymentTerms = ack ? (quote.order_payment_terms?.trim() || settings?.payment_terms || null) : settings?.payment_terms

  return (
    <Document title={ack ? `Accusé de réception ${quote.reference}` : `Devis ${quote.reference}`}>
      <Page size="A4" style={styles.page}>
        {/* HEADER */}
        <View style={styles.header}>
          <OrgHeaderBlock organizationName={organizationName} settings={settings} />
          <View style={styles.headerMeta}>
            {ack ? (
              <>
                <Text style={styles.docLabel}>Accusé de réception de commande</Text>
                <Text style={styles.docRef}>{quote.reference}</Text>
                <Text style={styles.docDate}>Émis le {frLong(quote.order_ack_date ?? new Date().toISOString())}</Text>
              </>
            ) : (
              <>
                <Text style={styles.docLabel}>Devis</Text>
                <Text style={styles.docRef}>{quote.reference}</Text>
                <Text style={styles.docDate}>Émis le {issueLabel}</Text>
                {validityLabel && (
                  <Text style={styles.docDate}>Valide jusqu'au {validityLabel}</Text>
                )}
              </>
            )}
          </View>
        </View>

        {/* CLIENT + SITE */}
        <View style={styles.addressBlock}>
          <View style={styles.addressCol}>
            <Text style={styles.addressLabel}>Client</Text>
            <Text style={styles.addressName}>{quote.client_name}</Text>
            {clientNumber && <Text style={styles.addressLine}>N° client : {clientNumber}</Text>}
            {quote.dossier_number && <Text style={styles.addressLine}>N° de dossier : {quote.dossier_number}</Text>}
            {quote.client_contact_name && (
              <Text style={styles.addressLine}>{quote.client_contact_name}</Text>
            )}
            {quote.client_address && (
              <Text style={styles.addressLine}>{quote.client_address}</Text>
            )}
            {quote.client_email && (
              <Text style={styles.addressLine}>{quote.client_email}</Text>
            )}
            {quote.client_siren && (
              <Text style={styles.addressLine}>SIREN : {formatCompanyNumber(quote.client_siren)}</Text>
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

        {/* ACCUSÉ DE RÉCEPTION : la commande */}
        {ack && (
          <View style={styles.orderBox} wrap={false}>
            <Text style={styles.orderIntro}>
              Nous accusons réception de votre commande{orderDate ? ` du ${frLong(orderDate)}` : ''}, établie sur la base de notre devis {quote.reference}{issueLabel ? ` du ${issueLabel}` : ''}, et vous en remercions.
            </Text>
            {quote.order_reference?.trim() && (
              <View style={styles.orderRow}>
                <Text style={styles.orderKey}>Votre référence de commande</Text>
                <Text style={styles.orderVal}>{quote.order_reference.trim()}</Text>
              </View>
            )}
            {quote.signed_at && (
              <View style={styles.orderRow}>
                <Text style={styles.orderKey}>Devis signé</Text>
                <Text style={styles.orderVal}>
                  le {frLong(quote.signed_at)}{quote.signed_by_name ? ` par ${quote.signed_by_name}` : ''}
                </Text>
              </View>
            )}
            {quote.order_lead_time?.trim() && (
              <View style={styles.orderRow}>
                <Text style={styles.orderKey}>Délai prévu</Text>
                <Text style={styles.orderVal}>{quote.order_lead_time.trim()}</Text>
              </View>
            )}
            {paymentTerms && (
              <View style={styles.orderRow}>
                <Text style={styles.orderKey}>Conditions de paiement</Text>
                <Text style={styles.orderVal}>{paymentTerms}</Text>
              </View>
            )}
          </View>
        )}

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
              <LineDescription text={l.description} format={l.format} />
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

        {/* BON POUR ACCORD (pas sur l'accusé de réception) */}
        {!ack && <View style={styles.agreement} wrap={false}>
          <View style={styles.agreementBox}>
            <Text style={styles.agreementTitle}>Bon pour accord</Text>
            {quote.signed_at && quote.signature_data_url ? (
              <>
                <Text style={styles.agreementText}>
                  Signé le {format(new Date(quote.signed_at), "d MMMM yyyy 'à' HH'h'mm", { locale: fr })}
                  {quote.signed_by_name ? ` par ${quote.signed_by_name}` : ''}
                </Text>
                <Image src={quote.signature_data_url} style={styles.signature} />
              </>
            ) : (
              <>
                <Text style={styles.agreementText}>Date, nom et signature du client</Text>
                <View style={styles.agreementBlank} />
              </>
            )}
          </View>
        </View>}

        {/* MENTIONS LÉGALES */}
        {settings && (
          <View style={styles.legal}>
            {!ack && paymentTerms && (
              <Text>{paymentTerms}</Text>
            )}
            {settings.no_discount_text && (
              <Text>{settings.no_discount_text}</Text>
            )}
            {settings.vat_mention === 'franchise' && <Text>{VAT_MENTION_TEXT.franchise}</Text>}
          </View>
        )}

        <LegalFooter organizationName={organizationName} settings={settings} />
      </Page>
    </Document>
  )
}

/** Description d'une ligne : la désignation, puis la précision (délai, référence…) en plus petit, avec leur mise en forme */
export function LineDescription({ text, format }: { text: string; format?: LineFormat | null }) {
  const [first, ...rest] = text.split('\n')
  const details = rest.join('\n').trim()
  return (
    <View style={styles.colDesc}>
      <Text style={lineStylePdf(format?.main, 9.5)}>{first}</Text>
      {details ? <Text style={[styles.descDetail, lineStylePdf(format?.detail, 8)]}>{details}</Text> : null}
    </View>
  )
}

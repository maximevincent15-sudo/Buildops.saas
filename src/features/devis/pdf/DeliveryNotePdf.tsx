import { Document, Image, Page, StyleSheet, Text, View } from '@react-pdf/renderer'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import type { InvoicingSettings } from '../../parametres/api'
import { formatNumber } from '../constants'
import type { DeliveryNoteWithLines } from '../schemas'
import { LegalFooter, LineDescription, OrgHeaderBlock } from './QuotePdf'
import { colors, styles as base } from './quotePdfStyles'

const styles = StyleSheet.create({
  colDesc: { flex: 5 },
  colQty: { flex: 1, textAlign: 'right' },
  meta: { fontSize: 9, color: colors.ink2, marginBottom: 12 },
  box: {
    marginTop: 16,
    padding: 10,
    borderWidth: 0.5,
    borderStyle: 'solid',
    borderColor: colors.border,
    borderRadius: 4,
  },
  boxTitle: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 8.5,
    textTransform: 'uppercase',
    letterSpacing: 1,
    color: colors.ink2,
    marginBottom: 4,
  },
  blankLines: { height: 46 },
  signRow: { flexDirection: 'row', gap: 16, marginTop: 16 },
  signBox: {
    flex: 1,
    padding: 10,
    borderWidth: 0.5,
    borderStyle: 'solid',
    borderColor: colors.border,
    borderRadius: 4,
    minHeight: 110,
  },
  signText: { fontSize: 8.5, color: colors.ink2 },
  signature: { marginTop: 6, height: 70, objectFit: 'contain', objectPositionX: 0 },
})

type Props = {
  note: DeliveryNoteWithLines
  organizationName: string
  settings: InvoicingSettings | null
}

const frDate = (d: string) => format(new Date(d), 'd MMMM yyyy', { locale: fr })

/** Bon de livraison : lignes du devis livrées cette fois, sans les prix, avec la signature de celui qui reçoit */
export function DeliveryNotePdf({ note, organizationName, settings }: Props) {
  const pickup = note.mode === 'pickup'
  return (
    <Document title={`Bon de livraison ${note.reference}`}>
      <Page size="A4" style={base.page}>
        <View style={base.header}>
          <OrgHeaderBlock organizationName={organizationName} settings={settings} />
          <View style={base.headerMeta}>
            <Text style={base.docLabel}>{pickup ? 'Bon pour enlèvement' : 'Bon de livraison'}</Text>
            <Text style={base.docRef}>{note.reference}</Text>
            <Text style={base.docDate}>{pickup ? 'Prêt le' : 'Livré le'} {frDate(note.delivery_date)}</Text>
            {note.quote_reference && <Text style={base.docDate}>Devis {note.quote_reference}</Text>}
            {note.order_reference && <Text style={base.docDate}>Votre commande : {note.order_reference}</Text>}
          </View>
        </View>

        <View style={base.addressBlock}>
          <View style={base.addressCol}>
            <Text style={base.addressLabel}>Client</Text>
            <Text style={base.addressName}>{note.client_name}</Text>
            {note.dossier_number && <Text style={base.addressLine}>N° de dossier : {note.dossier_number}</Text>}
            {note.client_contact_name && <Text style={base.addressLine}>{note.client_contact_name}</Text>}
            {note.client_address && <Text style={base.addressLine}>{note.client_address}</Text>}
          </View>
          {(note.site_name || note.site_address) && (
            <View style={base.addressCol}>
              <Text style={base.addressLabel}>{pickup ? 'Chantier' : 'Lieu de livraison'}</Text>
              {note.site_name && <Text style={base.addressName}>{note.site_name}</Text>}
              {note.site_address && <Text style={base.addressLine}>{note.site_address}</Text>}
            </View>
          )}
        </View>

        {pickup && (
          <Text style={[styles.meta, { color: colors.ink }]}>
            Les éléments ci-dessous sont prêts à être récupérés.
          </Text>
        )}

        <View style={base.tableHeader}>
          <Text style={styles.colDesc}>Désignation</Text>
          <Text style={styles.colQty}>Quantité</Text>
        </View>
        {note.lines.map((l) => (
          <View key={l.id} style={base.tableRow} wrap={false}>
            <LineDescription text={l.description} format={l.format} />
            <Text style={styles.colQty}>{formatNumber(Number(l.quantity), Number(l.quantity) % 1 === 0 ? 0 : 2)}</Text>
          </View>
        ))}

        <View style={styles.box} wrap={false}>
          <Text style={styles.boxTitle}>Observations et réserves</Text>
          {note.observations?.trim()
            ? <Text>{note.observations.trim()}</Text>
            : note.signed_at
              ? <Text style={styles.signText}>Aucune</Text>
              : <View style={styles.blankLines} />}
        </View>

        <View style={styles.signRow} wrap={false}>
          <View style={styles.signBox}>
            <Text style={styles.boxTitle}>{pickup ? 'Bon pour enlèvement' : 'Réception'}</Text>
            {note.signed_at && note.signature_data_url ? (
              <>
                <Text style={styles.signText}>
                  {pickup ? 'Récupéré' : 'Reçu'} le {format(new Date(note.signed_at), "d MMMM yyyy 'à' HH'h'mm", { locale: fr })}
                  {note.signed_by_name ? ` par ${note.signed_by_name}` : ''}
                </Text>
                <Image src={note.signature_data_url} style={styles.signature} />
              </>
            ) : (
              <Text style={styles.signText}>Nom, date et signature {pickup ? 'de la personne qui récupère' : 'du client'}</Text>
            )}
          </View>
        </View>

        <LegalFooter organizationName={organizationName} settings={settings} />
      </Page>
    </Document>
  )
}

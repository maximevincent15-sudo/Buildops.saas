import { Document, Image, Page, StyleSheet, Text, View } from '@react-pdf/renderer'
import type { LabelFormat } from '../labels'

const mm = (v: number) => (v * 72) / 25.4

/** Pas de coupure de mot (« ENTRE-PRISES ») : retour à la ligne entre les mots seulement */
const noHyphen = (word: string) => [word]

const styles = StyleSheet.create({
  page: { fontFamily: 'Helvetica', color: '#1C2130' },
  org: { fontSize: 6.5, fontFamily: 'Helvetica-Bold', color: '#5A6070', textTransform: 'uppercase', letterSpacing: 0.4 },
  title: { fontFamily: 'Helvetica-Bold', color: '#1C2130', marginTop: 2 },
  line: { fontSize: 7, color: '#3A4050', lineHeight: 1.25 },
  phone: { fontSize: 6.5, color: '#5A6070' },
  dateLegend: { fontSize: 5.5, fontFamily: 'Helvetica-Bold', color: '#5A6070', textTransform: 'uppercase', letterSpacing: 0.3 },
  dateCell: { borderWidth: 0.6, borderColor: '#8A90A0', borderRadius: 1.5 },
})

export type PdfLabel = {
  /** QR code déjà rendu en image (data URL PNG) */
  qrDataUrl: string
  title: string
  lines: string[]
}

type Props = {
  format: LabelFormat
  labels: PdfLabel[]
  /** Nom en haut de l'étiquette : l'entreprise, ou le client du site */
  heading: string
  phone: string | null
  /** Case de départ sur la 1re planche (1 = en haut à gauche), pour finir une planche entamée */
  startAt: number
  /** Contours des étiquettes : pour un essai d'alignement sur papier ordinaire */
  showBorders?: boolean
  /** Cases vides où le technicien écrit au stylo la date de chaque passage */
  dateBoxes?: boolean
}

const PAD = 2.5
/** 6 cases de date : une par passage (6 ans de visites annuelles) */
const DATE_COUNT = 6
/** Bande des dates sous le QR (petites étiquettes) : 2 rangées de 3, en mm */
const DATE_STRIP_HEIGHT = 14
const DATE_LEGEND = 'Date de passage'

/** Planches A4 d'étiquettes autocollantes : QR code à gauche, repère et emplacement à droite */
export function LabelsPdf({ format, labels, heading, phone, startAt, showBorders, dateBoxes }: Props) {
  const perPage = format.cols * format.rows
  const offset = Math.min(Math.max(startAt, 1), perPage) - 1
  const slots = [...Array(offset).fill(null), ...labels] as (PdfLabel | null)[]
  const pages: (PdfLabel | null)[][] = []
  for (let i = 0; i < slots.length; i += perPage) pages.push(slots.slice(i, i + perPage))

  const innerHeight = format.height - PAD * 2
  // Grandes étiquettes (2 par ligne) : QR limité à la moitié de la largeur, textes plus grands
  const large = format.width >= 95
  // Dates : en colonne à droite sur les grandes étiquettes, en bande sous le QR sur les petites
  const dateColumn = !!dateBoxes && large
  const dateStrip = !!dateBoxes && !large
  // Colonne des dates : une seule colonne si l'étiquette est assez haute, sinon 2 colonnes de 3
  const oneColumn = (innerHeight - 3) / DATE_COUNT >= 7
  const DATE_COL_WIDTH = oneColumn ? 20 : 32
  const qrSide = dateColumn
    ? Math.min(innerHeight, format.width * (oneColumn ? 0.36 : 0.26))
    : Math.min(innerHeight, format.width * 0.46)
  const qr = dateStrip ? Math.min(qrSide, innerHeight - DATE_STRIP_HEIGHT - 1) : qrSide
  const textWidth = format.width - qr - PAD * 3 - (dateColumn ? DATE_COL_WIDTH + PAD : 0)
  const baseTitle = large ? (format.height >= 50 ? 22 : 18) : format.width >= 68 ? 14 : 12
  const titleSize = dateColumn ? Math.min(baseTitle, 18) : baseTitle
  const textScale = large && format.height >= 50 ? 1.25 : large ? 1.15 : 1
  // Avec les dates, chaque texte est limité pour ne pas déborder sur l'étiquette voisine
  const clamp = (n: number) => (dateBoxes ? { maxLines: n, textOverflow: 'ellipsis' as const } : {})
  const shownLines = dateStrip ? 2 : 3

  const columnRows = oneColumn ? DATE_COUNT : DATE_COUNT / 2
  const columnCellHeight = Math.min(oneColumn ? 8 : 10, (innerHeight - 3) / columnRows)
  const columnCellWidth = oneColumn ? DATE_COL_WIDTH : (DATE_COL_WIDTH - 1.5) / 2

  return (
    <Document title="Étiquettes QR Firovia">
      {pages.map((page, p) => (
        <Page key={p} size="A4" style={styles.page}>
          {page.map((label, i) => {
            if (!label) return null
            const col = i % format.cols
            const row = Math.floor(i / format.cols)
            const main = (
              <View style={{ flexDirection: 'row', height: mm(dateStrip ? innerHeight - DATE_STRIP_HEIGHT - 1 : innerHeight) }}>
                <Image src={label.qrDataUrl} style={{ width: mm(qr), height: mm(qr), alignSelf: 'center' }} />
                <View style={{ width: mm(textWidth), marginLeft: mm(PAD), justifyContent: 'space-between' }}>
                  <View>
                    <Text hyphenationCallback={noHyphen} style={[styles.org, { fontSize: 6.5 * textScale }, clamp(2)]}>{heading}</Text>
                    <Text hyphenationCallback={noHyphen} style={[styles.title, { fontSize: titleSize }, clamp(1)]}>{label.title}</Text>
                    {label.lines.slice(0, shownLines).map((l, k) => (
                      <Text key={k} hyphenationCallback={noHyphen} style={[styles.line, { fontSize: 7 * textScale }, clamp(dateStrip ? 1 : 2)]}>{l}</Text>
                    ))}
                  </View>
                  {phone ? <Text hyphenationCallback={noHyphen} style={[styles.phone, { fontSize: 6.5 * textScale }]}>{phone}</Text> : null}
                </View>
                {dateColumn && (
                  <View style={{ width: mm(DATE_COL_WIDTH), marginLeft: mm(PAD) }}>
                    <Text style={styles.dateLegend}>{DATE_LEGEND}</Text>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' }}>
                      {Array.from({ length: DATE_COUNT }, (_, k) => (
                        <View key={k} style={[styles.dateCell, { width: mm(columnCellWidth), height: mm(columnCellHeight - 1), marginTop: mm(1) }]} />
                      ))}
                    </View>
                  </View>
                )}
              </View>
            )
            return (
              <View
                key={i}
                style={{
                  position: 'absolute',
                  left: mm(format.marginLeft + col * (format.width + format.gapX)),
                  top: mm(format.marginTop + row * (format.height + format.gapY)),
                  width: mm(format.width),
                  height: mm(format.height),
                  padding: mm(PAD),
                  ...(showBorders ? { borderWidth: 0.5, borderColor: '#B0B6C2', borderStyle: 'dashed', borderRadius: 4 } : {}),
                }}
              >
                {main}
                {dateStrip && (
                  <View style={{ marginTop: mm(1), height: mm(DATE_STRIP_HEIGHT) }}>
                    <Text style={styles.dateLegend}>{DATE_LEGEND}</Text>
                    {[0, 1].map((r) => (
                      <View key={r} style={{ flexDirection: 'row', marginTop: mm(0.8), height: mm((DATE_STRIP_HEIGHT - 4) / 2) }}>
                        {[0, 1, 2].map((k) => (
                          <View key={k} style={[styles.dateCell, { flexGrow: 1, flexBasis: 0, marginLeft: k === 0 ? 0 : mm(1.5) }]} />
                        ))}
                      </View>
                    ))}
                  </View>
                )}
              </View>
            )
          })}
        </Page>
      ))}
    </Document>
  )
}

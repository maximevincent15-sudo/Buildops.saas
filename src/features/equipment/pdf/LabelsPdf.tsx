import { Document, Image, Page, StyleSheet, Text, View } from '@react-pdf/renderer'
import type { LabelFormat } from '../labels'

const mm = (v: number) => (v * 72) / 25.4

const styles = StyleSheet.create({
  page: { fontFamily: 'Helvetica', color: '#1C2130' },
  org: { fontSize: 6.5, fontFamily: 'Helvetica-Bold', color: '#5A6070', textTransform: 'uppercase', letterSpacing: 0.4 },
  title: { fontFamily: 'Helvetica-Bold', color: '#1C2130', marginTop: 2 },
  line: { fontSize: 7, color: '#3A4050', lineHeight: 1.25 },
  phone: { fontSize: 6.5, color: '#5A6070' },
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
  organizationName: string
  phone: string | null
  /** Case de départ sur la 1re planche (1 = en haut à gauche), pour finir une planche entamée */
  startAt: number
  /** Contours des étiquettes : pour un essai d'alignement sur papier ordinaire */
  showBorders?: boolean
}

/** Planches A4 d'étiquettes autocollantes : QR code à gauche, repère et emplacement à droite */
export function LabelsPdf({ format, labels, organizationName, phone, startAt, showBorders }: Props) {
  const perPage = format.cols * format.rows
  const offset = Math.min(Math.max(startAt, 1), perPage) - 1
  const slots = [...Array(offset).fill(null), ...labels] as (PdfLabel | null)[]
  const pages: (PdfLabel | null)[][] = []
  for (let i = 0; i < slots.length; i += perPage) pages.push(slots.slice(i, i + perPage))

  const pad = 2.5
  const qr = format.height - pad * 2
  const textWidth = format.width - qr - pad * 3
  const titleSize = format.width >= 68 ? 14 : 12

  return (
    <Document title="Étiquettes QR Firovia">
      {pages.map((page, p) => (
        <Page key={p} size="A4" style={styles.page}>
          {page.map((label, i) => {
            if (!label) return null
            const col = i % format.cols
            const row = Math.floor(i / format.cols)
            return (
              <View
                key={i}
                style={{
                  position: 'absolute',
                  left: mm(format.marginLeft + col * (format.width + format.gapX)),
                  top: mm(format.marginTop + row * (format.height + format.gapY)),
                  width: mm(format.width),
                  height: mm(format.height),
                  padding: mm(pad),
                  flexDirection: 'row',
                  ...(showBorders ? { borderWidth: 0.5, borderColor: '#B0B6C2', borderStyle: 'dashed', borderRadius: 4 } : {}),
                }}
              >
                <Image src={label.qrDataUrl} style={{ width: mm(qr), height: mm(qr) }} />
                <View style={{ width: mm(textWidth), marginLeft: mm(pad), justifyContent: 'space-between' }}>
                  <View>
                    <Text style={styles.org}>{organizationName}</Text>
                    <Text style={[styles.title, { fontSize: titleSize }]}>{label.title}</Text>
                    {label.lines.slice(0, 3).map((l, k) => (
                      <Text key={k} style={styles.line}>{l}</Text>
                    ))}
                  </View>
                  {phone ? <Text style={styles.phone}>{phone}</Text> : null}
                </View>
              </View>
            )
          })}
        </Page>
      ))}
    </Document>
  )
}

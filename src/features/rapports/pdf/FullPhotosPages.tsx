import { Image, Page, Text, View } from '@react-pdf/renderer'
import type { ReactNode } from 'react'

/** Une photo de l'annexe complète (image déjà réduite, en data URL) */
export type FullPhoto = { src: string; caption: string }

/** Photos d'un équipement (repérage, contrôle, anomalies) ou du site */
export type FullPhotoGroup = { key: string; title: string; subtitle: string | null; photos: FullPhoto[] }

const ink = '#1C2130'
const ink2 = '#5A6070'
const ink3 = '#9AA0AE'
const acc = '#3A5CA8'
const border = '#E3E6EB'
const bg = '#F6F7F9'

const PER_ROW = 3

/**
 * Annexe du « PDF complet » : toutes les photos de la visite, rangées
 * équipement par équipement, trois par ligne avec leur légende.
 */
export function FullPhotosPages({ groups, footer, header }: { groups: FullPhotoGroup[]; footer: string; header?: ReactNode }) {
  const total = groups.reduce((n, g) => n + g.photos.length, 0)
  if (total === 0) return null
  return (
    <Page size="A4" style={{ paddingTop: 30, paddingHorizontal: 34, paddingBottom: 44, fontFamily: 'Helvetica', fontSize: 9, color: ink }}>
      {/* Même bandeau que le rapport, en haut de chaque page */}
      {header && <View fixed style={{ marginBottom: 10 }}>{header}</View>}
      <Text style={{ fontSize: 9, fontFamily: 'Helvetica-Bold', color: acc, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10 }}>
        Annexe · Toutes les photos de la visite ({total})
      </Text>
      {groups.map((g) => {
        const rows: FullPhoto[][] = []
        for (let i = 0; i < g.photos.length; i += PER_ROW) rows.push(g.photos.slice(i, i + PER_ROW))
        const header = (
          <View style={{ flexDirection: 'row', alignItems: 'baseline', borderBottomWidth: 0.5, borderBottomStyle: 'solid', borderBottomColor: border, paddingBottom: 3, marginBottom: 5 }}>
            <Text style={{ fontSize: 9.5, fontFamily: 'Helvetica-Bold' }}>{g.title}</Text>
            {g.subtitle && <Text style={{ fontSize: 7.8, color: ink2, marginLeft: 8, flex: 1 }}>{g.subtitle}</Text>}
            <Text style={{ fontSize: 7.5, color: ink3, marginLeft: 8 }}>{g.photos.length} photo{g.photos.length > 1 ? 's' : ''}</Text>
          </View>
        )
        return (
          <View key={g.key} style={{ marginBottom: 12 }}>
            {rows.map((row, ri) => (
              // Le titre reste avec la première ligne de photos (jamais seul en bas de page)
              <View key={ri} wrap={false}>
                {ri === 0 && header}
                <View style={{ flexDirection: 'row', gap: 8, marginBottom: 6 }}>
                  {row.map((p, pi) => (
                    <View key={pi} style={{ width: '32%' }}>
                      <Image src={p.src} style={{ width: '100%', height: 128, objectFit: 'contain', backgroundColor: bg, borderRadius: 3 }} />
                      <Text style={{ fontSize: 6.8, color: ink2, marginTop: 2 }}>{p.caption}</Text>
                    </View>
                  ))}
                </View>
              </View>
            ))}
          </View>
        )
      })}
      <View fixed style={{ position: 'absolute', bottom: 18, left: 34, right: 34, flexDirection: 'row', justifyContent: 'space-between' }}>
        <Text style={{ fontSize: 7, color: ink3 }}>{footer}</Text>
        <Text style={{ fontSize: 7, color: ink3 }} render={({ pageNumber, totalPages }) => `Page ${pageNumber}/${totalPages} · Généré avec Firovia`} />
      </View>
    </Page>
  )
}

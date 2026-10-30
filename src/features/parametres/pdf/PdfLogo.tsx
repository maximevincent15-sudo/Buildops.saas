import { Image } from '@react-pdf/renderer'

/** Logo de l'entreprise en tête des PDF (devis, factures, rapports, contrats). Rien si aucun logo. */
export function PdfLogo({ url, height = 42 }: { url: string | null | undefined; height?: number }) {
  if (!url) return null
  return (
    <Image
      src={url}
      style={{ height, maxWidth: 170, objectFit: 'contain', objectPosition: 'left', alignSelf: 'flex-start', marginBottom: 8 }}
    />
  )
}

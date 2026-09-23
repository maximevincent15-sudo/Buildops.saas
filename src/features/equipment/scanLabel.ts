import { supabase } from '../../shared/lib/supabase'
import type { EquipmentFamily } from './schemas'

/**
 * Scan d'étiquette d'équipement : photo → Edge Function scan-equipment-label
 * (Claude vision) → champs pré-remplis dans la fiche unité.
 */

export type LabelScanResult = {
  readable: boolean
  family: EquipmentFamily | null
  subtype: string | null
  brand: string | null
  model: string | null
  manufacture_year: number | null
  serial_number: string | null
  extra: string | null
}

export class LabelScanError extends Error {}

/**
 * Redimensionne la photo (côté long ≤ 1600 px) et la ré-encode en JPEG :
 * une photo iPhone de 4 Mo passe à ~300 Ko, largement lisible pour l'IA.
 * Le navigateur applique l'orientation EXIF au dessin sur le canvas.
 */
async function toCompressedJpeg(file: File, maxDim = 1600, quality = 0.85): Promise<string> {
  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image()
      i.onload = () => resolve(i)
      i.onerror = () => reject(new LabelScanError('Format de photo non supporté. Réessaie avec l\'appareil photo.'))
      i.src = url
    })
    const scale = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(img.naturalWidth * scale)
    canvas.height = Math.round(img.naturalHeight * scale)
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new LabelScanError('Impossible de traiter la photo sur cet appareil.')
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
    return canvas.toDataURL('image/jpeg', quality).split(',')[1] ?? ''
  } finally {
    URL.revokeObjectURL(url)
  }
}

export async function scanEquipmentLabel(file: File): Promise<LabelScanResult> {
  if (!navigator.onLine) {
    throw new LabelScanError('Pas de réseau : le scan nécessite une connexion. Remplis la fiche à la main.')
  }
  const image = await toCompressedJpeg(file)

  const { data, error } = await supabase.functions.invoke('scan-equipment-label', {
    body: { image, mediaType: 'image/jpeg' },
  })

  if (error) {
    const status = (error as { context?: { status?: number } }).context?.status
    if (status === 404 || status === 503) {
      throw new LabelScanError('Le scan d\'étiquette n\'est pas encore activé sur ton compte.')
    }
    if (status === 429) {
      throw new LabelScanError('Beaucoup de scans d\'un coup : patiente une minute puis réessaie.')
    }
    throw new LabelScanError('La lecture de l\'étiquette a échoué. Réessaie ou remplis la fiche à la main.')
  }
  return data as LabelScanResult
}

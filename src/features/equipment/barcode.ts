import type { DecodeHintType, MultiFormatReader } from '@zxing/library'

/**
 * Lecture des codes-barres des étiquettes déjà posées (Code 128, Code 39,
 * EAN, ITF…) avec ZXing, pour les téléphones sans lecteur natif (iPhone,
 * Firefox). La bibliothèque n'est chargée qu'à la première lecture.
 */

type Zxing = { lib: typeof import('@zxing/library'); reader: MultiFormatReader }
let zxing: Promise<Zxing> | null = null

function loadZxing(): Promise<Zxing> {
  zxing ??= import('@zxing/library').then((lib) => {
    const F = lib.BarcodeFormat
    const reader = new lib.MultiFormatReader()
    reader.setHints(new Map<DecodeHintType, unknown>([
      [lib.DecodeHintType.POSSIBLE_FORMATS, [F.CODE_128, F.CODE_39, F.CODE_93, F.CODABAR, F.EAN_13, F.EAN_8, F.ITF, F.UPC_A, F.UPC_E]],
      [lib.DecodeHintType.TRY_HARDER, true],
    ]))
    return { lib, reader }
  })
  return zxing
}

/** Code-barres lu dans une image RGBA (ImageData d'un canvas), null s'il n'y en a pas */
export async function decodeBarcodeImage(img: { data: Uint8ClampedArray; width: number; height: number }): Promise<string | null> {
  const { lib, reader } = await loadZxing()
  const lum = new Uint8ClampedArray(img.width * img.height)
  for (let i = 0, j = 0; j < lum.length; i += 4, j++) {
    const grey = (img.data[i]! * 299 + img.data[i + 1]! * 587 + img.data[i + 2]! * 114) / 1000
    // Pixels transparents (capture PNG) : posés sur du blanc, comme sur l'étiquette
    const alpha = img.data[i + 3]! / 255
    lum[j] = grey * alpha + 255 * (1 - alpha)
  }
  try {
    const bitmap = new lib.BinaryBitmap(new lib.HybridBinarizer(new lib.RGBLuminanceSource(lum, img.width, img.height)))
    return reader.decodeWithState(bitmap).getText() || null
  } catch {
    return null // aucun code-barres dans l'image
  }
}

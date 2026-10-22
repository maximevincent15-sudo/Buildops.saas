/**
 * Réduit une photo de téléphone (souvent 3 à 6 Mo) avant envoi : plus grand
 * côté ramené à maxDim pixels, en JPEG. Sur le terrain, l'envoi est ainsi
 * rapide même en 4G faible. Retourne le fichier d'origine si la réduction
 * échoue (format non lu par le navigateur…).
 */
export async function compressImage(file: File, maxDim = 1280, quality = 0.8): Promise<Blob> {
  if (!file.type.startsWith('image/')) return file
  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image()
      el.onload = () => resolve(el)
      el.onerror = () => reject(new Error('image illisible'))
      el.src = url
    })
    const scale = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight))
    const w = Math.max(1, Math.round(img.naturalWidth * scale))
    const h = Math.max(1, Math.round(img.naturalHeight * scale))
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) return file
    ctx.drawImage(img, 0, 0, w, h)
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality))
    return blob && blob.size < file.size ? blob : file
  } catch {
    return file
  } finally {
    URL.revokeObjectURL(url)
  }
}

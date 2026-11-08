import { useEffect, useState } from 'react'
import type { ImgHTMLAttributes, SyntheticEvent } from 'react'
import { getFile } from '../lib/offline/db'
import { storageLocation } from '../lib/privateFiles'

type Props = Omit<ImgHTMLAttributes<HTMLImageElement>, 'src'> & { src: string }

/**
 * Photo du stockage. Une photo prise sans réseau n'est pas encore en ligne :
 * son adresse ne répond pas, on affiche alors la copie gardée sur l'appareil
 * (elle part au retour du réseau).
 */
export function StoredImg({ src, onError, ...rest }: Props) {
  const [local, setLocal] = useState<{ src: string; url: string } | null>(null)
  const localUrl = local && local.src === src ? local.url : null

  // Copie locale libérée quand elle est remplacée ou que la photo disparaît
  useEffect(() => () => { if (local) URL.revokeObjectURL(local.url) }, [local])

  function handleError(e: SyntheticEvent<HTMLImageElement>) {
    onError?.(e)
    if (localUrl) return
    const loc = storageLocation(src)
    if (!loc) return
    void getFile(`${loc.bucket}/${loc.path}`)
      .then((f) => { if (f) setLocal({ src, url: URL.createObjectURL(f.blob) }) })
      .catch(() => {})
  }

  return <img {...rest} src={localUrl ?? src} onError={handleError} />
}

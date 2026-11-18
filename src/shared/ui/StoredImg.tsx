import { useEffect, useState } from 'react'
import type { ImgHTMLAttributes, SyntheticEvent } from 'react'
import { getFile } from '../lib/offline/db'
import { isPrivateFile, openableUrl, storageLocation } from '../lib/privateFiles'

type Props = Omit<ImgHTMLAttributes<HTMLImageElement>, 'src'> & { src: string }

/** Pixel transparent : garde la place de l'image le temps d'obtenir son lien */
const BLANK = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'

/** Copie gardée sur l'appareil d'une photo pas encore en ligne (adresse locale), sinon null */
async function localCopy(src: string): Promise<string | null> {
  const loc = storageLocation(src)
  if (!loc) return null
  try {
    const f = await getFile(`${loc.bucket}/${loc.path}`)
    return f ? URL.createObjectURL(f.blob) : null
  } catch {
    return null
  }
}

/**
 * Photo du stockage. Une photo privée s'affiche par un lien temporaire,
 * demandé à l'affichage. Une photo prise sans réseau n'est pas encore en
 * ligne (ou son lien ne peut pas être demandé) : on affiche alors la copie
 * gardée sur l'appareil (elle part au retour du réseau).
 */
export function StoredImg({ src, onError, ...rest }: Props) {
  const [local, setLocal] = useState<{ src: string; url: string } | null>(null)
  const [signed, setSigned] = useState<{ src: string; url: string } | null>(null)
  const localUrl = local && local.src === src ? local.url : null
  const priv = isPrivateFile(src)

  // Copie locale libérée quand elle est remplacée ou que la photo disparaît
  useEffect(() => () => { if (local) URL.revokeObjectURL(local.url) }, [local])

  useEffect(() => {
    if (!priv) return
    let alive = true
    void openableUrl(src)
      .then((u) => { if (alive) setSigned({ src, url: u }) })
      .catch(async () => {
        // Pas de lien temporaire : la copie de l'appareil, sinon l'adresse d'origine
        const url = await localCopy(src)
        if (url && alive) setLocal({ src, url })
        else if (url) URL.revokeObjectURL(url)
        else if (alive) setSigned({ src, url: src })
      })
    return () => { alive = false }
  }, [src, priv])

  function handleError(e: SyntheticEvent<HTMLImageElement>) {
    onError?.(e)
    if (localUrl) return
    void localCopy(src).then((url) => { if (url) setLocal({ src, url }) })
  }

  const remote = priv ? (signed && signed.src === src ? signed.url : null) : src
  return <img {...rest} src={localUrl ?? remote ?? BLANK} onError={handleError} />
}

import { useEffect, useState } from 'react'
import { isPrivateFile, openableUrl } from './privateFiles'

/** Adresse affichable d'un fichier stocké (lien temporaire si privé), null pendant le chargement */
export function useOpenableUrl(url: string | null | undefined): string | null {
  const [signed, setSigned] = useState<{ for: string; url: string } | null>(null)
  const needsSigning = !!url && isPrivateFile(url)

  useEffect(() => {
    if (!url || !needsSigning) return
    let alive = true
    void openableUrl(url).then((u) => { if (alive) setSigned({ for: url, url: u }) }).catch(() => {})
    return () => { alive = false }
  }, [url, needsSigning])

  if (!url) return null
  if (!needsSigning) return url
  return signed?.for === url ? signed.url : null
}

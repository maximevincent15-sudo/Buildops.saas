import type { AnchorHTMLAttributes, MouseEvent } from 'react'
import { isPrivateFile, openStoredFile } from '../lib/privateFiles'

type Props = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> & { url: string }

/**
 * Lien vers un fichier stocké : un fichier privé s'ouvre par lien temporaire
 * (demandé au clic), un fichier public par son adresse.
 */
export function FileLink({ url, onClick, children, ...props }: Props) {
  const isPrivate = isPrivateFile(url)

  function handleClick(e: MouseEvent<HTMLAnchorElement>) {
    onClick?.(e)
    if (!isPrivate || e.defaultPrevented) return
    e.preventDefault()
    void openStoredFile(url).catch((err) => console.error('Ouverture du fichier impossible', err))
  }

  return (
    <a href={isPrivate ? '#' : url} target="_blank" rel="noreferrer" {...props} onClick={handleClick}>
      {children}
    </a>
  )
}

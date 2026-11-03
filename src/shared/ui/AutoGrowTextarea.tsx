import { useLayoutEffect, useRef } from 'react'
import type { TextareaHTMLAttributes } from 'react'

/**
 * Zone de texte d'une ligne qui s'agrandit avec son contenu (Entrée = retour
 * à la ligne). Sert aux descriptions des lignes de devis et de facture.
 */
export function AutoGrowTextarea({ value, style, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement> & { value: string }) {
  const ref = useRef<HTMLTextAreaElement>(null)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight + 1}px`
  }, [value])

  return (
    <textarea
      ref={ref}
      rows={1}
      value={value}
      style={{ resize: 'none', overflow: 'hidden', ...style }}
      {...props}
    />
  )
}

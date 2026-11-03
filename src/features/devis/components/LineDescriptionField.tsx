import { useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import { flushSync } from 'react-dom'
import { joinDescription, lineStyleCss, splitDescription } from '../../../shared/lib/lineFormat'
import type { LineFormat, LinePart } from '../../../shared/lib/lineFormat'
import { AutoGrowTextarea } from '../../../shared/ui/AutoGrowTextarea'

type Props = {
  value: string
  format: LineFormat | null | undefined
  onChange: (description: string) => void
  /** Zone active (pour la barre de mise en forme) */
  onFocusPart: (part: LinePart) => void
  placeholder?: string
}

/**
 * Description d'une ligne de devis ou de facture : la désignation, puis une
 * précision dessous en plus petit (délai de livraison, référence…), comme
 * sur le PDF. Entrée dans la désignation ouvre la précision.
 */
export function LineDescriptionField({ value, format, onChange, onFocusPart, placeholder }: Props) {
  const { main, detail } = splitDescription(value)
  const [detailOpen, setDetailOpen] = useState(false)
  const showDetail = detailOpen || detail !== ''
  const wrapRef = useRef<HTMLDivElement>(null)

  const focusPart = (part: LinePart) =>
    wrapRef.current?.querySelectorAll('textarea')[part === 'main' ? 0 : 1]?.focus()

  // La précision est affichée tout de suite : la frappe suivante y arrive
  function openDetail() {
    flushSync(() => setDetailOpen(true))
    focusPart('detail')
  }

  function changeMain(text: string) {
    // Texte collé sur plusieurs lignes : la suite part dans la précision
    const i = text.indexOf('\n')
    if (i < 0) return onChange(joinDescription(text, detail))
    const rest = text.slice(i + 1)
    onChange(joinDescription(text.slice(0, i), [rest, detail].filter(Boolean).join('\n')))
    setDetailOpen(true)
  }

  function mainKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      openDetail()
    }
  }

  function detailKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    // Retour arrière sur une précision vide : on la referme
    if (e.key === 'Backspace' && detail === '') {
      e.preventDefault()
      focusPart('main')
      setDetailOpen(false)
    }
  }

  return (
    <div ref={wrapRef} className="ql-desc-field">
      <AutoGrowTextarea
        placeholder={placeholder}
        value={main}
        onChange={(e) => changeMain(e.target.value)}
        onKeyDown={mainKeyDown}
        onFocus={() => onFocusPart('main')}
        style={lineStyleCss(format?.main, 'main')}
      />
      {showDetail ? (
        <AutoGrowTextarea
          className="ql-detail"
          placeholder="Précision : délai de livraison, référence…"
          value={detail}
          onChange={(e) => onChange(joinDescription(main, e.target.value))}
          onKeyDown={detailKeyDown}
          onFocus={() => onFocusPart('detail')}
          onBlur={() => { if (!detail) setDetailOpen(false) }}
          style={lineStyleCss(format?.detail, 'detail')}
        />
      ) : (
        <button type="button" className="ql-add-detail" onClick={openDetail}>
          + précision
        </button>
      )}
    </div>
  )
}

import { Bold, Italic, RemoveFormatting, Underline } from 'lucide-react'
import type { MouseEvent, ReactNode } from 'react'
import { LINE_COLORS } from '../../../shared/lib/lineFormat'
import type { LineColor, LinePart, LineSize, LineTextStyle } from '../../../shared/lib/lineFormat'

type Props = {
  /** Ligne et zone où se trouve le curseur ; null : barre inactive */
  target: { index: number; part: LinePart } | null
  style: LineTextStyle | undefined
  onChange: (style: LineTextStyle) => void
}

const SIZES: Array<{ value: LineSize | undefined; label: string; title: string }> = [
  { value: 'sm', label: 'A', title: 'Petit' },
  { value: undefined, label: 'A', title: 'Normal' },
  { value: 'lg', label: 'A', title: 'Grand' },
]

// Le clic sur la barre ne retire pas le curseur de la zone de texte
const keepFocus = (e: MouseEvent) => e.preventDefault()

function ToolButton({ active, title, disabled, onClick, children }: {
  active?: boolean
  title: string
  disabled: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      className={`lf-btn${active ? ' on' : ''}`}
      title={title}
      aria-label={title}
      aria-pressed={active}
      disabled={disabled}
      onMouseDown={keepFocus}
      onClick={onClick}
    >
      {children}
    </button>
  )
}

/**
 * Barre de mise en forme des lignes (devis, facture) : gras, italique,
 * souligné, taille et couleur de la zone où se trouve le curseur
 * (désignation ou précision), comme sur le PDF.
 */
export function LineFormatToolbar({ target, style, onChange }: Props) {
  const off = !target
  const s = style ?? {}
  const set = (patch: Partial<LineTextStyle>) => onChange({ ...s, ...patch })

  return (
    <div className="lf-bar" role="toolbar" aria-label="Mise en forme de la ligne">
      <span className="lf-target">
        {target ? `Ligne ${target.index + 1} · ${target.part === 'main' ? 'désignation' : 'précision'}` : 'Cliquez dans une ligne pour la mettre en forme'}
      </span>
      <div className="lf-group">
        <ToolButton title="Gras" active={!!s.bold} disabled={off} onClick={() => set({ bold: !s.bold })}><Bold size={14} strokeWidth={2.5} /></ToolButton>
        <ToolButton title="Italique" active={!!s.italic} disabled={off} onClick={() => set({ italic: !s.italic })}><Italic size={14} strokeWidth={2.5} /></ToolButton>
        <ToolButton title="Souligné" active={!!s.underline} disabled={off} onClick={() => set({ underline: !s.underline })}><Underline size={14} strokeWidth={2.5} /></ToolButton>
      </div>
      <div className="lf-group">
        {SIZES.map((z) => (
          <ToolButton key={z.title} title={`Taille : ${z.title.toLowerCase()}`} active={!off && s.size === z.value} disabled={off} onClick={() => set({ size: z.value })}>
            <span style={{ fontSize: z.value === 'sm' ? 11 : z.value === 'lg' ? 16 : 13, fontWeight: 700, lineHeight: 1 }}>{z.label}</span>
          </ToolButton>
        ))}
      </div>
      <div className="lf-group">
        <ToolButton title="Couleur : noir" active={!off && !s.color} disabled={off} onClick={() => set({ color: undefined })}>
          <span className="lf-swatch" style={{ background: 'var(--ink)' }} />
        </ToolButton>
        {(Object.keys(LINE_COLORS) as LineColor[]).map((c) => (
          <ToolButton key={c} title={`Couleur : ${LINE_COLORS[c].label.toLowerCase()}`} active={s.color === c} disabled={off} onClick={() => set({ color: c })}>
            <span className="lf-swatch" style={{ background: LINE_COLORS[c].hex }} />
          </ToolButton>
        ))}
      </div>
      <ToolButton title="Enlever la mise en forme" disabled={off} onClick={() => onChange({})}>
        <RemoveFormatting size={14} strokeWidth={2} />
      </ToolButton>
    </div>
  )
}

import { formatAmount } from '../../devis/constants'

type Item = { name: string; amount: number; count: number }

type Props = {
  title: string
  subtitle?: string
  items: Item[]
  emptyMessage?: string
  /** Couleur de la barre (CSS var ou hex). Défaut : --acc. Définit aussi la
   *  couleur de l'avatar du 1er item de la liste pour suggérer le « leader ». */
  barColor?: string
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase()
  return (parts[0]![0]! + parts[1]![0]!).toUpperCase()
}

/**
 * TopBarsChart v2 — Direction B (Mercury-vibe).
 *
 * Leaderboard façon top clients/techs du mockup :
 * - Avatar circulaire avec initiales (couleur du 1er = barColor)
 * - Nom + sous-info (ville · nb interventions)
 * - Montant € à droite + pourcentage en sous-titre
 *
 * Plus pertinent pour des données business B2B que des barres de progression :
 * c'est ce que font Mercury, Stripe Dashboard, Notion analytics.
 */
export function TopBarsChart({ title, subtitle, items, emptyMessage, barColor }: Props) {
  const total = items.reduce((s, i) => s + i.amount, 0)

  // Palette tournante pour les avatars (sauf le 1er qui prend barColor)
  const palette = ['var(--acc)', 'var(--grn)', 'var(--org)', 'var(--brn)', 'var(--gry)']

  return (
    <div className="b-card">
      <div className="b-section-head" style={{ marginBottom: 8 }}>
        <div>
          <div className="b-section-h" style={{ fontSize: 15 }}>{title}</div>
          {subtitle && <div className="b-section-s" style={{ fontSize: 12 }}>{subtitle}</div>}
        </div>
      </div>

      {items.length === 0 ? (
        <p style={{ padding: '12px 0', fontSize: 13, color: 'var(--ink2)' }}>
          {emptyMessage ?? 'Aucune donnée pour le moment.'}
        </p>
      ) : (
        <div className="b-list">
          {items.map((item, i) => {
            const pct = total > 0 ? Math.round((item.amount / total) * 100) : 0
            const avatarBg = i === 0 ? (barColor ?? 'var(--acc)') : palette[i % palette.length]
            return (
              <div key={item.name + i} className="b-list-item">
                <div className="b-lb-avatar" style={{ background: avatarBg }}>
                  {initials(item.name)}
                </div>
                <div className="b-lb-info">
                  <div className="b-lb-n">{item.name}</div>
                  <div className="b-lb-r">{item.count} facture{item.count > 1 ? 's' : ''}</div>
                </div>
                <div>
                  <div className="b-lb-val">{formatAmount(item.amount)}</div>
                  <div className="b-lb-val-s">{pct} %</div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

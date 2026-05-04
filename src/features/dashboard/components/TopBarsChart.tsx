import { formatAmount } from '../../devis/constants'

type Item = { name: string; amount: number; count: number }

type Props = {
  title: string
  subtitle?: string
  items: Item[]
  emptyMessage?: string
  /** Couleur de la barre (CSS var ou hex). Défaut : --acc */
  barColor?: string
}

export function TopBarsChart({ title, subtitle, items, emptyMessage, barColor }: Props) {
  const max = items.reduce((m, i) => Math.max(m, i.amount), 0)

  return (
    <div className="card">
      <div className="card-top">
        <span className="card-title">{title}</span>
        {subtitle && <span className="text-ink-3 text-xs font-light">{subtitle}</span>}
      </div>

      {items.length === 0 ? (
        <p className="text-ink-3 text-xs font-light" style={{ marginTop: '.5rem', margin: 0 }}>
          {emptyMessage ?? 'Aucune donnée pour le moment.'}
        </p>
      ) : (
        <div className="top-bars">
          {items.map((item, i) => {
            const pct = max > 0 ? (item.amount / max) * 100 : 0
            return (
              <div key={item.name + i} className="top-bar-row">
                <div className="top-bar-head">
                  <span className="top-bar-name" title={item.name}>{item.name}</span>
                  <span className="top-bar-amount">{formatAmount(item.amount)}</span>
                </div>
                <div className="top-bar-track">
                  <div
                    className="top-bar-fill"
                    style={{ width: `${Math.max(2, pct)}%`, background: barColor }}
                  />
                </div>
                <div className="top-bar-meta">
                  {item.count} facture{item.count > 1 ? 's' : ''}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

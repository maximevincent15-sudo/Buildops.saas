import { formatAmount } from '../../devis/constants'

type Item = { key: string; label: string; amount: number }

type Props = {
  title: string
  data: Item[]
}

/**
 * MonthlyRevenueChart v2 — Direction B (Mercury-vibe).
 *
 * Chart SVG line + area gradient (style Stripe / Mercury), responsive.
 * Au lieu de bars (qui font « marketing dashboard générique »), on a une
 * ligne fluide avec dégradé sous la courbe : plus moderne, plus calme,
 * plus lisible. Le dernier point (mois en cours) est mis en évidence avec
 * une bordure blanche.
 */
export function MonthlyRevenueChart({ title, data }: Props) {
  const total = data.reduce((s, i) => s + i.amount, 0)
  const average = data.length > 0 ? total / data.length : 0
  const max = data.reduce((m, i) => Math.max(m, i.amount), 0)

  // Coordonnées SVG : viewBox 800 (largeur logique) × 140 (hauteur)
  const W = 800
  const H = 140
  const padTop = 15
  const padBottom = 15
  const usableH = H - padTop - padBottom

  if (data.length === 0 || max === 0) {
    return (
      <div className="b-card" style={{ padding: '28px 32px' }}>
        <div className="b-section-head" style={{ marginBottom: 4 }}>
          <div>
            <div className="b-section-h">{title}</div>
            <div className="b-section-s">Aucune donnée pour les 12 derniers mois</div>
          </div>
        </div>
        <p style={{ marginTop: 24, color: 'var(--ink2)', fontSize: 13 }}>
          Aucun encaissement enregistré. Une fois tes premières factures payées,
          tu verras ici l'évolution de ton CA mois par mois.
        </p>
      </div>
    )
  }

  // Calcul des points (x, y) de la courbe
  const points = data.map((d, i) => {
    const x = (i / Math.max(1, data.length - 1)) * W
    const ratio = max > 0 ? d.amount / max : 0
    const y = padTop + usableH - ratio * usableH
    return { x, y, ...d }
  })

  // Path pour la ligne (lissé léger via courbes Bézier simples)
  const linePath = points
    .map((p, i) => (i === 0 ? `M ${p.x},${p.y}` : `L ${p.x},${p.y}`))
    .join(' ')

  // Path pour l'aire (ferme en bas)
  const areaPath = `${linePath} L ${W},${H} L 0,${H} Z`

  const lastIdx = points.length - 1
  const labelsToShow = data.length > 8
    ? data.filter((_, i) => i % 2 === 0 || i === lastIdx)
    : data

  return (
    <div className="b-card" style={{ padding: '28px 32px' }}>
      <div className="b-section-head" style={{ marginBottom: 4 }}>
        <div>
          <div className="b-section-h">{title}</div>
          <div className="b-section-s">
            12 derniers mois · Total {formatAmount(total)} · Moy {formatAmount(average)}/mois
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--ink2)' }}>
          <span style={{ width: 10, height: 10, background: 'var(--acc)', borderRadius: 2, display: 'inline-block' }} />
          Mois en cours
        </div>
      </div>

      <div className="b-chart-area">
        <svg
          className="b-chart-svg"
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          aria-label={`Évolution du CA encaissé sur ${data.length} mois`}
        >
          <defs>
            <linearGradient id="b-chart-grad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#3A5CA8" stopOpacity="0.25" />
              <stop offset="100%" stopColor="#3A5CA8" stopOpacity="0" />
            </linearGradient>
          </defs>
          {/* Aire sous la courbe */}
          <path d={areaPath} fill="url(#b-chart-grad)" />
          {/* Ligne principale */}
          <path
            d={linePath}
            stroke="#3A5CA8"
            strokeWidth="2.5"
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
          {/* Points sur chaque mois */}
          {points.map((p, i) => (
            <circle
              key={p.key}
              cx={p.x}
              cy={p.y}
              r={i === lastIdx ? 5 : 4}
              fill="#3A5CA8"
              stroke={i === lastIdx ? 'white' : 'none'}
              strokeWidth={i === lastIdx ? 2 : 0}
            />
          ))}
        </svg>
      </div>
      <div className="b-chart-labels">
        {labelsToShow.map((d, i) => (
          <span
            key={d.key}
            style={i === labelsToShow.length - 1 ? { fontWeight: 700, color: 'var(--ink)' } : undefined}
          >
            {d.label}
          </span>
        ))}
      </div>
    </div>
  )
}

import { useState } from 'react'
import type { ReactNode } from 'react'
import { formatAmount } from '../../devis/constants'
import type { MonthProfit } from '../../finance/profit'

type Item = { key: string; label: string; amount: number }

type Props = {
  title: string
  data: Item[]
  /** Rentabilité par mois (administrateurs) : détaillée dans l'infobulle */
  profit?: Map<string, MonthProfit> | null
  /** Bloc affiché sous la courbe (ex. résultat du mois) */
  footer?: ReactNode
}

function fullMonth(key: string): string {
  const [y, m] = key.split('-').map(Number)
  return new Date(y!, m! - 1, 1).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })
}

function signed(value: number): string {
  return `${value > 0 ? '+' : ''}${formatAmount(value)}`
}

/**
 * MonthlyRevenueChart v2 — Direction B (Mercury-vibe).
 *
 * Chart SVG line + area gradient (style Stripe / Mercury), responsive.
 * Au lieu de bars (qui font « marketing dashboard générique »), on a une
 * ligne fluide avec dégradé sous la courbe : plus moderne, plus calme,
 * plus lisible. Le dernier point (mois en cours) est mis en évidence avec
 * une bordure blanche. Survol (ou toucher) d'un mois : infobulle avec le
 * montant encaissé et, si fourni, la marge et le résultat du mois.
 */
export function MonthlyRevenueChart({ title, data, profit, footer }: Props) {
  const [active, setActive] = useState<number | null>(null)
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
        {footer}
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

  // Zones de survol centrées sur chaque point (demi-zones aux extrémités)
  const step = 1 / Math.max(1, points.length - 1)
  const activePoint = active !== null ? points[active] : null
  const activeProfit = activePoint && profit ? profit.get(activePoint.key) ?? null : null
  const activePct = activePoint ? (activePoint.x / W) * 100 : 0
  // Point haut placé : l'infobulle passe sous le point pour rester visible
  const tipBelow = activePoint ? activePoint.y < H / 2 : false

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

      <div className="b-chart-area" onMouseLeave={() => setActive(null)}>
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
          {/* Repère vertical du mois survolé */}
          {activePoint && (
            <line
              x1={activePoint.x} x2={activePoint.x} y1={0} y2={H}
              stroke="#3A5CA8" strokeOpacity="0.35" strokeDasharray="4 4"
              vectorEffect="non-scaling-stroke"
            />
          )}
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
              r={i === active ? 6 : i === lastIdx ? 5 : 4}
              fill="#3A5CA8"
              stroke={i === lastIdx || i === active ? 'white' : 'none'}
              strokeWidth={i === lastIdx || i === active ? 2 : 0}
            />
          ))}
        </svg>

        {/* Zones de survol / toucher, une par mois */}
        {points.map((p, i) => {
          const left = Math.max(0, (i - 0.5) * step) * 100
          const right = Math.min(1, (i + 0.5) * step) * 100
          return (
            <button
              key={p.key}
              type="button"
              aria-label={`${fullMonth(p.key)} : ${formatAmount(p.amount)} encaissés`}
              onMouseEnter={() => setActive(i)}
              onFocus={() => setActive(i)}
              onBlur={() => setActive(null)}
              // Mobile : le toucher déclenche aussi mouseenter, donc on fixe sans basculer
              onClick={() => setActive(i)}
              style={{
                position: 'absolute', top: 0, bottom: 0, left: `${left}%`, width: `${right - left}%`,
                background: 'transparent', border: 'none', padding: 0, cursor: 'pointer',
              }}
            />
          )
        })}

        {/* Infobulle */}
        {activePoint && (
          <div
            role="tooltip"
            style={{
              position: 'absolute',
              left: `${activePct}%`,
              top: tipBelow ? activePoint.y + 14 : activePoint.y - 14,
              // Décalage proportionnel : collée à gauche au 1er mois, à droite au dernier,
              // centrée au milieu — reste dans le graphique même sur mobile
              transform: `translate(-${activePct}%, ${tipBelow ? '0' : '-100%'})`,
              background: 'white',
              border: '1px solid var(--brd2)',
              borderRadius: 10,
              boxShadow: '0 8px 24px rgba(28, 33, 48, 0.12)',
              padding: '10px 12px',
              fontSize: 12,
              color: 'var(--ink)',
              whiteSpace: 'nowrap',
              pointerEvents: 'none',
              zIndex: 5,
            }}
          >
            <div style={{ fontWeight: 700, marginBottom: 4, textTransform: 'capitalize' }}>{fullMonth(activePoint.key)}</div>
            <div>Encaissé : <strong>{formatAmount(activePoint.amount)}</strong> TTC</div>
            {activeProfit && (
              <div style={{ marginTop: 6, paddingTop: 6, borderTop: '1px solid var(--brd)', display: 'grid', gap: 2, color: 'var(--ink2)' }}>
                <div>CA HT : {formatAmount(activeProfit.caHt)}</div>
                {activeProfit.expensesHt > 0 && <div>Notes de frais : −{formatAmount(activeProfit.expensesHt)}</div>}
                {activeProfit.purchasesHt > 0 && <div>Achats (catalogue) : −{formatAmount(activeProfit.purchasesHt)}</div>}
                <div style={{ color: 'var(--ink)' }}>Marge : <strong>{formatAmount(activeProfit.marginHt)}</strong></div>
                {activeProfit.fixedCosts !== null && activeProfit.resultHt !== null && (
                  <>
                    <div>Charges fixes : −{formatAmount(activeProfit.fixedCosts)}</div>
                    <div style={{ fontWeight: 700, color: activeProfit.resultHt >= 0 ? 'var(--grn)' : 'var(--red)' }}>
                      {activeProfit.resultHt >= 0 ? 'Bénéfice' : 'Perte'} estimé{activeProfit.resultHt >= 0 ? '' : 'e'} : {signed(activeProfit.resultHt)}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        )}
      </div>
      {/* Mois sous leur point (un sur deux au-delà de 8 mois, en partant du mois en cours) */}
      <div className="b-chart-labels" style={{ position: 'relative', height: 16 }}>
        {points.map((p, i) => {
          if (data.length > 8 && (lastIdx - i) % 2 !== 0) return null
          const pct = (p.x / W) * 100
          return (
            <span
              key={p.key}
              style={{
                position: 'absolute',
                left: `${pct}%`,
                transform: `translateX(${i === 0 ? '0' : i === lastIdx ? '-100%' : '-50%'})`,
                ...(i === lastIdx || i === active ? { fontWeight: 700, color: 'var(--ink)' } : {}),
              }}
            >
              {p.label}
            </span>
          )
        })}
      </div>
      {footer}
    </div>
  )
}

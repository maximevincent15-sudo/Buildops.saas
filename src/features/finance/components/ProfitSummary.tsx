import { TrendingDown, TrendingUp } from 'lucide-react'
import { Link } from 'react-router-dom'
import { formatAmount } from '../../devis/constants'
import type { MonthProfit } from '../profit'

type Props = {
  profit: Map<string, MonthProfit>
  /** Mois affichés par le graphique, du plus ancien au mois en cours */
  monthKeys: string[]
}

function signed(value: number): string {
  return `${value > 0 ? '+' : ''}${formatAmount(value)}`
}

function Figure({ label, value, tone }: { label: string; value: string; tone?: 'up' | 'down' }) {
  const color = tone === 'up' ? 'var(--grn)' : tone === 'down' ? 'var(--red)' : 'var(--ink)'
  return (
    <div>
      <div style={{ fontSize: 11, color: 'var(--ink3)' }}>{label}</div>
      <div style={{ fontSize: 15, fontWeight: 700, color, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
        {tone === 'up' && <TrendingUp size={14} />}
        {tone === 'down' && <TrendingDown size={14} />}
        {value}
      </div>
    </div>
  )
}

/** Bénéfice ou perte estimés : mois en cours et cumul des 12 mois */
export function ProfitSummary({ profit, monthKeys }: Props) {
  const current = profit.get(monthKeys[monthKeys.length - 1] ?? '')
  if (!current) return null
  const months = monthKeys.map((k) => profit.get(k)).filter((m): m is MonthProfit => !!m)
  const marginYear = months.reduce((s, m) => s + m.marginHt, 0)
  const withResult = months.filter((m) => m.resultHt !== null)
  const hasFixed = current.fixedCosts !== null
  const resultYear = hasFixed ? withResult.reduce((s, m) => s + (m.resultHt ?? 0), 0) : null
  const tone = (v: number): 'up' | 'down' => (v >= 0 ? 'up' : 'down')

  return (
    <div style={{ marginTop: 18, paddingTop: 16, borderTop: '1px solid var(--brd)' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1.6rem', alignItems: 'flex-end' }}>
        <Figure label="Marge du mois (HT)" value={formatAmount(current.marginHt)} />
        {hasFixed && current.resultHt !== null && (
          <>
            <Figure label="Charges fixes du mois" value={`−${formatAmount(current.fixedCosts ?? 0)}`} />
            <Figure
              label={current.resultHt >= 0 ? 'Bénéfice estimé du mois' : 'Perte estimée du mois'}
              value={signed(current.resultHt)}
              tone={tone(current.resultHt)}
            />
          </>
        )}
        {resultYear !== null ? (
          <Figure label={`Résultat estimé sur ${withResult.length} mois`} value={signed(resultYear)} tone={tone(resultYear)} />
        ) : (
          <Figure label="Marge sur 12 mois (HT)" value={formatAmount(marginYear)} />
        )}
      </div>
      <p style={{ marginTop: 10, fontSize: 11.5, color: 'var(--ink3)' }}>
        {hasFixed
          ? 'Estimation : CA encaissé HT − notes de frais − achats (prix d\'achat du catalogue) − charges fixes. '
          : 'Marge : CA encaissé HT − notes de frais − achats (prix d\'achat du catalogue). '}
        {hasFixed ? (
          <Link to="/parametres#charges-fixes" style={{ color: 'var(--acc)' }}>Modifier mes charges fixes</Link>
        ) : (
          <Link to="/parametres#charges-fixes" style={{ color: 'var(--acc)', fontWeight: 600 }}>
            Renseigne tes charges fixes (salaires, loyer…) pour voir ton bénéfice ou ta perte →
          </Link>
        )}
      </p>
    </div>
  )
}

import { AlertTriangle, CheckCircle2, Clock, TrendingDown, TrendingUp, Wallet } from 'lucide-react'
import { formatAmount } from '../../devis/constants'
import type { BusinessStats } from '../businessStatsApi'

type Props = {
  stats: BusinessStats
}

function formatPct(v: number): string {
  const sign = v >= 0 ? '+' : ''
  return `${sign}${v.toFixed(0)}%`
}

export function BusinessKpis({ stats }: Props) {
  // Évolution % vs mois précédent
  let evolutionPct: number | null = null
  if (stats.caEncaissePrevMonth > 0) {
    evolutionPct = ((stats.caEncaisseMonth - stats.caEncaissePrevMonth) / stats.caEncaissePrevMonth) * 100
  } else if (stats.caEncaisseMonth > 0) {
    evolutionPct = 100
  }

  return (
    <div className="biz-kpis">
      {/* CA Encaissé du mois */}
      <div className="biz-kpi">
        <div className="biz-kpi-icon b-grn">
          <Wallet size={16} strokeWidth={2} />
        </div>
        <div className="biz-kpi-body">
          <div className="biz-kpi-label">CA encaissé (mois)</div>
          <div className="biz-kpi-value">{formatAmount(stats.caEncaisseMonth)}</div>
          <div className="biz-kpi-sub">
            {evolutionPct !== null ? (
              <span className={`biz-kpi-trend ${evolutionPct >= 0 ? 'up' : 'down'}`}>
                {evolutionPct >= 0 ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
                {formatPct(evolutionPct)} vs mois précédent
              </span>
            ) : (
              <span className="text-ink-3">Aucune donnée mois précédent</span>
            )}
          </div>
        </div>
      </div>

      {/* Impayés */}
      <div className="biz-kpi">
        <div className="biz-kpi-icon b-org">
          <Clock size={16} strokeWidth={2} />
        </div>
        <div className="biz-kpi-body">
          <div className="biz-kpi-label">Impayés</div>
          <div className="biz-kpi-value">{formatAmount(stats.caImpaye)}</div>
          <div className="biz-kpi-sub">Reste à encaisser sur factures envoyées</div>
        </div>
      </div>

      {/* En retard */}
      <div className="biz-kpi">
        <div className="biz-kpi-icon b-red">
          <AlertTriangle size={16} strokeWidth={2} />
        </div>
        <div className="biz-kpi-body">
          <div className="biz-kpi-label">En retard</div>
          <div className="biz-kpi-value text-red">{formatAmount(stats.caEnRetard)}</div>
          <div className="biz-kpi-sub">Factures dépassant l'échéance</div>
        </div>
      </div>

      {/* Taux d'acceptation devis */}
      <div className="biz-kpi">
        <div className="biz-kpi-icon b-acc">
          <CheckCircle2 size={16} strokeWidth={2} />
        </div>
        <div className="biz-kpi-body">
          <div className="biz-kpi-label">Acceptation devis</div>
          <div className="biz-kpi-value">
            {stats.acceptanceRate === null ? '—' : `${stats.acceptanceRate.toFixed(0)}%`}
          </div>
          <div className="biz-kpi-sub">
            {stats.acceptanceTotal === 0
              ? 'Aucun devis avec retour client'
              : `${stats.acceptanceTotal} devis avec retour`}
            {stats.averagePaymentDays !== null && (
              <span className="text-ink-3">
                {' · '}paiement {stats.averagePaymentDays.toFixed(0)}j en moyenne
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

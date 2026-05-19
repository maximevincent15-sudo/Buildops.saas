import type { BusinessStats } from '../businessStatsApi'
import { AnimatedCounter } from './AnimatedCounter'

type Props = { stats: BusinessStats }

function pctEvolution(curr: number, prev: number): { value: number; isUp: boolean } | null {
  if (prev <= 0) return null
  const delta = ((curr - prev) / prev) * 100
  return { value: Math.abs(delta), isUp: delta >= 0 }
}

const currentMonthLabel = (() => {
  const d = new Date()
  return d.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })
})()

function capitalize(s: string) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s
}

/**
 * HeroStats — Bandeau hero banking-style (vibe Mercury / Stripe).
 *
 * 4 colonnes :
 *  - CA encaissé du mois (en énorme, sparkline + évolution vs mois précédent)
 *  - À facturer (factures non émises sur interventions terminées)
 *  - Impayés J+30 (factures en retard de paiement)
 *  - Acceptation devis (% sur 90j glissants)
 *
 * Animations : count-up smooth au chargement, effet cascade (50ms entre chaque).
 */
export function HeroStats({ stats }: Props) {
  const evolution = pctEvolution(stats.caEncaisseMonth, stats.caEncaissePrevMonth)
  const acceptance = stats.acceptanceRate ?? 0
  const hasNoEvolution = evolution === null

  return (
    <div className="b-hero-stats">
      {/* COL 1 : CA encaissé (hero) */}
      <div>
        <div className="b-hs-lbl">CA encaissé · {capitalize(currentMonthLabel)}</div>
        <div className="b-hs-val">
          <AnimatedCounter value={stats.caEncaisseMonth} duration={1.1} suffix=" €" />
        </div>
        {!hasNoEvolution ? (
          <div
            className="b-hs-trend"
            style={{ color: evolution.isUp ? 'var(--grn)' : 'var(--red)' }}
          >
            <span>
              {evolution.isUp ? '↗' : '↘'} {evolution.value.toFixed(1)} % vs mois précédent
            </span>
            {/*
              Sparkline avec couleur dynamique. Si ↘ on inverse les barres
              pour suggérer la descente visuellement, et on les passe en rouge.
            */}
            <div
              className="b-spark"
              style={{
                ['--spark-color' as string]: evolution.isUp ? 'var(--grn)' : 'var(--red)',
                transform: evolution.isUp ? 'none' : 'scaleX(-1)',
              }}
            >
              <span></span><span></span><span></span><span></span><span></span><span></span><span></span>
            </div>
          </div>
        ) : (
          <div className="b-hs-sub" style={{ marginTop: 10 }}>
            Premier mois facturé
          </div>
        )}
      </div>

      {/* COL 2 : À facturer (toujours nul pour le moment, en attendant ce KPI) */}
      <div className="b-hs-side">
        <div className="b-hs-lbl">À facturer</div>
        <div className="b-hs-val">
          <AnimatedCounter value={0} duration={0.9} delay={0.05} suffix=" €" />
        </div>
        <div className="b-hs-sub">Interventions terminées</div>
      </div>

      {/* COL 3 : Impayés J+30 */}
      <div className="b-hs-side">
        <div className="b-hs-lbl">Impayés J+30</div>
        <div
          className="b-hs-val"
          style={{ color: stats.caEnRetard > 0 ? 'var(--red)' : 'var(--grn)' }}
        >
          <AnimatedCounter value={stats.caEnRetard} duration={0.9} delay={0.1} suffix=" €" />
        </div>
        <div className={`b-hs-sub${stats.caEnRetard === 0 ? ' ok' : ''}`}>
          {stats.caEnRetard === 0 ? '✓ Aucun retard' : 'Factures en retard'}
        </div>
      </div>

      {/* COL 4 : Acceptation devis */}
      <div className="b-hs-side">
        <div className="b-hs-lbl">Acceptation devis</div>
        <div className="b-hs-val">
          <AnimatedCounter
            value={acceptance}
            duration={0.9}
            delay={0.15}
            decimals={0}
            suffix=" %"
          />
        </div>
        <div className="b-hs-sub">{stats.acceptanceTotal} devis · 90 jours</div>
      </div>
    </div>
  )
}

import { AnimatedCounter } from './AnimatedCounter'

type Props = {
  label: string
  value: string
  /** Si fournie, anime le compteur de 0 vers cette valeur. Sinon, affiche `value` brut. */
  numericValue?: number
  /** Suffixe pour le count-up (ex: " €", " %"). */
  numericSuffix?: string
  /** Délai avant l'animation (effet cascade). */
  delay?: number
  sub: string
  subVariant?: 'up' | 'dn' | 'nu'
  /** Anciennement utilisé : on garde l'API pour compat. */
  barPct?: number
  /** Anciennement utilisé : on garde l'API pour compat. */
  barColor?: 'acc' | 'red' | 'grn' | 'brn'
}

/**
 * KpiCard v2 — Direction B Premium aéré.
 *
 * Gros chiffres aérés (38px Syne ExtraBold), labels en uppercase tracking,
 * sub avec icônes ↗/↘ pour évolution. Pas de barre de progression (épuré).
 *
 * Animations : count-up smooth si `numericValue` fourni.
 */
export function KpiCard({
  label,
  value,
  numericValue,
  numericSuffix,
  delay,
  sub,
  subVariant = 'nu',
}: Props) {
  return (
    <div className="b-kpi">
      <div className="b-kpi-lbl">{label}</div>
      <div className="b-kpi-val">
        {typeof numericValue === 'number' ? (
          <AnimatedCounter value={numericValue} delay={delay} suffix={numericSuffix} />
        ) : (
          value
        )}
      </div>
      <div className={`b-kpi-sub${subVariant !== 'nu' ? ' ' + subVariant : ''}`}>{sub}</div>
    </div>
  )
}

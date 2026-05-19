import { animate } from 'framer-motion'
import { useEffect, useRef } from 'react'

type Props = {
  /** Valeur cible (number). */
  value: number
  /** Durée de l'animation en secondes. Par défaut 0.9s. */
  duration?: number
  /** Délai avant démarrage (effet cascade). */
  delay?: number
  /** Formate le nombre (ex: 12450 → "12 450"). Par défaut Intl.NumberFormat('fr-FR'). */
  format?: (n: number) => string
  /** Préfixe / suffixe optionnels (ex: "€", "%", " interv."). */
  prefix?: string
  suffix?: string
  /** Nombre de décimales (par défaut 0). */
  decimals?: number
  /** Classe CSS sur le span. */
  className?: string
}

/**
 * AnimatedCounter — Compteur animé count-up smooth.
 *
 * Au montage / changement de valeur, anime de 0 (ou ancienne valeur) vers la
 * nouvelle valeur avec un easing « ease-out » naturel. Très utilisé pour les
 * KPI au chargement du dashboard (donne un côté « système vivant »).
 *
 * Style premium type Linear / Mercury / Stripe.
 */
export function AnimatedCounter({
  value,
  duration = 0.9,
  delay = 0,
  format,
  prefix = '',
  suffix = '',
  decimals = 0,
  className,
}: Props) {
  const ref = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    const node = ref.current
    if (!node) return

    const fmt = format ?? ((n: number) => {
      return new Intl.NumberFormat('fr-FR', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      }).format(n)
    })

    const controls = animate(0, value, {
      duration,
      delay,
      ease: [0.16, 1, 0.3, 1], // ease-out fluide
      onUpdate(latest) {
        if (!node) return
        node.textContent = `${prefix}${fmt(latest)}${suffix}`
      },
    })

    return () => controls.stop()
  }, [value, duration, delay, format, prefix, suffix, decimals])

  // Initial render : valeur formatée sans animation pour SSR / fallback
  const initialText = `${prefix}${(format ?? ((n: number) =>
    new Intl.NumberFormat('fr-FR', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(n)))(0)}${suffix}`

  return <span ref={ref} className={className}>{initialText}</span>
}

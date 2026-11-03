import type { CSSProperties } from 'react'

/** Couleur des interventions au planning : par type d'équipement ou par statut */
export type PlanningColorMode = 'type' | 'status'

const COLOR_MODE_STORAGE_KEY = 'firovia_planning_colors'

export function readStoredColorMode(): PlanningColorMode {
  try {
    const v = localStorage.getItem(COLOR_MODE_STORAGE_KEY)
    if (v === 'type' || v === 'status') return v
  } catch {
    // stockage indisponible (navigation privée…) : réglage par défaut
  }
  return 'type'
}

export function storeColorMode(mode: PlanningColorMode): void {
  try {
    localStorage.setItem(COLOR_MODE_STORAGE_KEY, mode)
  } catch {
    // stockage indisponible : le choix vaut pour cette visite
  }
}

/** Une couleur par type d'équipement (mêmes teintes que les étiquettes EXT, RIA, BAES…) */
export const TYPE_COLORS: Record<string, { label: string; strong: string; light: string }> = {
  extincteurs: { label: 'Extincteurs', strong: '#B5443F', light: '#FBEEEE' },
  ria: { label: 'RIA', strong: '#3A5CA8', light: '#EEF2FA' },
  baes: { label: 'BAES', strong: '#C4961A', light: '#FDF7E4' },
  desenfumage: { label: 'Désenfumage', strong: '#8A7356', light: '#F5F2EC' },
  portes_cf: { label: 'Portes coupe-feu', strong: '#B0632F', light: '#FAF0E8' },
  ssi: { label: 'SSI', strong: '#6E4FA3', light: '#F3EFF9' },
  colonnes_seches: { label: 'Colonnes sèches', strong: '#2F7F8C', light: '#ECF6F7' },
  extinction_auto: { label: 'Extinction auto', strong: '#2E7D5E', light: '#EDF6F1' },
}

/**
 * Style d'une intervention colorée par type : bande à gauche (une couleur par
 * type, empilées s'il y en a plusieurs) et fond clair du premier type. Une
 * intervention terminée est atténuée.
 */
export function typeColorStyle(
  types: string[] | null | undefined,
  status: string,
  stripeWidth = 3,
): CSSProperties {
  const colors = (types ?? []).map((t) => TYPE_COLORS[t]).filter((c) => !!c)
  if (colors.length === 0) return status === 'terminee' ? { opacity: 0.6 } : {}
  const step = 100 / colors.length
  const stops = colors.map((c, k) => `${c.strong} ${k * step}% ${(k + 1) * step}%`).join(', ')
  return {
    borderLeftStyle: 'solid',
    borderLeftWidth: stripeWidth,
    borderLeftColor: 'transparent',
    background: `linear-gradient(to bottom, ${stops}) left top / ${stripeWidth}px 100% no-repeat border-box, ${colors[0]!.light}`,
    color: 'var(--ink)',
    ...(status === 'terminee' ? { opacity: 0.6 } : {}),
  }
}

import { useCallback, useEffect, useState } from 'react'
import { useAuthStore } from '../features/auth/store'
import { ActivityFeed } from '../features/dashboard/components/ActivityFeed'
import { AlertsList } from '../features/dashboard/components/AlertsList'
import { KpiCard } from '../features/dashboard/components/KpiCard'
import { RecentInterventions } from '../features/dashboard/components/RecentInterventions'
import { RevenueBars } from '../features/dashboard/components/RevenueBars'
import { TechsOfDay } from '../features/dashboard/components/TechsOfDay'
import { getInterventionStats } from '../features/planning/api'
import type { InterventionStats } from '../features/planning/api'
import { InterventionModal } from '../features/planning/components/InterventionModal'

function capitalize(s: string) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s
}

function visualPct(value: number): number {
  // Remplissage visuel de la barre : 10% minimum, 100% à partir de 10 interv.
  if (value <= 0) return 10
  return Math.min(100, value * 10)
}

export function DashboardPage() {
  const profile = useAuthStore((s) => s.profile)
  const firstName = capitalize(profile?.first_name ?? '') || 'là'
  const [modalOpen, setModalOpen] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)
  const [stats, setStats] = useState<InterventionStats | null>(null)

  const loadStats = useCallback(async () => {
    try {
      const s = await getInterventionStats()
      setStats(s)
    } catch (err) {
      console.error('Erreur chargement stats', err)
    }
  }, [])

  useEffect(() => {
    void loadStats()
  }, [loadStats, refreshKey])

  return (
    <>
      <div className="dash-top">
        <div>
          <div className="dash-title">Bonjour, {firstName}</div>
          <div className="dash-sub">Tableau de bord maintenance incendie</div>
        </div>
        <div className="dash-acts">
          <button type="button" className="btn-sm" onClick={() => setModalOpen(true)}>
            + Nouvelle intervention
          </button>
          <button type="button" className="btn-sm acc">+ Nouveau rapport</button>
        </div>
      </div>

      <div className="kpi-grid">
        <KpiCard
          label="Interventions ce mois"
          value={stats ? String(stats.thisMonth) : '…'}
          sub="Créées depuis le 1er du mois"
          subVariant="nu"
          barPct={stats ? visualPct(stats.thisMonth) : 10}
          barColor="acc"
        />
        <KpiCard
          label="À planifier"
          value={stats ? String(stats.aPlanifier) : '…'}
          sub={stats && stats.aPlanifier > 0 ? 'Interventions sans date' : 'Tout est planifié'}
          subVariant={stats && stats.aPlanifier > 0 ? 'dn' : 'up'}
          barPct={stats ? visualPct(stats.aPlanifier) : 10}
          barColor={stats && stats.aPlanifier > 0 ? 'red' : 'grn'}
        />
        <KpiCard
          label="En cours"
          value={stats ? String(stats.enCours) : '…'}
          sub="Sur le terrain"
          subVariant="nu"
          barPct={stats ? visualPct(stats.enCours) : 10}
          barColor="acc"
        />
        <KpiCard
          label="Terminées ce mois"
          value={stats ? String(stats.termineeThisMonth) : '…'}
          sub="Rapports clôturés"
          subVariant="up"
          barPct={stats ? visualPct(stats.termineeThisMonth) : 10}
          barColor="grn"
        />
      </div>

      <div className="g2">
        <RevenueBars />
        <AlertsList key={`al-${refreshKey}`} />
      </div>

      <div className="g3">
        <RecentInterventions key={`ri-${refreshKey}`} />
        <TechsOfDay key={`td-${refreshKey}`} />
      </div>

      <ActivityFeed />

      <InterventionModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onChanged={() => setRefreshKey((k) => k + 1)}
      />
    </>
  )
}

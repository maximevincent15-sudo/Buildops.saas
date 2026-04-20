import { useState } from 'react'
import { useAuthStore } from '../features/auth/store'
import { ActivityFeed } from '../features/dashboard/components/ActivityFeed'
import { AlertsList } from '../features/dashboard/components/AlertsList'
import { KpiCard } from '../features/dashboard/components/KpiCard'
import { RecentInterventions } from '../features/dashboard/components/RecentInterventions'
import { RevenueBars } from '../features/dashboard/components/RevenueBars'
import { TechsOfDay } from '../features/dashboard/components/TechsOfDay'
import { InterventionModal } from '../features/planning/components/InterventionModal'

function capitalize(s: string) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s
}

export function DashboardPage() {
  const profile = useAuthStore((s) => s.profile)
  const firstName = capitalize(profile?.first_name ?? '') || 'là'
  const [modalOpen, setModalOpen] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)

  return (
    <>
      <div className="dash-top">
        <div>
          <div className="dash-title">Bonjour, {firstName} 👋</div>
          <div className="dash-sub">Tableau de bord maintenance incendie — avril 2026</div>
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
          value="47"
          sub="↑ +8 vs mars"
          subVariant="up"
          barPct={78}
          barColor="acc"
        />
        <KpiCard
          label="Alertes réglementaires"
          value="4"
          sub="À planifier urgemment"
          subVariant="dn"
          barPct={30}
          barColor="red"
        />
        <KpiCard
          label="Taux de conformité"
          value="94%"
          sub="↑ +2% vs mars"
          subVariant="up"
          barPct={94}
          barColor="grn"
        />
        <KpiCard
          label="CA avril"
          value="31 400 €"
          sub="Objectif : 35k €"
          subVariant="nu"
          barPct={62}
          barColor="brn"
        />
      </div>

      <div className="g2">
        <RevenueBars />
        <AlertsList />
      </div>

      <div className="g3">
        <RecentInterventions key={refreshKey} />
        <TechsOfDay />
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

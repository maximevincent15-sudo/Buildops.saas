import { ActivityFeed } from '../features/dashboard/components/ActivityFeed'
import { AlertsList } from '../features/dashboard/components/AlertsList'
import { KpiCard } from '../features/dashboard/components/KpiCard'
import { RecentInterventions } from '../features/dashboard/components/RecentInterventions'
import { RevenueBars } from '../features/dashboard/components/RevenueBars'
import { TechsOfDay } from '../features/dashboard/components/TechsOfDay'

export function DashboardPage() {
  return (
    <>
      <div className="dash-top">
        <div>
          <div className="dash-title">Bonjour, Thomas 👋</div>
          <div className="dash-sub">Tableau de bord maintenance incendie — avril 2026</div>
        </div>
        <div className="dash-acts">
          <button className="btn-sm">+ Nouvelle intervention</button>
          <button className="btn-sm acc">+ Nouveau rapport</button>
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
        <RecentInterventions />
        <TechsOfDay />
      </div>

      <ActivityFeed />
    </>
  )
}

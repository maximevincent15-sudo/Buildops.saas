import { useCallback, useEffect, useState } from 'react'
import { useAuthStore } from '../features/auth/store'
import { ActivityFeed } from '../features/dashboard/components/ActivityFeed'
import { AlertsList } from '../features/dashboard/components/AlertsList'
import { BusinessKpis } from '../features/dashboard/components/BusinessKpis'
import { DailyBriefing } from '../features/dashboard/components/DailyBriefing'
import { KpiCard } from '../features/dashboard/components/KpiCard'
import { MonthlyRevenueChart } from '../features/dashboard/components/MonthlyRevenueChart'
import { RecentInterventions } from '../features/dashboard/components/RecentInterventions'
import { RevenueBars } from '../features/dashboard/components/RevenueBars'
import { TechsOfDay } from '../features/dashboard/components/TechsOfDay'
import { TopBarsChart } from '../features/dashboard/components/TopBarsChart'
import { fetchBusinessStatsSafe } from '../features/dashboard/businessStatsApi'
import type { BusinessStats } from '../features/dashboard/businessStatsApi'
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
  const [bizStats, setBizStats] = useState<BusinessStats | null>(null)

  const loadStats = useCallback(async () => {
    try {
      const s = await getInterventionStats()
      setStats(s)
    } catch (err) {
      console.error('Erreur chargement stats', err)
    }
  }, [])

  const loadBizStats = useCallback(async () => {
    try {
      const s = await fetchBusinessStatsSafe()
      setBizStats(s)
    } catch (err) {
      console.error('Erreur chargement stats business', err)
    }
  }, [])

  useEffect(() => {
    void loadStats()
    void loadBizStats()
  }, [loadStats, loadBizStats, refreshKey])

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

      <DailyBriefing key={`br-${refreshKey}`} />

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

      {/* SECTION BUSINESS — KPIs CA, top clients, top techs, évolution */}
      {bizStats && (
        <>
          <div className="biz-section-title">
            <span>Pilotage business</span>
            <span className="text-ink-3 text-xs font-light">
              KPIs calculés à partir de tes devis et factures
            </span>
          </div>

          <BusinessKpis stats={bizStats} />

          <div className="g2">
            <TopBarsChart
              title="Top 5 clients"
              subtitle="Par CA facturé"
              items={bizStats.topClients}
              emptyMessage="Aucune facture émise. Crée une facture pour voir tes meilleurs clients."
              barColor="var(--acc)"
            />
            <TopBarsChart
              title="Top 5 techniciens"
              subtitle="Par CA facturé sur leurs interventions"
              items={bizStats.topTechnicians}
              emptyMessage="Aucune facture liée à une intervention avec technicien assigné."
              barColor="var(--grn)"
            />
          </div>

          <MonthlyRevenueChart
            title="Évolution du CA encaissé"
            data={bizStats.monthlyRevenue}
          />
        </>
      )}

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

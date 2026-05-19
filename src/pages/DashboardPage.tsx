import { Plus, FileText } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { useAuthStore } from '../features/auth/store'
import { ActivityFeed } from '../features/dashboard/components/ActivityFeed'
import { AlertsList } from '../features/dashboard/components/AlertsList'
import { DailyBriefing } from '../features/dashboard/components/DailyBriefing'
import { HeroStats } from '../features/dashboard/components/HeroStats'
import { KpiCard } from '../features/dashboard/components/KpiCard'
import { MonthlyRevenueChart } from '../features/dashboard/components/MonthlyRevenueChart'
import { RecentInterventions } from '../features/dashboard/components/RecentInterventions'
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

const todayLabel = (() => {
  const d = new Date()
  return d.toLocaleDateString('fr-FR', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  })
})()

/**
 * DashboardPage — Direction B "Premium aéré" (Mercury vibe).
 *
 * Structure :
 *  1. Header (greeting + date + actions)
 *  2. DailyBriefing (dark card, point focal)
 *  3. HeroStats (banner banking-style avec CA en hero)
 *  4. Section "Activité du jour" (4 KPIs interventions)
 *  5. Section grid-2 (interventions récentes + alertes)
 *  6. Section "Pilotage business" (BusinessKpis + Top clients/techs + Chart)
 *  7. Section grid-2 (Techs of day + Activity feed)
 */
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
      {/* ─── HEADER ─── */}
      <div className="b-h-row">
        <div>
          <div className="b-h-greet">{capitalize(todayLabel)}</div>
          <div className="b-h-title">Bonjour, {firstName}</div>
          <div className="b-h-sub">
            {stats && (
              <>
                {stats.aPlanifier > 0
                  ? `${stats.aPlanifier} intervention${stats.aPlanifier > 1 ? 's' : ''} à planifier · `
                  : 'Tout est planifié · '}
                {stats.enCours} sur le terrain · {stats.thisMonth} intervention{stats.thisMonth > 1 ? 's' : ''} ce mois
              </>
            )}
          </div>
        </div>
        <div className="b-h-acts">
          <button type="button" className="b-btn" onClick={() => setModalOpen(true)}>
            <Plus size={14} strokeWidth={2} />
            Nouvelle intervention
          </button>
          <button type="button" className="b-btn acc">
            <FileText size={14} strokeWidth={2} />
            Nouveau rapport
          </button>
        </div>
      </div>

      {/* ─── BRIEFING (dark card) ─── */}
      <DailyBriefing key={`br-${refreshKey}`} />

      {/* ─── HERO STATS (banking banner) ─── */}
      {bizStats && <HeroStats stats={bizStats} />}

      {/* ─── ACTIVITÉ DU JOUR (4 KPIs interventions) ─── */}
      <div className="b-section">
        <div className="b-section-head">
          <div>
            <div className="b-section-h">Activité du jour</div>
            <div className="b-section-s">Vue d'ensemble des interventions</div>
          </div>
        </div>

        <div className="b-kpi-grid">
          <KpiCard
            label="Interventions ce mois"
            value={stats ? String(stats.thisMonth) : '…'}
            numericValue={stats?.thisMonth}
            delay={0}
            sub="Créées depuis le 1er"
          />
          <KpiCard
            label="À planifier"
            value={stats ? String(stats.aPlanifier) : '…'}
            numericValue={stats?.aPlanifier}
            delay={0.05}
            sub={stats && stats.aPlanifier > 0 ? 'Sans date' : '✓ Tout est planifié'}
            subVariant={stats && stats.aPlanifier > 0 ? 'dn' : 'up'}
          />
          <KpiCard
            label="En cours"
            value={stats ? String(stats.enCours) : '…'}
            numericValue={stats?.enCours}
            delay={0.1}
            sub="Sur le terrain"
          />
          <KpiCard
            label="Terminées (mois)"
            value={stats ? String(stats.termineeThisMonth) : '…'}
            numericValue={stats?.termineeThisMonth}
            delay={0.15}
            sub="Rapports clôturés"
            subVariant="up"
          />
        </div>
      </div>

      {/* ─── INTERVENTIONS RÉCENTES + ALERTES ─── */}
      <div className="b-section">
        <div className="b-grid-2">
          <RecentInterventions key={`ri-${refreshKey}`} />
          <AlertsList key={`al-${refreshKey}`} />
        </div>
      </div>

      {/* ─── ÉVOLUTION DU CA (chart full-width) ─── */}
      {bizStats && (
        <div className="b-section">
          <MonthlyRevenueChart
            title="Évolution du CA encaissé"
            data={bizStats.monthlyRevenue}
          />
        </div>
      )}

      {/* ─── PILOTAGE BUSINESS — Top clients + Top techs ─── */}
      {bizStats && (
        <div className="b-section">
          <div className="b-section-head">
            <div>
              <div className="b-section-h">Pilotage business</div>
              <div className="b-section-s">Top clients et top techniciens par CA facturé</div>
            </div>
          </div>
          <div className="b-grid-2">
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
        </div>
      )}

      {/* ─── ÉQUIPE + ACTIVITÉ RÉCENTE ─── */}
      <div className="b-section">
        <div className="b-grid-2">
          <TechsOfDay key={`td-${refreshKey}`} />
          <ActivityFeed />
        </div>
      </div>

      <InterventionModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onChanged={() => setRefreshKey((k) => k + 1)}
      />
    </>
  )
}

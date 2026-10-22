import {
  AlertTriangle,
  Archive,
  Bell,
  BookOpen,
  Boxes,
  Building2,
  CalendarDays,
  ClipboardCheck,
  CreditCard,
  FileSignature,
  HardHat,
  LayoutDashboard,
  LogOut,
  Receipt,
  Settings,
  Users,
  Wallet,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useEffect, useState } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { classifyAlert, computeRegulatoryAlerts } from '../../alertes/api'
import { countActiveAnomalies } from '../../anomalies/api'
import { signOut } from '../../auth/api'
import { fetchContractAlerts, isUrgentContractAlert } from '../../contrats/alerts'
import type { ContractAlert } from '../../contrats/alerts'
import { useAuthStore } from '../../auth/store'
import { listExpenses } from '../../expenses/api'
import { listOvertime } from '../../overtime/api'
import { listInterventions } from '../../planning/api'
import { computeVehicleAlerts } from '../../vehicles/api'
import { listInvoices } from '../../factures/api'
import { effectiveStatus } from '../../factures/constants'
import { useModuleEnabled } from '../../parametres/modules'
import type { OptionalModule } from '../../parametres/modules'

type NavItem = { to: string; Icon: LucideIcon; label: string; badgeKey?: BadgeKey; danger?: boolean; module?: OptionalModule }
type BadgeKey = 'planning' | 'rapports' | 'alertes' | 'anomalies' | 'rh' | 'factures'

type Counts = Record<BadgeKey, number>

const principal: NavItem[] = [
  { to: '/dashboard', Icon: LayoutDashboard, label: 'Tableau de bord' },
  { to: '/planning', Icon: CalendarDays, label: 'Planning', badgeKey: 'planning' },
  { to: '/rapports', Icon: ClipboardCheck, label: 'Rapports', badgeKey: 'rapports' },
  { to: '/anomalies', Icon: AlertTriangle, label: 'Anomalies', badgeKey: 'anomalies', danger: true },
  { to: '/alertes', Icon: Bell, label: 'Alertes', badgeKey: 'alertes', danger: true },
]

const clients: NavItem[] = [
  { to: '/clients', Icon: Building2, label: 'Fiches clients' },
  { to: '/equipements', Icon: Boxes, label: 'Équipements' },
  { to: '/contrats', Icon: FileSignature, label: 'Contrats', module: 'contrats' },
]

const rh: NavItem[] = [
  { to: '/techniciens', Icon: HardHat, label: 'Techniciens', badgeKey: 'rh' },
]

const facturation: NavItem[] = [
  { to: '/devis', Icon: Wallet, label: 'Devis', module: 'devis' },
  { to: '/factures', Icon: Receipt, label: 'Factures', badgeKey: 'factures', module: 'factures' },
  { to: '/catalogue', Icon: BookOpen, label: 'Catalogue', module: 'catalogue' },
]

const documents: NavItem[] = [
  { to: '/archivage', Icon: Archive, label: 'Archivage' },
]

const compte: NavItem[] = [
  { to: '/abonnement', Icon: CreditCard, label: 'Abonnement' },
  { to: '/parametres', Icon: Settings, label: 'Paramètres' },
]

// Section visible uniquement pour les emails Firovia (founder + associés).
// Cohérent avec la whitelist de la RPC admin_list_prospects().
const founder: NavItem[] = [
  { to: '/admin/prospects', Icon: Users, label: 'Prospects' },
]
const FOUNDER_EMAILS = new Set(['contact@firovia.fr', 'maximevincent15@gmail.com'])

function navClass({ isActive }: { isActive: boolean }) {
  return `b-sb-a${isActive ? ' on' : ''}`
}

function SidebarLink({ item, counts }: { item: NavItem; counts: Counts }) {
  const { Icon } = item
  const badge = item.badgeKey ? counts[item.badgeKey] : 0
  return (
    <NavLink to={item.to} className={navClass} end={item.to === '/dashboard'}>
      <Icon size={17} strokeWidth={1.8} />
      {item.label}
      {badge > 0 && (
        <span className={`b-sb-badge${item.danger ? ' r' : ''}`}>{badge}</span>
      )}
    </NavLink>
  )
}

function initialsFromEmail(email?: string) {
  if (!email) return '??'
  const local = email.split('@')[0] ?? ''
  const parts = local.split(/[._-]/).filter(Boolean)
  if (parts.length >= 2) return (parts[0]![0]! + parts[1]![0]!).toUpperCase()
  return local.slice(0, 2).toUpperCase()
}

function cap(s: string) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s
}

/** open : menu déplié sur mobile / tablette (≤ 1024 px), via le bouton ☰ du TopNav */
export function Sidebar({ open = false }: { open?: boolean }) {
  const navigate = useNavigate()
  const location = useLocation()
  const user = useAuthStore((s) => s.user)
  const profile = useAuthStore((s) => s.profile)
  const [counts, setCounts] = useState<Counts>({ planning: 0, rapports: 0, alertes: 0, anomalies: 0, rh: 0, factures: 0 })
  const moduleEnabled = useModuleEnabled()
  const contratsEnabled = moduleEnabled('contrats')
  // Mode terrain : les modules masqués disparaissent du menu
  const visible = (items: NavItem[]) => items.filter((i) => !i.module || moduleEnabled(i.module))
  const facturationItems = visible(facturation)

  useEffect(() => {
    let alive = true
    const safeInvoices = listInvoices().catch(() => [])
    const safeAnomalies = countActiveAnomalies().catch(() => 0)
    const safeContractAlerts = contratsEnabled
      ? fetchContractAlerts().catch(() => [] as ContractAlert[])
      : Promise.resolve([] as ContractAlert[])
    Promise.all([
      listInterventions(),
      computeRegulatoryAlerts(),
      listExpenses(),
      listOvertime(),
      computeVehicleAlerts(),
      safeInvoices,
      safeAnomalies,
      safeContractAlerts,
    ])
      .then(([all, alerts, expenses, overtime, vehicleAlerts, invoices, anomaliesCount, contractAlerts]) => {
        if (!alive) return
        const planning = all.filter((i) => i.status === 'a_planifier' || i.status === 'planifiee').length
        const rapports = all.filter((i) => i.status === 'en_cours').length
        const urgent = (days: number) => {
          const sev = classifyAlert(days)
          return sev === 'overdue' || sev === 'urgent'
        }
        const alertesUrgent =
          alerts.filter((a) => urgent(a.daysUntilDue)).length +
          vehicleAlerts.filter((a) => urgent(a.daysUntilDue)).length +
          contractAlerts.filter(isUrgentContractAlert).length
        const rh =
          expenses.filter((e) => e.status === 'pending').length +
          overtime.filter((o) => o.status === 'pending').length
        const factures = invoices.filter((inv) => {
          const eff = effectiveStatus(
            inv.status,
            inv.due_date,
            Number(inv.amount_paid ?? 0),
            Number(inv.total_ttc ?? 0),
          )
          return eff === 'sent' || eff === 'partially_paid' || eff === 'overdue'
        }).length
        setCounts({ planning, rapports, alertes: alertesUrgent, anomalies: anomaliesCount, rh, factures })
      })
      .catch(() => { /* silent ignore */ })
    return () => { alive = false }
  }, [location.pathname, contratsEnabled])

  async function handleSignOut() {
    await signOut()
    navigate('/auth', { replace: true })
  }

  const email = user?.email
  const firstName = profile?.first_name ?? ''
  const lastName = profile?.last_name ?? ''
  const orgName = profile?.organizations?.name
  const fullName = (firstName || lastName) ? `${cap(firstName)} ${cap(lastName)}`.trim() : email
  const initials = firstName && lastName
    ? (firstName[0]! + lastName[0]!).toUpperCase()
    : initialsFromEmail(email)

  const isAdmin = (profile?.user_role ?? 'admin') === 'admin'

  return (
    <aside className={`b-sidebar${open ? ' open' : ''}`}>
      <div className="b-sb-sec">Principal</div>
      {principal.map((i) => <SidebarLink key={i.to} item={i} counts={counts} />)}

      <div className="b-sb-sec">Clients</div>
      {visible(clients).map((i) => <SidebarLink key={i.to} item={i} counts={counts} />)}

      <div className="b-sb-sec">RH / Paie</div>
      {rh.map((i) => <SidebarLink key={i.to} item={i} counts={counts} />)}

      {isAdmin && facturationItems.length > 0 && (
        <>
          <div className="b-sb-sec">Facturation</div>
          {facturationItems.map((i) => <SidebarLink key={i.to} item={i} counts={counts} />)}
        </>
      )}

      <div className="b-sb-sec">Documents</div>
      {documents.map((i) => <SidebarLink key={i.to} item={i} counts={counts} />)}

      <div className="b-sb-sec">Compte</div>
      {compte.map((i) => <SidebarLink key={i.to} item={i} counts={counts} />)}

      {email && FOUNDER_EMAILS.has(email) && (
        <>
          <div className="b-sb-sec">Firovia</div>
          {founder.map((i) => <SidebarLink key={i.to} item={i} counts={counts} />)}
        </>
      )}

      <div className="b-sb-foot">
        <div className="b-sb-av">{initials}</div>
        <div className="b-sb-uinfo">
          <div className="b-sb-un">{fullName ?? '—'}</div>
          <div className="b-sb-ur">{orgName ?? 'Compte connecté'}</div>
        </div>
        <button type="button" onClick={handleSignOut} className="b-sb-out" title="Déconnexion">
          <LogOut size={15} strokeWidth={1.8} />
        </button>
      </div>
    </aside>
  )
}

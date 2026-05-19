import {
  Archive,
  Bell,
  Building2,
  CalendarDays,
  ClipboardCheck,
  HardHat,
  LayoutDashboard,
  LogOut,
  Receipt,
  Settings,
  Wallet,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useEffect, useState } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { classifyAlert, computeRegulatoryAlerts } from '../../alertes/api'
import { signOut } from '../../auth/api'
import { useAuthStore } from '../../auth/store'
import { listExpenses } from '../../expenses/api'
import { listOvertime } from '../../overtime/api'
import { listInterventions } from '../../planning/api'
import { computeVehicleAlerts } from '../../vehicles/api'
import { listInvoices } from '../../factures/api'
import { effectiveStatus } from '../../factures/constants'

type NavItem = { to: string; Icon: LucideIcon; label: string; badgeKey?: BadgeKey; danger?: boolean }
type BadgeKey = 'planning' | 'rapports' | 'alertes' | 'rh' | 'factures'

type Counts = Record<BadgeKey, number>

const principal: NavItem[] = [
  { to: '/dashboard', Icon: LayoutDashboard, label: 'Tableau de bord' },
  { to: '/planning', Icon: CalendarDays, label: 'Planning', badgeKey: 'planning' },
  { to: '/rapports', Icon: ClipboardCheck, label: 'Rapports', badgeKey: 'rapports' },
  { to: '/alertes', Icon: Bell, label: 'Alertes', badgeKey: 'alertes', danger: true },
]

const clients: NavItem[] = [
  { to: '/clients', Icon: Building2, label: 'Fiches clients' },
]

const rh: NavItem[] = [
  { to: '/techniciens', Icon: HardHat, label: 'Techniciens', badgeKey: 'rh' },
]

const facturation: NavItem[] = [
  { to: '/devis', Icon: Wallet, label: 'Devis' },
  { to: '/factures', Icon: Receipt, label: 'Factures', badgeKey: 'factures' },
]

const documents: NavItem[] = [
  { to: '/archivage', Icon: Archive, label: 'Archivage' },
]

const compte: NavItem[] = [
  { to: '/parametres', Icon: Settings, label: 'Paramètres' },
]

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

export function Sidebar() {
  const navigate = useNavigate()
  const location = useLocation()
  const user = useAuthStore((s) => s.user)
  const profile = useAuthStore((s) => s.profile)
  const [counts, setCounts] = useState<Counts>({ planning: 0, rapports: 0, alertes: 0, rh: 0, factures: 0 })

  useEffect(() => {
    let alive = true
    const safeInvoices = listInvoices().catch(() => [])
    Promise.all([
      listInterventions(),
      computeRegulatoryAlerts(),
      listExpenses(),
      listOvertime(),
      computeVehicleAlerts(),
      safeInvoices,
    ])
      .then(([all, alerts, expenses, overtime, vehicleAlerts, invoices]) => {
        if (!alive) return
        const planning = all.filter((i) => i.status === 'a_planifier' || i.status === 'planifiee').length
        const rapports = all.filter((i) => i.status === 'en_cours').length
        const urgent = (days: number) => {
          const sev = classifyAlert(days)
          return sev === 'overdue' || sev === 'urgent'
        }
        const alertesUrgent =
          alerts.filter((a) => urgent(a.daysUntilDue)).length +
          vehicleAlerts.filter((a) => urgent(a.daysUntilDue)).length
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
        setCounts({ planning, rapports, alertes: alertesUrgent, rh, factures })
      })
      .catch(() => { /* silent ignore */ })
    return () => { alive = false }
  }, [location.pathname])

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
    <aside className="b-sidebar">
      <div className="b-sb-sec">Principal</div>
      {principal.map((i) => <SidebarLink key={i.to} item={i} counts={counts} />)}

      <div className="b-sb-sec">Clients</div>
      {clients.map((i) => <SidebarLink key={i.to} item={i} counts={counts} />)}

      <div className="b-sb-sec">RH / Paie</div>
      {rh.map((i) => <SidebarLink key={i.to} item={i} counts={counts} />)}

      {isAdmin && (
        <>
          <div className="b-sb-sec">Facturation</div>
          {facturation.map((i) => <SidebarLink key={i.to} item={i} counts={counts} />)}
        </>
      )}

      <div className="b-sb-sec">Documents</div>
      {documents.map((i) => <SidebarLink key={i.to} item={i} counts={counts} />)}

      <div className="b-sb-sec">Compte</div>
      {compte.map((i) => <SidebarLink key={i.to} item={i} counts={counts} />)}

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

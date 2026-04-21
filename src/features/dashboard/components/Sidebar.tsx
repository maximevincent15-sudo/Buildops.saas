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
import { NavLink, useNavigate } from 'react-router-dom'
import { signOut } from '../../auth/api'
import { useAuthStore } from '../../auth/store'

type NavItem = { to: string; Icon: LucideIcon; label: string; badge?: number }

const principal: NavItem[] = [
  { to: '/dashboard', Icon: LayoutDashboard, label: 'Tableau de bord' },
  { to: '/planning', Icon: CalendarDays, label: 'Planning' },
  { to: '/rapports', Icon: ClipboardCheck, label: 'Rapports' },
  { to: '/alertes', Icon: Bell, label: 'Alertes' },
]

const clients: NavItem[] = [
  { to: '/clients', Icon: Building2, label: 'Fiches clients' },
  { to: '/techniciens', Icon: HardHat, label: 'Techniciens' },
]

const facturation: NavItem[] = [
  { to: '/devis', Icon: Wallet, label: 'Devis' },
  { to: '/factures', Icon: Receipt, label: 'Factures' },
]

const documents: NavItem[] = [
  { to: '/archivage', Icon: Archive, label: 'Archivage' },
]

const compte: NavItem[] = [
  { to: '/parametres', Icon: Settings, label: 'Paramètres' },
]

function navClass({ isActive }: { isActive: boolean }) {
  return `sb-a${isActive ? ' on' : ''}`
}

function SidebarLink({ item }: { item: NavItem }) {
  const { Icon } = item
  return (
    <NavLink to={item.to} className={navClass} end={item.to === '/dashboard'}>
      <span className="sb-ico"><Icon size={16} strokeWidth={1.8} /></span>
      {item.label}
      {item.badge !== undefined && <span className="sb-badge">{item.badge}</span>}
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
  const user = useAuthStore((s) => s.user)
  const profile = useAuthStore((s) => s.profile)

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

  return (
    <aside className="sidebar">
      <div className="sb-sec">Principal</div>
      {principal.map((i) => <SidebarLink key={i.to} item={i} />)}

      <div className="sb-sec">Clients</div>
      {clients.map((i) => <SidebarLink key={i.to} item={i} />)}

      <div className="sb-sec">Facturation</div>
      {facturation.map((i) => <SidebarLink key={i.to} item={i} />)}

      <div className="sb-sec">Documents</div>
      {documents.map((i) => <SidebarLink key={i.to} item={i} />)}

      <div className="sb-sec">Compte</div>
      {compte.map((i) => <SidebarLink key={i.to} item={i} />)}

      <div className="sb-user">
        <div className="sb-av">{initials}</div>
        <div>
          <div className="sb-un">{fullName ?? '—'}</div>
          <div className="sb-ur">{orgName ?? 'Compte connecté'}</div>
        </div>
        <button type="button" onClick={handleSignOut} className="sb-out" title="Déconnexion">
          <LogOut size={15} strokeWidth={1.8} />
        </button>
      </div>
    </aside>
  )
}

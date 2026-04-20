import { NavLink, useNavigate } from 'react-router-dom'
import { signOut } from '../../auth/api'
import { useAuthStore } from '../../auth/store'

type NavItem = { to: string; icon: string; label: string; badge?: number }

const principal: NavItem[] = [
  { to: '/dashboard', icon: '🏠', label: 'Tableau de bord' },
  { to: '/planning', icon: '🗓️', label: 'Planning', badge: 5 },
  { to: '/rapports', icon: '📱', label: 'Rapports', badge: 3 },
  { to: '/alertes', icon: '🔔', label: 'Alertes', badge: 4 },
]

const clients: NavItem[] = [
  { to: '/clients', icon: '🏢', label: 'Fiches clients' },
  { to: '/techniciens', icon: '👷', label: 'Techniciens' },
]

const facturation: NavItem[] = [
  { to: '/devis', icon: '💶', label: 'Devis', badge: 2 },
  { to: '/factures', icon: '🧾', label: 'Factures' },
]

const documents: NavItem[] = [
  { to: '/archivage', icon: '🗂️', label: 'Archivage' },
]

const compte: NavItem[] = [
  { to: '/parametres', icon: '⚙️', label: 'Paramètres' },
]

function navClass({ isActive }: { isActive: boolean }) {
  return `sb-a${isActive ? ' on' : ''}`
}

function SidebarLink({ item }: { item: NavItem }) {
  return (
    <NavLink to={item.to} className={navClass} end={item.to === '/dashboard'}>
      <span className="sb-ico">{item.icon}</span>
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
        <button type="button" onClick={handleSignOut} className="sb-out" title="Déconnexion">⏻</button>
      </div>
    </aside>
  )
}

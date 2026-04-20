import { Link, NavLink } from 'react-router-dom'

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

export function Sidebar() {
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
        <div className="sb-av">TM</div>
        <div>
          <div className="sb-un">Thomas Moreau</div>
          <div className="sb-ur">Sécurité Pro IDF</div>
        </div>
        <Link to="/auth" className="sb-out" title="Déconnexion">⏻</Link>
      </div>
    </aside>
  )
}

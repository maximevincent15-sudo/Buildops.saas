import { Car, Clock, HardHat, ReceiptText } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useEffect, useState } from 'react'
import { NavLink } from 'react-router-dom'
import { listExpenses } from '../../expenses/api'
import { listOvertime } from '../../overtime/api'

type Tab = { to: string; label: string; Icon: LucideIcon; badgeKey?: 'frais' | 'heures' }

const TABS: Tab[] = [
  { to: '/techniciens', label: 'Techniciens', Icon: HardHat },
  { to: '/vehicules', label: 'Véhicules', Icon: Car },
  { to: '/frais', label: 'Notes de frais', Icon: ReceiptText, badgeKey: 'frais' },
  { to: '/heures-sup', label: 'Heures sup', Icon: Clock, badgeKey: 'heures' },
]

export function RhTabs() {
  const [counts, setCounts] = useState<{ frais: number; heures: number }>({ frais: 0, heures: 0 })

  useEffect(() => {
    let alive = true
    Promise.all([listExpenses(), listOvertime()])
      .then(([expenses, overtime]) => {
        if (!alive) return
        setCounts({
          frais: expenses.filter((e) => e.status === 'pending').length,
          heures: overtime.filter((o) => o.status === 'pending').length,
        })
      })
      .catch(() => { /* ignore */ })
    return () => { alive = false }
  }, [])

  return (
    <div className="rh-tabs">
      {TABS.map(({ to, label, Icon, badgeKey }) => {
        const badge = badgeKey ? counts[badgeKey] : 0
        return (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) => `rh-tab${isActive ? ' on' : ''}`}
          >
            <Icon size={14} strokeWidth={2} />
            <span>{label}</span>
            {badge > 0 && <span className="rh-tab-badge">{badge}</span>}
          </NavLink>
        )
      })}
    </div>
  )
}

import { Car } from 'lucide-react'
import { RhTabs } from '../features/dashboard/components/RhTabs'

export function VehiculesPage() {
  return (
    <>
      <RhTabs />
      <div className="dash-top">
        <div>
          <div className="dash-title">Véhicules</div>
          <div className="dash-sub">
            Gestion du parc véhicules de fonction avec alertes sur les échéances
            (contrôle technique, assurance, vidange).
          </div>
        </div>
      </div>
      <div className="card">
        <div style={{ textAlign: 'center', padding: '3rem 1rem' }}>
          <Car size={32} strokeWidth={1.5} className="text-ink-3" style={{ margin: '0 auto .5rem' }} />
          <p className="text-ink-2 font-light" style={{ marginBottom: '.5rem' }}>
            Module véhicules bientôt disponible.
          </p>
          <p className="text-ink-3 text-xs font-light" style={{ maxWidth: 480, margin: '0 auto' }}>
            Tu pourras enregistrer chaque véhicule de fonction avec plaque, modèle, technicien assigné
            et surtout les dates clés : contrôle technique, assurance, vidange. Les alertes remonteront
            automatiquement dans la page Alertes.
          </p>
        </div>
      </div>
    </>
  )
}

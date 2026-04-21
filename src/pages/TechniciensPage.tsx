import { HardHat, Mail, Phone } from 'lucide-react'
import { useEffect, useState } from 'react'
import { listTechnicians } from '../features/technicians/api'
import { TechnicianModal } from '../features/technicians/components/TechnicianModal'
import type { Technician } from '../features/technicians/schemas'

export function TechniciensPage() {
  const [technicians, setTechnicians] = useState<Technician[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Technician | null>(null)
  const [filter, setFilter] = useState<'active' | 'all'>('active')

  async function load() {
    setLoading(true)
    try {
      const data = await listTechnicians()
      setTechnicians(data)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur inconnue')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  function openCreate() {
    setEditing(null)
    setModalOpen(true)
  }

  function openEdit(t: Technician) {
    setEditing(t)
    setModalOpen(true)
  }

  function closeModal() {
    setModalOpen(false)
    setEditing(null)
  }

  const visible = filter === 'active' ? technicians.filter((t) => t.active) : technicians
  const total = technicians.length
  const activeCount = technicians.filter((t) => t.active).length
  const inactiveCount = total - activeCount

  return (
    <>
      <div className="dash-top">
        <div>
          <div className="dash-title">Techniciens</div>
          <div className="dash-sub">
            {total === 0 && 'Aucun technicien enregistré'}
            {total === 1 && '1 technicien enregistré'}
            {total > 1 && `${total} techniciens · ${activeCount} actif${activeCount > 1 ? 's' : ''}${inactiveCount > 0 ? `, ${inactiveCount} inactif${inactiveCount > 1 ? 's' : ''}` : ''}`}
          </div>
        </div>
        <div className="dash-acts">
          <button type="button" className="btn-sm acc" onClick={openCreate}>
            + Nouveau technicien
          </button>
        </div>
      </div>

      {total > 0 && inactiveCount > 0 && (
        <div style={{ display: 'flex', gap: '.5rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
          <button
            type="button"
            className={`filter-pill${filter === 'active' ? ' on' : ''}`}
            onClick={() => setFilter('active')}
          >
            Actifs ({activeCount})
          </button>
          <button
            type="button"
            className={`filter-pill${filter === 'all' ? ' on' : ''}`}
            onClick={() => setFilter('all')}
          >
            Tous ({total})
          </button>
        </div>
      )}

      <div className="card">
        {loading && <p className="text-ink-2 text-sm font-light">Chargement…</p>}

        {error && !loading && (
          <p className="text-red text-sm">Erreur : {error}</p>
        )}

        {!loading && !error && total === 0 && (
          <div style={{ textAlign: 'center', padding: '3rem 1rem' }}>
            <p className="text-ink-2 font-light" style={{ marginBottom: '.5rem' }}>
              Aucun technicien pour le moment.
            </p>
            <p className="text-ink-3 text-xs font-light" style={{ marginBottom: '1.2rem' }}>
              Ajoute tes techniciens pour les assigner aux interventions en un clic.
            </p>
            <button type="button" className="btn-sm acc" onClick={openCreate}>
              + Créer un technicien
            </button>
          </div>
        )}

        {!loading && !error && visible.length === 0 && total > 0 && (
          <div style={{ textAlign: 'center', padding: '2rem 1rem' }}>
            <p className="text-ink-3 text-sm font-light">
              Aucun technicien actif. Clique sur "Tous" pour voir les inactifs.
            </p>
          </div>
        )}

        {!loading && !error && visible.length > 0 && (
          <>
            <p className="text-ink-3 text-xs font-light" style={{ marginBottom: '.75rem' }}>
              Clique sur une fiche pour modifier ou désactiver un technicien.
            </p>
            <div className="clients-grid">
              {visible.map((t) => (
                <div
                  key={t.id}
                  className={`client-card${!t.active ? ' inactive' : ''}`}
                  onClick={() => openEdit(t)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => { if (e.key === 'Enter') openEdit(t) }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div className="client-name">{t.first_name} {t.last_name}</div>
                    {!t.active && (
                      <span className="badge b-gry">Inactif</span>
                    )}
                  </div>
                  {t.role && (
                    <div className="client-line">
                      <HardHat size={12} strokeWidth={2} />
                      {t.role}
                    </div>
                  )}
                  {t.phone && (
                    <div className="client-line">
                      <Phone size={12} strokeWidth={2} />
                      {t.phone}
                    </div>
                  )}
                  {t.email && (
                    <div className="client-line">
                      <Mail size={12} strokeWidth={2} />
                      {t.email}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      <TechnicianModal
        open={modalOpen}
        onClose={closeModal}
        onChanged={() => void load()}
        technician={editing}
      />
    </>
  )
}

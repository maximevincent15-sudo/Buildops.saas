import { Bell, Mail, MapPin, Phone, Upload, User } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { listClients } from '../features/clients/api'
import { ClientModal } from '../features/clients/components/ClientModal'
import type { Client } from '../features/clients/schemas'
import { RelanceModal } from '../features/relances/components/RelanceModal'
import { QuickActions } from '../shared/ui/QuickActions'

export function ClientsPage() {
  const [clients, setClients] = useState<Client[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Client | null>(null)
  const [relanceClient, setRelanceClient] = useState<Client | null>(null)

  async function load() {
    setLoading(true)
    try {
      const data = await listClients()
      setClients(data)
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

  function openEdit(c: Client) {
    setEditing(c)
    setModalOpen(true)
  }

  function closeModal() {
    setModalOpen(false)
    setEditing(null)
  }

  const total = clients.length

  return (
    <>
      <div className="dash-top">
        <div>
          <div className="dash-title">Fiches clients</div>
          <div className="dash-sub">
            {total === 0 && 'Aucun client enregistré'}
            {total === 1 && '1 client enregistré'}
            {total > 1 && `${total} clients enregistrés`}
          </div>
        </div>
        <div className="dash-acts">
          <Link
            to="/clients/import"
            className="btn-sm"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            <Upload size={13} strokeWidth={2} />
            Importer
          </Link>
          <button type="button" className="btn-sm acc" onClick={openCreate}>
            + Nouveau client
          </button>
        </div>
      </div>

      <div className="card">
        {loading && <p className="text-ink-2 text-sm font-light">Chargement…</p>}

        {error && !loading && (
          <p className="text-red text-sm">Erreur : {error}</p>
        )}

        {!loading && !error && total === 0 && (
          <div style={{ textAlign: 'center', padding: '3rem 1rem' }}>
            <p className="text-ink-2 font-light" style={{ marginBottom: '.5rem' }}>
              Aucun client pour le moment.
            </p>
            <p className="text-ink-3 text-xs font-light" style={{ marginBottom: '1.2rem' }}>
              Crée ta première fiche client pour centraliser ses infos de contact et son historique.
            </p>
            <button type="button" className="btn-sm acc" onClick={openCreate}>
              + Créer un client
            </button>
          </div>
        )}

        {!loading && !error && total > 0 && (
          <>
            <p className="text-ink-3 text-xs font-light" style={{ marginBottom: '.75rem' }}>
              Clique sur une fiche pour modifier ou supprimer un client.
            </p>
            <div className="clients-grid">
              {clients.map((c) => (
                <div
                  key={c.id}
                  className="client-card"
                  onClick={() => openEdit(c)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => { if (e.key === 'Enter') openEdit(c) }}
                >
                  <div className="client-name">{c.name}</div>
                  {c.contact_name && (
                    <div className="client-line">
                      <User size={12} strokeWidth={2} />
                      {c.contact_name}
                    </div>
                  )}
                  {c.contact_phone && (
                    <div className="client-line">
                      <Phone size={12} strokeWidth={2} />
                      {c.contact_phone}
                    </div>
                  )}
                  {c.contact_email && (
                    <div className="client-line">
                      <Mail size={12} strokeWidth={2} />
                      {c.contact_email}
                    </div>
                  )}
                  {c.address && (
                    <div className="client-line">
                      <MapPin size={12} strokeWidth={2} />
                      {c.address}
                    </div>
                  )}
                  {(c.contact_phone || c.contact_email || c.address) && (
                    <div className="client-actions">
                      <QuickActions
                        phone={c.contact_phone}
                        email={c.contact_email}
                        address={c.address}
                      />
                      {c.contact_email && (
                        <button
                          type="button"
                          className="qa-btn relance"
                          onClick={(e) => {
                            e.stopPropagation()
                            setRelanceClient(c)
                          }}
                          title="Envoyer une relance par email"
                          aria-label="Relancer"
                        >
                          <Bell size={13} strokeWidth={2} />
                        </button>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      <ClientModal
        open={modalOpen}
        onClose={closeModal}
        onChanged={() => void load()}
        client={editing}
      />

      {relanceClient && (
        <RelanceModal
          open={!!relanceClient}
          onClose={() => setRelanceClient(null)}
          recipientEmail={relanceClient.contact_email}
          initialType="general"
          context={{
            clientName: relanceClient.name,
            contactName: relanceClient.contact_name,
            address: relanceClient.address,
          }}
        />
      )}
    </>
  )
}

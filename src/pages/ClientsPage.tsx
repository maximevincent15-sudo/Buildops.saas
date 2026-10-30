import { Bell, Building2, Mail, MapPin, Phone, Search, Upload, User, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { listClients } from '../features/clients/api'
import { ClientModal } from '../features/clients/components/ClientModal'
import type { Client } from '../features/clients/schemas'
import { listSites } from '../features/equipment/api'
import type { Site } from '../features/equipment/schemas'
import { RelanceModal } from '../features/relances/components/RelanceModal'
import { matchesSearch } from '../shared/lib/search'
import { QuickActions } from '../shared/ui/QuickActions'

export function ClientsPage() {
  const [clients, setClients] = useState<Client[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Client | null>(null)
  const [relanceClient, setRelanceClient] = useState<Client | null>(null)
  const [search, setSearch] = useState('')
  const [sites, setSites] = useState<Site[]>([])

  async function load() {
    setLoading(true)
    try {
      const [data, allSites] = await Promise.all([
        listClients(),
        // Les sites servent seulement à la recherche : un échec ne bloque pas la page
        listSites().catch(() => [] as Site[]),
      ])
      setClients(data)
      setSites(allSites)
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

  const sitesByClient = useMemo(() => {
    const map = new Map<string, Site[]>()
    for (const site of sites) {
      const list = map.get(site.client_id) ?? []
      list.push(site)
      map.set(site.client_id, list)
    }
    return map
  }, [sites])

  // Recherche : nom, contact, téléphone, email, adresse, SIRET… et sites du client
  const visible = useMemo(() => {
    if (!search.trim()) return clients.map((client) => ({ client, matchedSites: [] as Site[] }))
    return clients.flatMap((client) => {
      const clientSites = sitesByClient.get(client.id) ?? []
      const ownMatch = matchesSearch(search, [
        client.name, client.client_number, client.contact_name, client.contact_email, client.contact_phone,
        client.address, client.siret, client.siren,
      ])
      const matchedSites = clientSites.filter((site) =>
        matchesSearch(search, [site.name, site.address, site.postal_code, site.city, site.contact_name]),
      )
      return ownMatch || matchedSites.length > 0 ? [{ client, matchedSites: ownMatch ? [] : matchedSites }] : []
    })
  }, [clients, sitesByClient, search])

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
            <div style={{ display: 'flex', alignItems: 'center', gap: '.75rem', flexWrap: 'wrap', marginBottom: '.75rem' }}>
              <div style={{ position: 'relative', flex: '1 1 260px', maxWidth: 380 }}>
                <Search
                  size={14}
                  strokeWidth={2}
                  style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--ink3)' }}
                />
                <input
                  className="input-sm"
                  type="search"
                  placeholder="Rechercher (nom, n° client, contact, ville, téléphone, site…)"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  style={{ paddingLeft: 30, width: '100%' }}
                  aria-label="Rechercher un client"
                />
              </div>
              <span className="text-ink-3 text-xs font-light">
                {search.trim()
                  ? `${visible.length} résultat${visible.length > 1 ? 's' : ''} sur ${total}`
                  : 'Clique sur une fiche pour modifier ou supprimer un client.'}
              </span>
            </div>

            {visible.length === 0 && (
              <div style={{ textAlign: 'center', padding: '2rem 1rem' }}>
                <p className="text-ink-2 text-sm font-light" style={{ marginBottom: '.8rem' }}>
                  Aucun client ne correspond à « {search.trim()} ».
                </p>
                <button
                  type="button"
                  className="btn-sm"
                  onClick={() => setSearch('')}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                >
                  <X size={13} strokeWidth={2} /> Effacer la recherche
                </button>
              </div>
            )}

            <div className="clients-grid">
              {visible.map(({ client: c, matchedSites }) => (
                <div
                  key={c.id}
                  className="client-card"
                  onClick={() => openEdit(c)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => { if (e.key === 'Enter') openEdit(c) }}
                >
                  <div className="client-name">
                    {c.client_number && (
                      <span style={{ display: 'inline-block', background: 'var(--acc-lt)', color: 'var(--acc)', fontWeight: 700, fontSize: 11, padding: '1px 6px', borderRadius: 5, marginRight: 6, verticalAlign: '1px' }}>
                        {c.client_number}
                      </span>
                    )}
                    {c.name}
                  </div>
                  {matchedSites.length > 0 && (
                    <div className="client-line" style={{ color: 'var(--acc)' }}>
                      <Building2 size={12} strokeWidth={2} />
                      {matchedSites.map((site) => site.name).join(', ')}
                    </div>
                  )}
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

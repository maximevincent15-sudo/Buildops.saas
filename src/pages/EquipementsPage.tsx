import { Building2, Layers, Plus, Search, Upload, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { listClients } from '../features/clients/api'
import type { Client } from '../features/clients/schemas'
import { listEquipmentUnits, listSites } from '../features/equipment/api'
import { BatchAddUnitsModal } from '../features/equipment/components/BatchAddUnitsModal'
import { EquipmentUnitModal } from '../features/equipment/components/EquipmentUnitModal'
import { SiteModal } from '../features/equipment/components/SiteModal'
import {
  EQUIPMENT_FAMILIES,
  EQUIPMENT_FAMILY_LABELS,
  EQUIPMENT_STATUS_LABELS,
  computeNextReplacementYear,
} from '../features/equipment/schemas'
import type {
  EquipmentFamily,
  EquipmentStatus,
  EquipmentUnit,
  Site,
} from '../features/equipment/schemas'

type FamilyFilter = 'all' | EquipmentFamily
type StatusFilter = 'all' | EquipmentStatus

const STATUS_BADGE: Record<EquipmentStatus, string> = {
  active: 'b-grn',
  to_watch: 'b-org',
  to_replace: 'b-red',
  replaced: 'b-gry',
  removed: 'b-gry',
}

export function EquipementsPage() {
  const [units, setUnits] = useState<EquipmentUnit[]>([])
  const [sites, setSites] = useState<Site[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Modales
  const [unitModalOpen, setUnitModalOpen] = useState(false)
  const [editingUnit, setEditingUnit] = useState<EquipmentUnit | null>(null)
  const [siteModalOpen, setSiteModalOpen] = useState(false)
  const [batchModalOpen, setBatchModalOpen] = useState(false)

  // Filtres
  const [search, setSearch] = useState('')
  const [familyFilter, setFamilyFilter] = useState<FamilyFilter>('all')
  const [siteFilter, setSiteFilter] = useState<string>('all')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const [u, s, c] = await Promise.all([
        listEquipmentUnits(),
        listSites(),
        listClients(),
      ])
      setUnits(u)
      setSites(s)
      setClients(c)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur inconnue')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  const sitesById = useMemo(() => {
    const map = new Map<string, Site>()
    for (const s of sites) map.set(s.id, s)
    return map
  }, [sites])

  const clientsById = useMemo(() => {
    const map = new Map<string, Client>()
    for (const c of clients) map.set(c.id, c)
    return map
  }, [clients])

  // Compteurs par famille (pour les pills)
  const familyCounts = useMemo(() => {
    const counts: Record<EquipmentFamily, number> = {
      extincteurs: 0,
      ria: 0,
      baes: 0,
      portes_cf: 0,
      desenfumage: 0,
      detection: 0,
      colonnes_seches: 0,
    }
    for (const u of units) counts[u.family]++
    return counts
  }, [units])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return units.filter((u) => {
      if (familyFilter !== 'all' && u.family !== familyFilter) return false
      if (siteFilter !== 'all' && u.site_id !== siteFilter) return false
      if (statusFilter !== 'all' && u.status !== statusFilter) return false
      if (q) {
        const hay = [
          u.serial_number,
          u.subtype ?? '',
          u.brand ?? '',
          u.model ?? '',
          u.implantation ?? '',
          u.notes ?? '',
        ]
          .join(' ')
          .toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [units, search, familyFilter, siteFilter, statusFilter])

  const total = units.length
  const shown = filtered.length

  const clearFilters = () => {
    setSearch('')
    setFamilyFilter('all')
    setSiteFilter('all')
    setStatusFilter('all')
  }

  const hasActiveFilters =
    search !== '' ||
    familyFilter !== 'all' ||
    siteFilter !== 'all' ||
    statusFilter !== 'all'

  return (
    <>
      <div className="dash-top">
        <div>
          <div className="dash-title">Inventaire équipements</div>
          <div className="dash-sub">
            {loading && 'Chargement…'}
            {!loading && total === 0 && 'Aucun équipement enregistré'}
            {!loading && total === 1 && '1 équipement suivi'}
            {!loading && total > 1 && `${total} équipements suivis`}
            {!loading && hasActiveFilters && ` · ${shown} affiché${shown > 1 ? 's' : ''}`}
          </div>
        </div>
        <div className="dash-acts">
          <Link
            to="/equipements/import"
            className="btn-sm"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            <Upload size={13} strokeWidth={2} />
            Importer
          </Link>
          <button
            type="button"
            className="btn-sm"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
            onClick={() => setSiteModalOpen(true)}
          >
            <Building2 size={13} strokeWidth={2} />
            Nouveau site
          </button>
          <button
            type="button"
            className="btn-sm"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
            onClick={() => setBatchModalOpen(true)}
          >
            <Layers size={13} strokeWidth={2} />
            Ajout en lot
          </button>
          <button
            type="button"
            className="btn-sm acc"
            onClick={() => {
              setEditingUnit(null)
              setUnitModalOpen(true)
            }}
          >
            <Plus size={13} strokeWidth={2} style={{ marginRight: 4 }} />
            Nouvelle unité
          </button>
        </div>
      </div>

      {error && (
        <p className="text-red text-sm" style={{ marginBottom: 12 }}>
          Erreur : {error}
        </p>
      )}

      {/* Pills famille */}
      <div
        style={{
          display: 'flex',
          gap: 6,
          flexWrap: 'wrap',
          marginBottom: 14,
        }}
      >
        <button
          type="button"
          className={`filter-pill${familyFilter === 'all' ? ' on' : ''}`}
          onClick={() => setFamilyFilter('all')}
        >
          Toutes ({total})
        </button>
        {EQUIPMENT_FAMILIES.map((fam) => (
          <button
            key={fam}
            type="button"
            className={`filter-pill${familyFilter === fam ? ' on' : ''}`}
            onClick={() => setFamilyFilter(fam)}
            disabled={familyCounts[fam] === 0}
            style={familyCounts[fam] === 0 ? { opacity: 0.4 } : undefined}
          >
            {EQUIPMENT_FAMILY_LABELS[fam]} ({familyCounts[fam]})
          </button>
        ))}
      </div>

      {/* Barre filtres secondaires */}
      <div
        style={{
          display: 'flex',
          gap: 8,
          marginBottom: 14,
          flexWrap: 'wrap',
          alignItems: 'center',
        }}
      >
        <div
          style={{
            position: 'relative',
            flex: '1 1 240px',
            maxWidth: 320,
          }}
        >
          <Search
            size={14}
            strokeWidth={2}
            style={{
              position: 'absolute',
              left: 10,
              top: '50%',
              transform: 'translateY(-50%)',
              color: 'var(--ink3)',
            }}
          />
          <input
            className="input-sm"
            type="text"
            placeholder="Rechercher (n°, marque, implantation…)"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ paddingLeft: 30, width: '100%' }}
          />
        </div>
        <select
          className="input-sm"
          value={siteFilter}
          onChange={(e) => setSiteFilter(e.target.value)}
        >
          <option value="all">Tous sites</option>
          {sites.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <select
          className="input-sm"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
        >
          <option value="all">Tous statuts</option>
          <option value="active">Conforme</option>
          <option value="to_watch">À surveiller</option>
          <option value="to_replace">À réformer</option>
          <option value="replaced">Remplacé</option>
        </select>
        {hasActiveFilters && (
          <button
            type="button"
            className="btn-sm"
            onClick={clearFilters}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
          >
            <X size={12} strokeWidth={2} />
            Effacer
          </button>
        )}
      </div>

      <div className="card">
        {loading && (
          <p className="text-ink-2 text-sm font-light" style={{ padding: 12 }}>
            Chargement…
          </p>
        )}

        {!loading && total === 0 && (
          <div style={{ padding: 40, textAlign: 'center' }}>
            <div style={{ fontSize: 14, color: 'var(--ink)', fontWeight: 500 }}>
              Aucun équipement pour l'instant
            </div>
            <div
              style={{
                fontSize: 12.5,
                color: 'var(--ink2)',
                marginTop: 6,
                marginBottom: 16,
              }}
            >
              {sites.length === 0
                ? "Commence par créer un site pour un client, puis ajoute des unités."
                : 'Ajoute ta première unité manuellement ou importe un tableau Excel.'}
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
              {sites.length === 0 && (
                <button
                  type="button"
                  className="btn-sm acc"
                  onClick={() => setSiteModalOpen(true)}
                >
                  Créer un premier site
                </button>
              )}
              {sites.length > 0 && (
                <button
                  type="button"
                  className="btn-sm acc"
                  onClick={() => {
                    setEditingUnit(null)
                    setUnitModalOpen(true)
                  }}
                >
                  + Nouvelle unité
                </button>
              )}
            </div>
          </div>
        )}

        {!loading && total > 0 && shown === 0 && (
          <div style={{ padding: 40, textAlign: 'center' }}>
            <div style={{ fontSize: 13.5, color: 'var(--ink2)' }}>
              Aucun équipement ne correspond à ces filtres.
            </div>
          </div>
        )}

        {!loading && shown > 0 && (
          <div style={{ overflowX: 'auto' }} data-eq-table>
            <table className="dtbl" style={{ width: '100%' }}>
              <thead>
                <tr>
                  <th style={{ width: 60 }}>N°</th>
                  <th>Client · Site</th>
                  <th>Famille</th>
                  <th>Type</th>
                  <th>Marque</th>
                  <th style={{ width: 70 }}>Année</th>
                  <th style={{ width: 90 }}>Réforme</th>
                  <th>État</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((u) => {
                  const site = sitesById.get(u.site_id)
                  const client = clientsById.get(u.client_id)
                  const nextYear =
                    u.next_replacement_year ??
                    computeNextReplacementYear(u.family, u.install_year)
                  const nowYear = new Date().getFullYear()
                  const isReformOverdue = nextYear !== null && nextYear <= nowYear
                  return (
                    <tr
                      key={u.id}
                      onClick={() => {
                        setEditingUnit(u)
                        setUnitModalOpen(true)
                      }}
                      style={{ cursor: 'pointer' }}
                    >
                      <td style={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                        {u.serial_number}
                      </td>
                      <td>
                        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>
                          {client?.name ?? '—'}
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--ink2)' }}>
                          {site?.name ?? '—'}
                        </div>
                      </td>
                      <td>
                        <span className="b-gry">{EQUIPMENT_FAMILY_LABELS[u.family]}</span>
                      </td>
                      <td style={{ fontVariantNumeric: 'tabular-nums', fontSize: 12.5 }}>
                        {u.subtype ?? '—'}
                      </td>
                      <td>{u.brand ?? '—'}</td>
                      <td style={{ fontVariantNumeric: 'tabular-nums' }}>
                        {u.install_year ?? '—'}
                      </td>
                      <td
                        style={{
                          fontVariantNumeric: 'tabular-nums',
                          color: isReformOverdue ? 'var(--red)' : 'var(--ink2)',
                          fontWeight: isReformOverdue ? 600 : 400,
                        }}
                      >
                        {nextYear ?? '—'}
                      </td>
                      <td>
                        <span className={STATUS_BADGE[u.status]}>
                          {EQUIPMENT_STATUS_LABELS[u.status]}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <SiteModal
        open={siteModalOpen}
        onClose={() => setSiteModalOpen(false)}
        onChanged={() => void load()}
      />

      <BatchAddUnitsModal
        open={batchModalOpen}
        onClose={() => setBatchModalOpen(false)}
        onCreated={() => void load()}
      />

      <EquipmentUnitModal
        open={unitModalOpen}
        onClose={() => {
          setUnitModalOpen(false)
          setEditingUnit(null)
        }}
        onChanged={() => void load()}
        unit={editingUnit}
      />
    </>
  )
}

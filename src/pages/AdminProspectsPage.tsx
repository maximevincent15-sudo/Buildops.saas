import { useEffect, useMemo, useState } from 'react'
import { format, formatDistanceToNow, parseISO } from 'date-fns'
import { fr } from 'date-fns/locale'
import { AlertTriangle, CheckCircle2, Clock, Mail, ExternalLink } from 'lucide-react'
import { listAllProspects } from '../features/admin/api'
import type { Prospect } from '../features/admin/api'

type Filter = 'all' | 'trialing' | 'active' | 'canceled' | 'expired'

const STATUS_LABELS: Record<string, string> = {
  trialing: 'Essai en cours',
  active: 'Client payant',
  past_due: 'Paiement en retard',
  canceled: 'Résilié',
  unpaid: 'Impayé',
  incomplete: 'Incomplet',
  incomplete_expired: 'Expiré',
}

export function AdminProspectsPage() {
  const [prospects, setProspects] = useState<Prospect[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<Filter>('all')

  useEffect(() => {
    let alive = true
    setLoading(true)
    listAllProspects()
      .then((data) => {
        if (alive) {
          setProspects(data)
          setError(null)
        }
      })
      .catch((e) => alive && setError(e instanceof Error ? e.message : 'Erreur inconnue'))
      .finally(() => alive && setLoading(false))
    return () => {
      alive = false
    }
  }, [])

  const filtered = useMemo(() => {
    if (filter === 'all') return prospects
    if (filter === 'expired') {
      return prospects.filter((p) => p.status === 'trialing' && (p.days_left ?? 0) <= 0)
    }
    return prospects.filter((p) => p.status === filter)
  }, [prospects, filter])

  const counts = useMemo(() => {
    return {
      all: prospects.length,
      trialing: prospects.filter((p) => p.status === 'trialing').length,
      active: prospects.filter((p) => p.status === 'active').length,
      canceled: prospects.filter((p) => p.status === 'canceled').length,
      expired: prospects.filter((p) => p.status === 'trialing' && (p.days_left ?? 0) <= 0).length,
    }
  }, [prospects])

  return (
    <>
      <div className="dash-top">
        <div>
          <div className="dash-title">Pilotage prospects</div>
          <div className="dash-sub">
            Vue admin sur tous les comptes Firovia et leur état de trial/abonnement
          </div>
        </div>
      </div>

      {loading && <p className="text-ink-2 text-sm font-light">Chargement…</p>}

      {error && (
        <div style={{ padding: '.7rem 1rem', background: '#FDECEC', border: '1px solid #F0B4B4', borderRadius: 8, color: '#9B1C1C', marginBottom: '1rem', fontSize: '.85rem' }}>
          Erreur : {error}
        </div>
      )}

      {!loading && !error && prospects.length === 0 && (
        <div className="card" style={{ textAlign: 'center', padding: '3rem 1rem' }}>
          <p className="text-ink-2 font-light">
            Aucun prospect à afficher.
          </p>
          <p className="text-ink-3 text-xs font-light" style={{ marginTop: '.5rem' }}>
            (Vue réservée à l'admin — utilise un compte autorisé.)
          </p>
        </div>
      )}

      {!loading && !error && prospects.length > 0 && (
        <>
          {/* Filtres */}
          <div style={{ display: 'flex', gap: '.5rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
            <FilterPill label={`Tous (${counts.all})`} active={filter === 'all'} onClick={() => setFilter('all')} />
            <FilterPill label={`🔥 Trial expiré (${counts.expired})`} active={filter === 'expired'} onClick={() => setFilter('expired')} highlight="red" />
            <FilterPill label={`Essai en cours (${counts.trialing})`} active={filter === 'trialing'} onClick={() => setFilter('trialing')} />
            <FilterPill label={`✅ Payant (${counts.active})`} active={filter === 'active'} onClick={() => setFilter('active')} highlight="green" />
            <FilterPill label={`Résilié (${counts.canceled})`} active={filter === 'canceled'} onClick={() => setFilter('canceled')} />
          </div>

          {/* Grille de cartes prospects */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
            gap: '.9rem',
          }}>
            {filtered.map((p) => (
              <ProspectCard key={p.organization_id} p={p} />
            ))}
          </div>

          {filtered.length === 0 && (
            <div className="card" style={{ textAlign: 'center', padding: '2rem 1rem', color: 'var(--ink2)' }}>
              Aucun prospect ne correspond à ce filtre.
            </div>
          )}
        </>
      )}
    </>
  )
}

function FilterPill({ label, active, onClick, highlight }: {
  label: string
  active: boolean
  onClick: () => void
  highlight?: 'red' | 'green'
}) {
  const color = active
    ? (highlight === 'red' ? '#C0392B' : highlight === 'green' ? '#0E7A3F' : 'var(--acc)')
    : 'var(--ink2)'
  return (
    <button
      type="button"
      onClick={onClick}
      className={`filter-pill${active ? ' on' : ''}`}
      style={active ? { borderColor: color, color } : undefined}
    >
      {label}
    </button>
  )
}

function ProspectCard({ p }: { p: Prospect }) {
  const daysLeft = p.days_left
  const isTrial = p.status === 'trialing'
  const isExpired = isTrial && (daysLeft ?? 0) <= 0
  const isUrgent = isTrial && !isExpired && (daysLeft ?? 999) <= 3
  const isActive = p.status === 'active'
  const isCanceled = p.status === 'canceled'

  // Couleur bordure selon urgence
  const borderColor = isExpired ? '#C0392B'
    : isUrgent ? '#E67E22'
    : isActive ? '#27AE60'
    : isCanceled ? '#8A8F9A'
    : 'var(--brd, #E1E5EA)'

  const engaged = p.nb_interventions >= 3 || p.nb_reports >= 1

  return (
    <div style={{
      background: '#fff',
      border: `2px solid ${borderColor}`,
      borderRadius: 10,
      padding: '.9rem 1rem',
      display: 'flex',
      flexDirection: 'column',
      gap: '.55rem',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '.5rem' }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: '.95rem', fontWeight: 700, color: 'var(--ink)', lineHeight: 1.2 }}>
            {p.organization_name ?? '(sans nom)'}
          </div>
          {p.siret && (
            <div style={{ fontSize: '.7rem', color: 'var(--ink3)', marginTop: 2 }}>
              SIRET {p.siret}
            </div>
          )}
        </div>
        <StatusBadge status={p.status} isExpired={isExpired} isUrgent={isUrgent} />
      </div>

      {/* Contact */}
      <div style={{ fontSize: '.8rem', color: 'var(--ink2)' }}>
        {p.contact_name && <div>{p.contact_name}</div>}
        {p.contact_email && (
          <a href={`mailto:${p.contact_email}`} style={{ color: 'var(--acc)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '.78rem' }}>
            <Mail size={11} strokeWidth={2} />
            {p.contact_email}
          </a>
        )}
      </div>

      {/* Trial info si applicable */}
      {isTrial && (
        <div style={{
          padding: '.4rem .6rem',
          background: isExpired ? '#FDECEC' : isUrgent ? '#FFF4E5' : '#EAF2FF',
          border: `1px solid ${isExpired ? '#F0B4B4' : isUrgent ? '#F5C88F' : '#B8CDEE'}`,
          borderRadius: 6,
          fontSize: '.75rem',
          color: isExpired ? '#9B1C1C' : isUrgent ? '#8A4A00' : '#1E3A5F',
        }}>
          {isExpired && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontWeight: 600 }}>
              <AlertTriangle size={12} strokeWidth={2.5} />
              Trial expiré {p.trial_ends_at && `le ${format(parseISO(p.trial_ends_at), 'd MMM', { locale: fr })}`}
              {daysLeft !== null && daysLeft < 0 && ` (${Math.abs(daysLeft)} j)`}
            </div>
          )}
          {!isExpired && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontWeight: 600 }}>
              <Clock size={12} strokeWidth={2.5} />
              Trial : {daysLeft} jour{daysLeft && daysLeft > 1 ? 's' : ''} restant{daysLeft && daysLeft > 1 ? 's' : ''}
            </div>
          )}
        </div>
      )}

      {isActive && (
        <div style={{
          padding: '.4rem .6rem',
          background: '#E6F4EB',
          border: '1px solid #B7DFC7',
          borderRadius: 6,
          fontSize: '.75rem',
          color: '#0E7A3F',
          display: 'flex',
          alignItems: 'center',
          gap: 5,
          fontWeight: 600,
        }}>
          <CheckCircle2 size={12} strokeWidth={2.5} />
          Plan {p.plan} {p.billing_period === 'yearly' ? 'annuel' : 'mensuel'}
          {p.current_period_end && ` · prochaine échéance ${format(parseISO(p.current_period_end), 'd MMM yyyy', { locale: fr })}`}
        </div>
      )}

      {/* Stats d'engagement */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: '.3rem',
        padding: '.4rem 0',
        borderTop: '1px solid var(--brd, #E1E5EA)',
        borderBottom: '1px solid var(--brd, #E1E5EA)',
      }}>
        <Stat label="Clients" value={p.nb_clients} />
        <Stat label="Interventions" value={p.nb_interventions} highlight={engaged} />
        <Stat label="Rapports" value={p.nb_reports} highlight={p.nb_reports > 0} />
      </div>

      {/* Footer : dates */}
      <div style={{ fontSize: '.7rem', color: 'var(--ink3)', display: 'flex', flexDirection: 'column', gap: 2 }}>
        {p.signed_up_at && (
          <div>Inscrit {formatDistanceToNow(parseISO(p.signed_up_at), { locale: fr, addSuffix: true })}</div>
        )}
        {p.last_sign_in_at && (
          <div>Dernière connexion {formatDistanceToNow(parseISO(p.last_sign_in_at), { locale: fr, addSuffix: true })}</div>
        )}
        {!p.last_sign_in_at && (
          <div style={{ color: '#C0392B', fontWeight: 500 }}>⚠ Jamais connecté</div>
        )}
      </div>

      {/* Actions */}
      {p.contact_email && (
        <a
          href={`mailto:${p.contact_email}?subject=Firovia%20-%20Un%20mot%20rapide`}
          className="btn-sm acc"
          style={{
            marginTop: '.3rem',
            padding: '.45rem .7rem',
            fontSize: '.8rem',
            textAlign: 'center',
            textDecoration: 'none',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 5,
          }}
        >
          <ExternalLink size={12} strokeWidth={2} />
          Contacter
        </a>
      )}
    </div>
  )
}

function StatusBadge({ status, isExpired, isUrgent }: { status: string | null; isExpired: boolean; isUrgent: boolean }) {
  const label = isExpired ? 'EXPIRÉ' : STATUS_LABELS[status ?? ''] ?? status ?? '—'
  const bg = isExpired ? '#FDECEC'
    : isUrgent ? '#FFF4E5'
    : status === 'active' ? '#E6F4EB'
    : status === 'canceled' ? '#F0F0F0'
    : '#EAF2FF'
  const color = isExpired ? '#9B1C1C'
    : isUrgent ? '#8A4A00'
    : status === 'active' ? '#0E7A3F'
    : status === 'canceled' ? '#5A6070'
    : '#1E3A5F'
  return (
    <span style={{
      fontSize: '.65rem',
      fontWeight: 700,
      padding: '2px 8px',
      borderRadius: 999,
      background: bg,
      color,
      textTransform: 'uppercase',
      letterSpacing: '.3px',
      whiteSpace: 'nowrap',
    }}>
      {label}
    </span>
  )
}

function Stat({ label, value, highlight }: { label: string; value: number; highlight?: boolean }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: '1rem', fontWeight: 700, color: highlight ? '#0E7A3F' : 'var(--ink)' }}>
        {value}
      </div>
      <div style={{ fontSize: '.65rem', color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '.3px' }}>
        {label}
      </div>
    </div>
  )
}

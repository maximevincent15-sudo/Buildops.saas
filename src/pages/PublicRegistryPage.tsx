import { Boxes } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { fetchPublicRegistry } from '../features/equipment/publicApi'
import type { PublicRegistryRow } from '../features/equipment/publicApi'
import {
  EQUIPMENT_FAMILY_LABELS,
  EQUIPMENT_STATUS_LABELS,
} from '../features/equipment/schemas'
import type {
  EquipmentFamily,
  EquipmentStatus,
} from '../features/equipment/schemas'

const STATUS_COLOR: Record<EquipmentStatus, { bg: string; fg: string }> = {
  active: { bg: '#E6F4EB', fg: '#0E7A3F' },
  to_watch: { bg: '#FDF3E0', fg: '#B36510' },
  to_replace: { bg: '#FDECEC', fg: '#B02A1E' },
  replaced: { bg: '#F1F1F1', fg: '#5A6070' },
  removed: { bg: '#F1F1F1', fg: '#5A6070' },
}

function formatDate(d: string | null): string {
  if (!d) return '—'
  try {
    return new Date(d).toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    })
  } catch {
    return d
  }
}

export function PublicRegistryPage() {
  const { token } = useParams<{ token: string }>()
  const [rows, setRows] = useState<PublicRegistryRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!token) {
      setError('Lien invalide')
      setLoading(false)
      return
    }
    setLoading(true)
    fetchPublicRegistry(token)
      .then((data) => {
        if (!data || data.length === 0) {
          setError('Aucun équipement enregistré pour ce site, ou lien invalide.')
        } else {
          setRows(data)
        }
      })
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : 'Erreur de chargement')
      })
      .finally(() => setLoading(false))
  }, [token])

  const meta = rows[0]
  const units = useMemo(() => rows.filter((r) => r.unit_id), [rows])

  // Compteurs
  const counts = useMemo(() => {
    const c = { active: 0, to_watch: 0, to_replace: 0, other: 0 }
    for (const u of units) {
      if (u.unit_status === 'active') c.active++
      else if (u.unit_status === 'to_watch') c.to_watch++
      else if (u.unit_status === 'to_replace') c.to_replace++
      else c.other++
    }
    return c
  }, [units])

  // Familles
  const familyCounts = useMemo(() => {
    const m = new Map<EquipmentFamily, number>()
    for (const u of units) {
      if (!u.unit_family) continue
      m.set(u.unit_family, (m.get(u.unit_family) ?? 0) + 1)
    }
    return m
  }, [units])

  if (loading) {
    return (
      <div style={pageStyle}>
        <div style={boxStyle}>
          <p style={{ textAlign: 'center', color: '#5A6070' }}>Chargement du registre…</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div style={pageStyle}>
        <div style={boxStyle}>
          <h1 style={{ margin: 0, fontSize: 22, color: '#1C2130' }}>Registre inaccessible</h1>
          <p style={{ marginTop: 8, color: '#5A6070' }}>{error}</p>
        </div>
      </div>
    )
  }

  return (
    <div style={pageStyle}>
      <div style={{ maxWidth: 980, margin: '0 auto', padding: '24px 20px' }}>
        {/* Header Firovia — logo officiel */}
        <div style={brandHeaderStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <img
              src="/firovia-logo.png"
              alt="Firovia"
              style={{ height: 36, width: 'auto', display: 'block' }}
            />
            <div style={{ borderLeft: '1px solid #E6E8EC', paddingLeft: 12, height: 32, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
              <div style={{ fontSize: 12, color: '#5A6070', lineHeight: 1.3 }}>
                Registre équipements partageable
              </div>
              <div style={{ fontSize: 11, color: '#9AA0AE', lineHeight: 1.3 }}>
                Maintenance sécurité incendie
              </div>
            </div>
          </div>
          <div style={{ fontSize: 11, color: '#5A6070', textAlign: 'right' }}>
            Registre à jour au {new Date().toLocaleDateString('fr-FR')}
          </div>
        </div>

        {/* Site */}
        <div style={siteHeaderStyle}>
          <h1 style={{ margin: 0, fontSize: 24, color: '#1C2130', letterSpacing: '-.02em' }}>
            Registre du site — {meta?.site_name}
          </h1>
          <p style={{ margin: '6px 0 0', color: '#5A6070', fontSize: 14 }}>
            Client : <strong style={{ color: '#1C2130' }}>{meta?.client_name}</strong>
            {(meta?.site_address || meta?.site_city) && (
              <>
                {' · '}
                {[meta?.site_address, meta?.site_postal_code, meta?.site_city]
                  .filter(Boolean)
                  .join(' ')}
              </>
            )}
          </p>
        </div>

        {/* Compteurs */}
        <div style={statsRowStyle}>
          <StatCard label="Équipements" value={units.length} color="#3A5CA8" bg="#E8EEF8" />
          <StatCard label="Conformes" value={counts.active} color="#0E7A3F" bg="#E6F4EB" />
          <StatCard label="À surveiller" value={counts.to_watch} color="#B36510" bg="#FDF3E0" />
          <StatCard label="À réformer" value={counts.to_replace} color="#B02A1E" bg="#FDECEC" />
        </div>

        {/* Familles */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 20 }}>
          {Array.from(familyCounts.entries()).map(([fam, n]) => (
            <span key={fam} style={pillStyle}>
              <Boxes size={11} strokeWidth={2} />
              {EQUIPMENT_FAMILY_LABELS[fam]} · {n}
            </span>
          ))}
        </div>

        {/* Tableau nominatif */}
        <div style={tableBoxStyle}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid #E6E8EC' }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#1C2130' }}>
              Inventaire nominatif ({units.length} équipements)
            </div>
            <div style={{ fontSize: 12, color: '#5A6070', marginTop: 2 }}>
              Registre à jour · Généré avec Firovia
            </div>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={thStyle}>N°</th>
                  <th style={thStyle}>Niv / Zone</th>
                  <th style={thStyle}>Implantation</th>
                  <th style={thStyle}>Famille</th>
                  <th style={thStyle}>Type</th>
                  <th style={thStyle}>Marque</th>
                  <th style={thStyle}>Année</th>
                  <th style={thStyle}>Dernier contrôle</th>
                  <th style={thStyle}>État</th>
                </tr>
              </thead>
              <tbody>
                {units.map((u) => {
                  const zoneLabel = [u.zone_parent, u.zone_name].filter(Boolean).join(' · ') || '—'
                  const status = u.unit_status ?? 'active'
                  const color = STATUS_COLOR[status]
                  return (
                    <tr key={u.unit_id!}>
                      <td style={{ ...tdStyle, fontWeight: 700, color: '#3A5CA8', fontFamily: 'monospace' }}>
                        {u.unit_serial}
                      </td>
                      <td style={tdStyle}>{zoneLabel}</td>
                      <td style={tdStyle}>{u.unit_implantation ?? '—'}</td>
                      <td style={tdStyle}>{u.unit_family ? EQUIPMENT_FAMILY_LABELS[u.unit_family] : '—'}</td>
                      <td style={{ ...tdStyle, fontFamily: 'monospace' }}>{u.unit_subtype ?? '—'}</td>
                      <td style={tdStyle}>{u.unit_brand ?? '—'}</td>
                      <td style={tdStyle}>{u.unit_install_year ?? '—'}</td>
                      <td style={tdStyle}>{formatDate(u.unit_last_check_date)}</td>
                      <td style={tdStyle}>
                        <span
                          style={{
                            display: 'inline-block',
                            padding: '3px 9px',
                            borderRadius: 999,
                            fontSize: 11,
                            fontWeight: 700,
                            background: color.bg,
                            color: color.fg,
                          }}
                        >
                          {EQUIPMENT_STATUS_LABELS[status]}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Footer eIDAS */}
        <div style={footerStyle}>
          <p style={{ margin: 0 }}>
            <strong style={{ color: '#3A4E7A' }}>Registre scellé par Firovia.</strong> Ce document
            est généré automatiquement à partir des données de maintenance saisies par le
            prestataire. Il est destiné à être présenté à la commission de sécurité en cas
            de contrôle.
          </p>
          <p style={{ margin: '8px 0 0', fontSize: 11, color: '#8A94A8' }}>
            Powered by Firovia — <a href="https://firovia.fr" style={{ color: '#3A5CA8', textDecoration: 'none' }}>firovia.fr</a>
          </p>
        </div>
      </div>
    </div>
  )
}

function StatCard({ label, value, color, bg }: { label: string; value: number; color: string; bg: string }) {
  return (
    <div
      style={{
        flexGrow: 1,
        padding: '14px 16px',
        borderRadius: 10,
        background: bg,
        border: `1px solid ${color}22`,
      }}
    >
      <div
        style={{
          fontSize: 10.5,
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: '.05em',
          color: color,
          opacity: 0.85,
        }}
      >
        {label}
      </div>
      <div style={{ fontSize: 28, fontWeight: 800, color, marginTop: 4, letterSpacing: '-.02em' }}>
        {value}
      </div>
    </div>
  )
}

const pageStyle: React.CSSProperties = {
  minHeight: '100vh',
  background: '#F7F8FB',
  fontFamily: 'system-ui, -apple-system, sans-serif',
  color: '#1C2130',
}

const boxStyle: React.CSSProperties = {
  maxWidth: 500,
  margin: '80px auto',
  padding: 32,
  background: '#fff',
  borderRadius: 12,
  boxShadow: '0 4px 20px rgba(20,30,50,.06)',
}

const brandHeaderStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '14px 18px',
  background: '#fff',
  borderRadius: 10,
  boxShadow: '0 1px 3px rgba(20,30,50,.04)',
  marginBottom: 20,
}

const siteHeaderStyle: React.CSSProperties = {
  padding: '20px 22px',
  background: '#fff',
  borderRadius: 12,
  boxShadow: '0 1px 3px rgba(20,30,50,.04)',
  marginBottom: 16,
}

const statsRowStyle: React.CSSProperties = {
  display: 'flex',
  gap: 12,
  marginBottom: 16,
  flexWrap: 'wrap',
}

const pillStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 5,
  padding: '4px 10px',
  background: '#fff',
  border: '1px solid #E6E8EC',
  borderRadius: 999,
  fontSize: 11.5,
  color: '#3A5CA8',
  fontWeight: 600,
}

const tableBoxStyle: React.CSSProperties = {
  background: '#fff',
  borderRadius: 12,
  boxShadow: '0 1px 3px rgba(20,30,50,.04)',
  overflow: 'hidden',
  marginBottom: 20,
}

const tableStyle: React.CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse',
  fontSize: 13,
}

const thStyle: React.CSSProperties = {
  textAlign: 'left',
  padding: '10px 12px',
  background: '#F8F9FB',
  color: '#5A6070',
  fontSize: 10.5,
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '.05em',
  borderBottom: '1px solid #E6E8EC',
  whiteSpace: 'nowrap',
}

const tdStyle: React.CSSProperties = {
  padding: '10px 12px',
  borderBottom: '1px solid #F1F2F5',
  color: '#1C2130',
  fontVariantNumeric: 'tabular-nums',
}

const footerStyle: React.CSSProperties = {
  padding: '14px 18px',
  background: '#F0F5FF',
  border: '1px solid #D0DDF2',
  borderRadius: 10,
  fontSize: 12.5,
  color: '#5A6070',
  lineHeight: 1.5,
}

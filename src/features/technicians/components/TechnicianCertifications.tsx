import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import { AlertCircle, Award, CheckCircle2, Clock, Plus, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import {
  createCertification,
  deleteCertification,
  listCertificationsForTechnician,
} from '../certificationsApi'
import type { Certification } from '../certificationsApi'

type Props = {
  technicianId: string
  organizationId: string
}

type Severity = 'expired' | 'urgent' | 'soon' | 'ok' | 'none'

function classify(expiresAt: string | null): Severity {
  if (!expiresAt) return 'none'
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const exp = new Date(expiresAt)
  exp.setHours(0, 0, 0, 0)
  const days = Math.floor((exp.getTime() - today.getTime()) / (24 * 60 * 60 * 1000))
  if (days < 0) return 'expired'
  if (days <= 30) return 'urgent'
  if (days <= 90) return 'soon'
  return 'ok'
}

function formatDate(d: string | null): string {
  if (!d) return '—'
  try {
    return format(new Date(d), 'd MMM yyyy', { locale: fr })
  } catch {
    return d
  }
}

function daysLabel(expiresAt: string | null): string {
  if (!expiresAt) return ''
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const exp = new Date(expiresAt)
  exp.setHours(0, 0, 0, 0)
  const days = Math.floor((exp.getTime() - today.getTime()) / (24 * 60 * 60 * 1000))
  if (days < 0) return `Expirée depuis ${Math.abs(days)} j`
  if (days === 0) return "Expire aujourd'hui"
  if (days === 1) return 'Expire demain'
  return `Dans ${days} jours`
}

const SEV_META: Record<Severity, { cls: string; icon: typeof AlertCircle }> = {
  expired: { cls: 'sev-overdue', icon: AlertCircle },
  urgent: { cls: 'sev-urgent', icon: Clock },
  soon: { cls: 'sev-soon', icon: Award },
  ok: { cls: 'sev-ok', icon: CheckCircle2 },
  none: { cls: '', icon: Award },
}

export function TechnicianCertifications({ technicianId, organizationId }: Props) {
  const [certs, setCerts] = useState<Certification[]>([])
  const [loading, setLoading] = useState(true)
  const [formOpen, setFormOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [name, setName] = useState('')
  const [issuingBody, setIssuingBody] = useState('')
  const [issuedAt, setIssuedAt] = useState('')
  const [expiresAt, setExpiresAt] = useState('')

  async function reload() {
    try {
      const data = await listCertificationsForTechnician(technicianId)
      setCerts(data)
    } catch (err) {
      console.error('Erreur chargement certifications', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void reload()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [technicianId])

  function resetForm() {
    setName('')
    setIssuingBody('')
    setIssuedAt('')
    setExpiresAt('')
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    setSaving(true)
    try {
      await createCertification(organizationId, technicianId, {
        name: name.trim(),
        issuing_body: issuingBody.trim() || undefined,
        issued_at: issuedAt || undefined,
        expires_at: expiresAt || undefined,
      })
      resetForm()
      setFormOpen(false)
      void reload()
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(c: Certification) {
    if (!window.confirm(`Supprimer l'habilitation "${c.name}" ?`)) return
    try {
      await deleteCertification(c.id)
      void reload()
    } catch (err) {
      console.error('Erreur suppression certification', err)
    }
  }

  return (
    <div className="certs-section">
      <div className="certs-header">
        <span className="certs-title">Habilitations &amp; formations</span>
        {!formOpen && (
          <button
            type="button"
            className="act-btn subtle"
            onClick={() => setFormOpen(true)}
          >
            <Plus size={12} strokeWidth={2.2} />
            Ajouter
          </button>
        )}
      </div>

      {formOpen && (
        <form className="cert-form" onSubmit={(e) => void handleAdd(e)}>
          <input
            type="text"
            placeholder="Ex: Habilitation électrique B1V, SST, Formation SSI…"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
            maxLength={80}
          />
          <input
            type="text"
            placeholder="Organisme (optionnel) : INRS, APAVE…"
            value={issuingBody}
            onChange={(e) => setIssuingBody(e.target.value)}
            maxLength={60}
          />
          <div className="cert-form-dates">
            <div>
              <label>Obtention</label>
              <input
                type="date"
                value={issuedAt}
                onChange={(e) => setIssuedAt(e.target.value)}
              />
            </div>
            <div>
              <label>Expiration</label>
              <input
                type="date"
                value={expiresAt}
                onChange={(e) => setExpiresAt(e.target.value)}
              />
            </div>
          </div>
          <div className="cert-form-actions">
            <button
              type="button"
              className="block-form-btn subtle"
              onClick={() => {
                resetForm()
                setFormOpen(false)
              }}
              disabled={saving}
            >
              Annuler
            </button>
            <button type="submit" className="block-form-btn" disabled={saving || !name.trim()}>
              {saving ? '…' : 'Ajouter'}
            </button>
          </div>
        </form>
      )}

      {loading && <p className="text-ink-3 text-xs font-light" style={{ marginTop: '.4rem' }}>Chargement…</p>}

      {!loading && certs.length === 0 && !formOpen && (
        <p className="text-ink-3 text-xs font-light" style={{ marginTop: '.4rem' }}>
          Aucune habilitation enregistrée. Ajoute SST, habilitation électrique, formation SSI pour recevoir une alerte avant expiration.
        </p>
      )}

      {!loading && certs.length > 0 && (
        <div className="certs-list">
          {certs.map((c) => {
            const sev = classify(c.expires_at)
            const meta = SEV_META[sev]
            const Icon = meta.icon
            return (
              <div key={c.id} className={`cert-row ${meta.cls}`}>
                <div className="cert-icon">
                  <Icon size={14} strokeWidth={2} />
                </div>
                <div className="cert-main">
                  <div className="cert-name">{c.name}</div>
                  <div className="cert-meta">
                    {c.issuing_body && <>{c.issuing_body} · </>}
                    {c.issued_at && <>Obtenue le {formatDate(c.issued_at)}</>}
                    {!c.issued_at && !c.issuing_body && 'Sans date d\'obtention'}
                  </div>
                </div>
                <div className="cert-due">
                  {c.expires_at ? (
                    <>
                      <div className="cert-due-date">{formatDate(c.expires_at)}</div>
                      <div className="cert-due-days">{daysLabel(c.expires_at)}</div>
                    </>
                  ) : (
                    <span className="text-ink-3 text-xs">Pas d'expiration</span>
                  )}
                </div>
                <button
                  type="button"
                  className="cert-remove"
                  onClick={() => void handleDelete(c)}
                  aria-label="Supprimer"
                >
                  <X size={12} strokeWidth={2.5} />
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

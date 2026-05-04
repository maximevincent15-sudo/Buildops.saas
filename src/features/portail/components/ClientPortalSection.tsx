import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import { CheckCircle2, Copy, Mail, Plus, Trash2, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useAuthStore } from '../../auth/store'
import {
  buildPortalUrl,
  createClientToken,
  deleteClientToken,
  listClientTokens,
  revokeClientToken,
} from '../api'
import type { ClientPortalToken } from '../api'

type Props = {
  clientId: string
  clientName: string
  clientEmail: string | null
}

function formatDate(d: string | null): string {
  if (!d) return '—'
  try {
    return format(new Date(d), 'd MMM yyyy', { locale: fr })
  } catch {
    return d
  }
}

function isActive(token: ClientPortalToken): boolean {
  if (token.revoked_at) return false
  if (new Date(token.expires_at) < new Date()) return false
  return true
}

export function ClientPortalSection({ clientId, clientName, clientEmail }: Props) {
  const profile = useAuthStore((s) => s.profile)
  const [tokens, setTokens] = useState<ClientPortalToken[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [copiedId, setCopiedId] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    try {
      const data = await listClientTokens(clientId)
      setTokens(data)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [clientId])

  async function handleCreate() {
    if (!profile?.organization_id) return
    setCreating(true)
    try {
      await createClientToken(profile.organization_id, clientId, clientEmail ?? undefined)
      void load()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erreur')
    } finally {
      setCreating(false)
    }
  }

  async function handleCopy(token: ClientPortalToken) {
    const url = buildPortalUrl(token.token)
    try {
      await navigator.clipboard.writeText(url)
      setCopiedId(token.id)
      setTimeout(() => setCopiedId(null), 2000)
    } catch {
      // ignore
    }
  }

  function handleSendEmail(token: ClientPortalToken) {
    if (!clientEmail) {
      alert("L'email du client n'est pas renseigné — saisis-le d'abord dans la fiche.")
      return
    }
    const url = buildPortalUrl(token.token)
    const orgName = profile?.organizations?.name ?? 'Maintenance'
    const subject = `Votre espace client ${orgName}`
    const body =
      `Bonjour,\n\n` +
      `Vous trouverez ci-dessous votre lien d'accès personnel à votre espace client ${orgName}.\n\n` +
      `Vous pourrez y consulter à tout moment :\n` +
      `• Vos rapports d'intervention (PDF téléchargeables)\n` +
      `• Vos factures\n` +
      `• Vos interventions à venir\n` +
      `• Faire une demande d'intervention\n\n` +
      `🔗 Accéder à votre espace :\n${url}\n\n` +
      `Ce lien est strictement personnel et expire le ${formatDate(token.expires_at)}.\n` +
      `À conserver précieusement.\n\n` +
      `Cordialement,\n${orgName}`
    const params = new URLSearchParams()
    params.set('subject', subject)
    params.set('body', body)
    const qs = params.toString().replace(/\+/g, '%20')
    window.location.href = `mailto:${encodeURIComponent(clientEmail)}?${qs}`
  }

  async function handleRevoke(id: string) {
    if (!window.confirm('Révoquer ce lien d\'accès ? Le client ne pourra plus accéder à son espace avec ce lien.')) return
    try {
      await revokeClientToken(id)
      void load()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erreur')
    }
  }

  async function handleDelete(id: string) {
    if (!window.confirm('Supprimer ce lien définitivement ?')) return
    try {
      await deleteClientToken(id)
      void load()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erreur')
    }
  }

  const activeTokens = tokens.filter(isActive)
  const inactiveTokens = tokens.filter((t) => !isActive(t))

  return (
    <div className="certs-section">
      <div className="certs-header">
        <span className="certs-title">Espace client en ligne</span>
        <button
          type="button"
          className="act-btn subtle"
          onClick={() => void handleCreate()}
          disabled={creating}
        >
          <Plus size={12} strokeWidth={2.2} />
          {creating ? 'Création…' : 'Générer un lien'}
        </button>
      </div>

      {loading && (
        <p className="text-ink-3 text-xs font-light" style={{ marginTop: '.4rem' }}>
          Chargement…
        </p>
      )}

      {!loading && tokens.length === 0 && (
        <p className="text-ink-3 text-xs font-light" style={{ marginTop: '.4rem' }}>
          Aucun lien d'accès n'a été créé pour ce client. Génère un lien pour
          permettre à <strong>{clientName}</strong> de consulter ses rapports
          et factures en ligne.
        </p>
      )}

      {/* Tokens actifs */}
      {activeTokens.length > 0 && (
        <div className="portal-tokens-list" style={{ marginTop: '.6rem' }}>
          {activeTokens.map((t) => (
            <div key={t.id} className="portal-token-row active">
              <div className="portal-token-status">
                <CheckCircle2 size={13} strokeWidth={2} />
                <span>Actif</span>
              </div>
              <div className="portal-token-meta">
                Expire le {formatDate(t.expires_at)}
                {t.last_used_at ? (
                  <> · vu {formatDate(t.last_used_at)}</>
                ) : (
                  <> · jamais ouvert</>
                )}
              </div>
              <div className="portal-token-actions">
                <button
                  type="button"
                  className="qa-btn"
                  onClick={() => void handleCopy(t)}
                  title="Copier le lien"
                >
                  <Copy size={12} strokeWidth={2} />
                </button>
                <button
                  type="button"
                  className="qa-btn"
                  onClick={() => handleSendEmail(t)}
                  title="Envoyer par email"
                >
                  <Mail size={12} strokeWidth={2} />
                </button>
                <button
                  type="button"
                  className="qa-btn"
                  onClick={() => void handleRevoke(t.id)}
                  title="Révoquer ce lien"
                >
                  <X size={13} strokeWidth={2.2} />
                </button>
              </div>
              {copiedId === t.id && (
                <span className="text-grn text-xs font-light" style={{ marginLeft: 'auto' }}>
                  ✓ copié
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Tokens inactifs (révoqués / expirés) */}
      {inactiveTokens.length > 0 && (
        <div className="portal-tokens-list" style={{ marginTop: '.5rem', opacity: 0.7 }}>
          {inactiveTokens.slice(0, 3).map((t) => (
            <div key={t.id} className="portal-token-row inactive">
              <div className="portal-token-status">
                <X size={13} strokeWidth={2} />
                <span>{t.revoked_at ? 'Révoqué' : 'Expiré'}</span>
              </div>
              <div className="portal-token-meta">
                {t.revoked_at ? `Révoqué le ${formatDate(t.revoked_at)}` : `Expiré le ${formatDate(t.expires_at)}`}
              </div>
              <div className="portal-token-actions">
                <button
                  type="button"
                  className="qa-btn"
                  onClick={() => void handleDelete(t.id)}
                  title="Supprimer définitivement"
                >
                  <Trash2 size={12} strokeWidth={2} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

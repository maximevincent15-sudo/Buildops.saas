import { Bell, CalendarDays, CheckCircle2, ClipboardCheck, Crown, Sparkles, Smartphone, UserCircle } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { LoginForm } from '../features/auth/components/LoginForm'
import { RegisterForm } from '../features/auth/components/RegisterForm'
import { useAuthStore } from '../features/auth/store'
import { fetchProfile } from '../features/auth/api'
import { acceptInvitation, getInvitationPreview } from '../features/equipe/api'
import type { InvitationPreview } from '../features/equipe/api'

type Tab = 'login' | 'register'

export function AuthPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const inviteToken = searchParams.get('invite')
  const [tab, setTab] = useState<Tab>(inviteToken ? 'register' : 'login')
  const [preview, setPreview] = useState<InvitationPreview | null>(null)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [acceptError, setAcceptError] = useState<string | null>(null)
  const [accepting, setAccepting] = useState(false)
  const setProfile = useAuthStore((s) => s.setProfile)
  const session = useAuthStore((s) => s.session)
  const user = useAuthStore((s) => s.user)

  // Charge le preview de l'invitation
  useEffect(() => {
    if (!inviteToken) return
    let alive = true
    void getInvitationPreview(inviteToken)
      .then((res) => {
        if (!alive) return
        if ('error' in res) {
          setPreviewError(
            res.error === 'invalid_or_expired'
              ? 'Cette invitation est invalide ou a expiré.'
              : `Erreur : ${res.error}`,
          )
        } else {
          setPreview(res)
        }
      })
      .catch((err) => {
        if (alive) setPreviewError(err instanceof Error ? err.message : 'Erreur')
      })
    return () => { alive = false }
  }, [inviteToken])

  // Si l'utilisateur est déjà connecté ET qu'il y a un token invite, on tente
  // d'accepter l'invitation directement.
  useEffect(() => {
    if (!inviteToken || !session || !user || accepting) return
    let alive = true
    setAccepting(true)
    void acceptInvitation(inviteToken)
      .then(async (res) => {
        if (!alive) return
        if ('error' in res) {
          if (res.error === 'email_mismatch') {
            setAcceptError(
              'Cette invitation a été envoyée à une autre adresse email. Connecte-toi avec le bon compte.',
            )
          } else if (res.error === 'invalid_or_expired') {
            setAcceptError('Cette invitation est invalide ou a expiré.')
          } else {
            setAcceptError(`Erreur : ${res.error}`)
          }
          return
        }
        // Refetch profile pour récupérer la nouvelle organisation
        try {
          const fresh = await fetchProfile(user.id)
          setProfile(fresh)
        } catch { /* ignore */ }
        // Nettoie le token de l'URL
        const next = new URLSearchParams(searchParams)
        next.delete('invite')
        setSearchParams(next, { replace: true })
        // Redirection après un court délai (pour montrer le succès)
        setTimeout(() => {
          window.location.href = '/dashboard'
        }, 1200)
      })
      .catch((err) => {
        if (alive) setAcceptError(err instanceof Error ? err.message : 'Erreur')
      })
      .finally(() => {
        if (alive) setAccepting(false)
      })
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inviteToken, session, user])

  return (
    <div className="auth-layout">
      <aside className="auth-left">
        <div className="auth-bg" />
        <div className="auth-grid" />
        <div className="auth-body">
          <h2>
            Maintenance incendie
            <br />
            sous <em>contrôle total</em>
          </h2>
          <p>Conçu pour les entreprises de maintenance incendie de 3 à 20 techniciens.</p>
          <div className="af-list">
            <div className="af-item">
              <div className="af-dot" style={{ background: 'rgba(58,92,168,.3)', color: '#bdd1ff' }}>
                <CalendarDays size={14} strokeWidth={1.8} />
              </div>
              <span>Planning des interventions — extincteurs, RIA, SSI, désenfumage</span>
            </div>
            <div className="af-item">
              <div className="af-dot" style={{ background: 'rgba(58,92,168,.25)', color: '#bdd1ff' }}>
                <Smartphone size={14} strokeWidth={1.8} />
              </div>
              <span>Rapports PDF depuis le téléphone du technicien</span>
            </div>
            <div className="af-item">
              <div className="af-dot" style={{ background: 'rgba(58,92,168,.2)', color: '#bdd1ff' }}>
                <Bell size={14} strokeWidth={1.8} />
              </div>
              <span>Alertes avant chaque échéance réglementaire</span>
            </div>
            <div className="af-item">
              <div className="af-dot" style={{ background: 'rgba(46,125,94,.25)', color: '#a5d5bf' }}>
                <ClipboardCheck size={14} strokeWidth={1.8} />
              </div>
              <span>Traçabilité complète pour les contrôles</span>
            </div>
          </div>
        </div>
        <div className="auth-foot">
          <div className="tmini">
            <div className="tmini-av">RB</div>
            <p>
              "Ce qui m'a convaincu, c'est les alertes réglementaires. J'avais déjà eu un problème avec un contrôle SSI oublié." —{' '}
              <strong>Romain B., 4 techniciens</strong>
            </p>
          </div>
        </div>
      </aside>

      <section className="auth-right">
        <div className="auth-card">
          {/* Bandeau invitation */}
          {inviteToken && (
            <div className="invite-banner">
              {previewError ? (
                <div className="invite-banner-error">
                  <span>⚠️ {previewError}</span>
                </div>
              ) : preview ? (
                <>
                  <div className="invite-banner-icon">
                    {preview.role === 'admin' ? <Crown size={18} strokeWidth={2} /> : <UserCircle size={18} strokeWidth={2} />}
                  </div>
                  <div>
                    <div className="invite-banner-title">
                      Invitation à rejoindre <strong>{preview.organization_name}</strong>
                    </div>
                    <div className="invite-banner-sub">
                      en tant que <strong>{preview.role === 'admin' ? 'administrateur' : 'membre'}</strong>
                      {' · '}adresse {preview.email}
                    </div>
                  </div>
                </>
              ) : (
                <div className="invite-banner-loading">
                  <Sparkles size={14} strokeWidth={2} />
                  <span>Chargement de l'invitation…</span>
                </div>
              )}
            </div>
          )}

          {/* État acceptation */}
          {accepting && !acceptError && (
            <div className="invite-status">
              <Sparkles size={14} strokeWidth={2} />
              Acceptation de l'invitation en cours…
            </div>
          )}
          {acceptError && (
            <div className="invite-status error">
              <span>⚠️ {acceptError}</span>
            </div>
          )}
          {!accepting && !acceptError && session && inviteToken && !previewError && (
            <div className="invite-status success">
              <CheckCircle2 size={14} strokeWidth={2.2} />
              Bienvenue ! Redirection en cours…
            </div>
          )}

          <div className="atabs">
            <button
              type="button"
              className={`atab${tab === 'login' ? ' on' : ''}`}
              onClick={() => setTab('login')}
            >
              Connexion
            </button>
            <button
              type="button"
              className={`atab${tab === 'register' ? ' on' : ''}`}
              onClick={() => setTab('register')}
            >
              {inviteToken ? 'Créer mon compte' : 'Créer un compte'}
            </button>
          </div>

          {tab === 'login' ? (
            <LoginForm prefilledEmail={preview?.email} />
          ) : (
            <RegisterForm prefilledEmail={preview?.email} hideCompanyField={!!inviteToken} />
          )}
        </div>
      </section>
    </div>
  )
}

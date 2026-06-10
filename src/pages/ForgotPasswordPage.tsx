import { ArrowLeft, CheckCircle2, Mail } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { requestPasswordReset } from '../features/auth/api'
import { TurnstileWidget } from '../features/auth/components/TurnstileWidget'

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)
  const [captchaToken, setCaptchaToken] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!email.trim()) return
    setError(null)
    setLoading(true)
    try {
      await requestPasswordReset(email.trim(), captchaToken ?? undefined)
      setSent(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-layout">
      <aside className="auth-left">
        <div className="auth-bg" />
        <div className="auth-grid" />
        <div className="auth-body">
          <h2>
            Récupération
            <br />
            de <em>votre accès</em>
          </h2>
          <p>Pas de panique. On vous envoie un lien sécurisé pour réinitialiser votre mot de passe.</p>
        </div>
      </aside>

      <section className="auth-right">
        <div className="auth-card">
          <div style={{ marginBottom: 16 }}>
            <Link to="/auth" className="atab" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, padding: '6px 10px', textDecoration: 'none' }}>
              <ArrowLeft size={14} strokeWidth={2} />
              Retour à la connexion
            </Link>
          </div>

          {sent ? (
            <div className="suc-scr on">
              <div className="suc-ico"><CheckCircle2 size={28} strokeWidth={2} /></div>
              <h3>Email envoyé !</h3>
              <p>
                Si un compte existe avec l'adresse <strong>{email}</strong>, vous recevrez un lien
                pour réinitialiser votre mot de passe dans les prochaines minutes.
              </p>
              <p style={{ fontSize: 12, color: 'var(--ink2)', marginTop: 12 }}>
                Pensez à vérifier vos spams si vous ne le voyez pas.
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="fp on">
              <div>
                <p className="fp-title">Mot de passe oublié ?</p>
                <p className="fp-sub">Entrez votre email, on vous envoie un lien de réinitialisation.</p>
              </div>

              <div className="fg">
                <label>Adresse email</label>
                <input
                  type="email"
                  placeholder="vous@entreprise.fr"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>

              <TurnstileWidget onToken={setCaptchaToken} />

              {error && <span className="ferr on">{error}</span>}

              <button type="submit" className="sub-btn" disabled={loading || !email.trim() || !captchaToken}>
                {loading ? 'Envoi en cours…' : (
                  <>
                    <Mail size={14} strokeWidth={2} style={{ marginRight: 6 }} />
                    Envoyer le lien
                  </>
                )}
              </button>
            </form>
          )}
        </div>
      </section>
    </div>
  )
}

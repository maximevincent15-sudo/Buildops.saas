import { CheckCircle2, ShieldCheck } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { updatePassword } from '../features/auth/api'
import { useAuthStore } from '../features/auth/store'

function passwordStrength(pwd: string): { score: 0 | 1 | 2 | 3 | 4; label: string; cls: 'w' | 'm' | 's' | '' } {
  if (!pwd) return { score: 0, label: 'Saisissez un nouveau mot de passe', cls: '' }
  let score = 0
  if (pwd.length >= 8) score++
  if (/[A-Z]/.test(pwd)) score++
  if (/[0-9]/.test(pwd)) score++
  if (/[^A-Za-z0-9]/.test(pwd)) score++
  const cls = score <= 1 ? 'w' : score <= 2 ? 'm' : 's'
  const label = ['', 'Faible', 'Faible', 'Moyen', 'Fort'][score] ?? ''
  return { score: score as 0 | 1 | 2 | 3 | 4, label, cls }
}

export function ResetPasswordPage() {
  const navigate = useNavigate()
  const session = useAuthStore((s) => s.session)
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  // Supabase ouvre une session temporaire quand l'utilisateur clique sur le lien
  // dans son email. Si pas de session après ~2s, le lien est invalide ou expiré.
  const [linkInvalid, setLinkInvalid] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => {
      if (!session) setLinkInvalid(true)
    }, 2000)
    return () => clearTimeout(t)
  }, [session])

  const strength = passwordStrength(password)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (password.length < 8) {
      setError('Le mot de passe doit contenir au moins 8 caractères.')
      return
    }
    if (password !== confirm) {
      setError('Les deux mots de passe ne correspondent pas.')
      return
    }
    setLoading(true)
    try {
      await updatePassword(password)
      setDone(true)
      setTimeout(() => navigate('/dashboard', { replace: true }), 1500)
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
            Nouveau
            <br />
            <em>mot de passe</em>
          </h2>
          <p>Choisissez un mot de passe robuste pour sécuriser votre espace Firovia.</p>
        </div>
      </aside>

      <section className="auth-right">
        <div className="auth-card">
          {linkInvalid && !session ? (
            <div className="suc-scr on">
              <div className="suc-ico" style={{ background: '#FCE8E8', color: '#A83A3A' }}>⚠️</div>
              <h3>Lien invalide ou expiré</h3>
              <p>Le lien de réinitialisation a expiré ou est invalide.</p>
              <button
                type="button"
                className="sub-btn"
                style={{ marginTop: 16 }}
                onClick={() => navigate('/forgot-password')}
              >
                Demander un nouveau lien
              </button>
            </div>
          ) : done ? (
            <div className="suc-scr on">
              <div className="suc-ico"><CheckCircle2 size={28} strokeWidth={2} /></div>
              <h3>Mot de passe modifié !</h3>
              <p>Redirection vers votre tableau de bord…</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="fp on">
              <div>
                <p className="fp-title">
                  <ShieldCheck size={20} strokeWidth={2} style={{ verticalAlign: -4, marginRight: 6 }} />
                  Nouveau mot de passe
                </p>
                <p className="fp-sub">Choisissez un mot de passe sécurisé d'au moins 8 caractères.</p>
              </div>

              <div className="fg">
                <label>Nouveau mot de passe</label>
                <div className="pw-wrap">
                  <input
                    type="password"
                    placeholder="8 caractères minimum"
                    autoComplete="new-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                </div>
                <div className="str-row">
                  {[1, 2, 3, 4].map((i) => (
                    <div
                      key={i}
                      className={`str-s${strength.score >= i && strength.cls ? ' ' + strength.cls : ''}`}
                    />
                  ))}
                </div>
                <div className="str-lbl">{strength.label}</div>
              </div>

              <div className="fg">
                <label>Confirmer le mot de passe</label>
                <div className="pw-wrap">
                  <input
                    type="password"
                    placeholder="Retapez le mot de passe"
                    autoComplete="new-password"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    required
                  />
                </div>
              </div>

              {error && <span className="ferr on">{error}</span>}

              <button
                type="submit"
                className="sub-btn"
                disabled={loading || !password || !confirm}
              >
                {loading ? 'Modification…' : 'Mettre à jour mon mot de passe'}
              </button>
            </form>
          )}
        </div>
      </section>
    </div>
  )
}

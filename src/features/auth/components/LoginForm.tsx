import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { signIn } from '../api'
import { loginSchema } from '../schemas'
import type { LoginInput } from '../schemas'
import { TurnstileWidget } from './TurnstileWidget'

type Props = {
  prefilledEmail?: string
}

export function LoginForm({ prefilledEmail }: Props = {}) {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [captchaToken, setCaptchaToken] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
  })

  useEffect(() => {
    if (prefilledEmail) setValue('email', prefilledEmail)
  }, [prefilledEmail, setValue])

  async function onSubmit(data: LoginInput) {
    setSubmitError(null)
    try {
      await signIn(data, captchaToken ?? undefined)
      // Si invitation en attente, on reste sur /auth pour que l'effet d'acceptation
      // se déclenche et redirige proprement après attachement à l'orga.
      if (searchParams.get('invite')) return
      navigate('/dashboard', { replace: true })
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Erreur inconnue'
      setSubmitError(
        msg.includes('Invalid login credentials')
          ? 'Email ou mot de passe incorrect'
          : msg,
      )
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="fp on">
      <div>
        <p className="fp-title">Bon retour 👋</p>
        <p className="fp-sub">Connectez-vous à votre espace Firovia</p>
      </div>

      <div className="fg">
        <label>Adresse email</label>
        <input type="email" placeholder="vous@entreprise.fr" autoComplete="email" {...register('email')} />
        {errors.email && <span className="ferr on">{errors.email.message}</span>}
      </div>

      <div className="fg">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
          <label style={{ marginBottom: 0 }}>Mot de passe</label>
          <Link
            to="/forgot-password"
            style={{ fontSize: 12, color: 'var(--acc, #3A5CA8)', textDecoration: 'none', fontWeight: 500 }}
          >
            Mot de passe oublié ?
          </Link>
        </div>
        <div className="pw-wrap">
          <input type="password" placeholder="••••••••" autoComplete="current-password" {...register('password')} />
        </div>
        {errors.password && <span className="ferr on">{errors.password.message}</span>}
      </div>

      <TurnstileWidget onToken={setCaptchaToken} />

      {submitError && <span className="ferr on">{submitError}</span>}

      <button type="submit" className="sub-btn" disabled={isSubmitting || !captchaToken}>
        {isSubmitting ? 'Connexion…' : 'Se connecter →'}
      </button>
    </form>
  )
}

import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { useNavigate } from 'react-router-dom'
import { signUp } from '../api'
import { registerSchema } from '../schemas'
import type { RegisterInput } from '../schemas'

function passwordStrength(pwd: string): { score: 0 | 1 | 2 | 3 | 4; label: string; cls: 'w' | 'm' | 's' | '' } {
  if (!pwd) return { score: 0, label: 'Saisissez un mot de passe', cls: '' }
  let score = 0
  if (pwd.length >= 8) score++
  if (/[A-Z]/.test(pwd)) score++
  if (/[0-9]/.test(pwd)) score++
  if (/[^A-Za-z0-9]/.test(pwd)) score++
  const cls = score <= 1 ? 'w' : score <= 2 ? 'm' : 's'
  const label = ['', 'Faible', 'Faible', 'Moyen', 'Fort'][score] ?? ''
  return { score: score as 0 | 1 | 2 | 3 | 4, label, cls }
}

export function RegisterForm() {
  const navigate = useNavigate()
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<RegisterInput>({
    resolver: zodResolver(registerSchema),
  })

  const pwdValue = watch('password') ?? ''
  const strength = passwordStrength(pwdValue)

  async function onSubmit(data: RegisterInput) {
    setSubmitError(null)
    try {
      const result = await signUp(data)
      if (result.session) {
        navigate('/dashboard', { replace: true })
      } else {
        setSuccessMessage(
          'Compte créé. Vérifie ta boîte mail pour confirmer ton adresse, puis connecte-toi.',
        )
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Erreur inconnue'
      setSubmitError(
        msg.includes('already registered')
          ? 'Un compte existe déjà avec cet email'
          : msg,
      )
    }
  }

  if (successMessage) {
    return (
      <div className="suc-scr on">
        <div className="suc-ico">✓</div>
        <h3>Compte créé !</h3>
        <p>{successMessage}</p>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="fp on">
      <div>
        <p className="fp-title">Créer votre compte</p>
        <p className="fp-sub">14 jours d'essai gratuit — sans carte bancaire</p>
      </div>

      <div className="frow2">
        <div className="fg">
          <label>Prénom</label>
          <input type="text" placeholder="Thomas" autoComplete="given-name" {...register('firstName')} />
          {errors.firstName && <span className="ferr on">{errors.firstName.message}</span>}
        </div>
        <div className="fg">
          <label>Nom</label>
          <input type="text" placeholder="Moreau" autoComplete="family-name" {...register('lastName')} />
          {errors.lastName && <span className="ferr on">{errors.lastName.message}</span>}
        </div>
      </div>

      <div className="fg">
        <label>Entreprise</label>
        <input type="text" placeholder="Sécurité Pro SARL" autoComplete="organization" {...register('companyName')} />
        {errors.companyName && <span className="ferr on">{errors.companyName.message}</span>}
      </div>

      <div className="fg">
        <label>Email professionnel</label>
        <input type="email" placeholder="thomas@securite-pro.fr" autoComplete="email" {...register('email')} />
        {errors.email && <span className="ferr on">{errors.email.message}</span>}
      </div>

      <div className="fg">
        <label>Mot de passe</label>
        <div className="pw-wrap">
          <input type="password" placeholder="8 caractères minimum" autoComplete="new-password" {...register('password')} />
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
        {errors.password && <span className="ferr on">{errors.password.message}</span>}
      </div>

      {submitError && <span className="ferr on">{submitError}</span>}

      <button type="submit" className="sub-btn" disabled={isSubmitting}>
        {isSubmitting ? 'Création…' : 'Créer mon compte →'}
      </button>

      <p className="hint">
        En créant un compte, vous acceptez nos CGU et notre politique de confidentialité.
      </p>
    </form>
  )
}

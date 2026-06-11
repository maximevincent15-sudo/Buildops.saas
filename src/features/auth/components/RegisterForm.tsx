import { zodResolver } from '@hookform/resolvers/zod'
import { Building2, CheckCircle2, Loader2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { signUp } from '../api'
import { validatePassword } from '../passwordRules'
import { registerSchema } from '../schemas'
import type { RegisterInput } from '../schemas'
import { normalizeSiret } from '../siret'
import { useSiretLookup } from '../useSiretLookup'
import { PasswordChecklist } from './PasswordChecklist'
import { TurnstileWidget } from './TurnstileWidget'

type Props = {
  prefilledEmail?: string
  hideCompanyField?: boolean
}

export function RegisterForm({ prefilledEmail, hideCompanyField }: Props = {}) {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [captchaToken, setCaptchaToken] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<RegisterInput>({
    resolver: zodResolver(registerSchema),
    defaultValues: hideCompanyField
      ? { siret: 'INVITATION', companyName: '(rejoint via invitation)' }
      : undefined,
  })

  const pwdValue = watch('password') ?? ''
  const pwdValid = validatePassword(pwdValue).ok

  const siretValue = watch('siret') ?? ''
  const siretLookup = useSiretLookup(hideCompanyField ? '' : siretValue)

  // Auto-fill du nom d'entreprise quand le lookup SIRET réussit
  useEffect(() => {
    if (siretLookup.status === 'ok' && siretLookup.companyName) {
      setValue('companyName', siretLookup.companyName, { shouldValidate: true })
    }
  }, [siretLookup, setValue])

  useEffect(() => {
    if (prefilledEmail) setValue('email', prefilledEmail)
  }, [prefilledEmail, setValue])

  const siretOk = hideCompanyField || siretLookup.status === 'ok' || siretLookup.status === 'notFound'

  async function onSubmit(data: RegisterInput) {
    setSubmitError(null)
    try {
      const result = await signUp(data, captchaToken ?? undefined)
      if (result.session) {
        if (searchParams.get('invite')) return
        navigate('/dashboard', { replace: true })
      } else {
        setSuccessMessage(
          'Compte créé. Vérifiez votre boîte mail pour confirmer votre adresse, puis connectez-vous.',
        )
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Erreur inconnue'
      const lower = msg.toLowerCase()
      if (lower.includes('already registered')) {
        setSubmitError('Un compte existe déjà avec cet email')
      } else if (lower.includes('siret') || lower.includes('organizations_siret_unique')) {
        setSubmitError(
          'Cette entreprise a déjà bénéficié de son essai gratuit. Connectez-vous ou contactez-nous pour ajouter un nouvel utilisateur.',
        )
      } else {
        setSubmitError(msg)
      }
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

      {!hideCompanyField && (
        <div className="fg">
          <label>
            SIRET de votre entreprise
            <span style={{ color: 'var(--ink3)', fontWeight: 400, marginLeft: 6 }}>
              (14 chiffres)
            </span>
          </label>
          <input
            type="text"
            inputMode="numeric"
            placeholder="123 456 789 00012"
            autoComplete="off"
            maxLength={20}
            {...register('siret', {
              onChange: (e) => {
                const normalized = normalizeSiret(e.target.value)
                e.target.value = normalized
              },
            })}
          />
          <SiretFeedback state={siretLookup} rawValue={siretValue} />
          {errors.siret && siretLookup.status === 'idle' && (
            <span className="ferr on">{errors.siret.message}</span>
          )}
        </div>
      )}
      {hideCompanyField && <input type="hidden" {...register('siret')} />}

      {!hideCompanyField && (
        <div className="fg">
          <label>Nom de l'entreprise</label>
          <input
            type="text"
            placeholder="Sécurité Pro SARL"
            autoComplete="organization"
            {...register('companyName')}
          />
          {errors.companyName && <span className="ferr on">{errors.companyName.message}</span>}
        </div>
      )}
      {hideCompanyField && <input type="hidden" {...register('companyName')} />}

      <div className="fg">
        <label>Email professionnel</label>
        <input type="email" placeholder="thomas@securite-pro.fr" autoComplete="email" {...register('email')} />
        {errors.email && <span className="ferr on">{errors.email.message}</span>}
      </div>

      <div className="fg">
        <label>Mot de passe</label>
        <div className="pw-wrap">
          <input type="password" placeholder="Mot de passe sécurisé" autoComplete="new-password" {...register('password')} />
        </div>
        <PasswordChecklist password={pwdValue} />
      </div>

      <TurnstileWidget onToken={setCaptchaToken} />

      {submitError && <span className="ferr on">{submitError}</span>}

      <button
        type="submit"
        className="sub-btn"
        disabled={isSubmitting || !pwdValid || !captchaToken || !siretOk}
      >
        {isSubmitting ? 'Création…' : 'Créer mon compte →'}
      </button>

      <p className="hint">
        En créant un compte, vous acceptez nos CGU et notre politique de confidentialité.
      </p>
    </form>
  )
}

// ───────── Sous-composant feedback SIRET ─────────
function SiretFeedback({
  state,
  rawValue,
}: {
  state: ReturnType<typeof useSiretLookup>
  rawValue: string
}) {
  const normalized = normalizeSiret(rawValue)
  if (normalized.length === 0) {
    return (
      <span className="hint" style={{ fontSize: 12, color: 'var(--ink3)', marginTop: 4 }}>
        Le SIRET nous sert à vérifier votre entreprise et à pré-remplir vos infos.
      </span>
    )
  }

  if (state.status === 'loading') {
    return (
      <span className="hint" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--ink2)', fontSize: 12, marginTop: 4 }}>
        <Loader2 size={12} className="spin" /> Vérification…
      </span>
    )
  }

  if (state.status === 'invalid') {
    return <span className="ferr on">{state.reason}</span>
  }

  if (state.status === 'taken') {
    return (
      <span className="ferr on" style={{ lineHeight: 1.5 }}>
        Ce SIRET a déjà été utilisé pour créer un compte Firovia.{' '}
        <Link to="/auth" style={{ color: 'var(--acc)', textDecoration: 'underline' }}>
          Se connecter
        </Link>
      </span>
    )
  }

  if (state.status === 'notFound') {
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--ink2)', fontSize: 12, marginTop: 4 }}>
        <Building2 size={12} /> SIRET non trouvé dans l'annuaire — vous pouvez quand même continuer.
      </span>
    )
  }

  if (state.status === 'ok') {
    return (
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'flex-start',
          gap: 6,
          color: 'var(--grn, #1e7a3e)',
          fontSize: 12,
          marginTop: 4,
          lineHeight: 1.4,
        }}
      >
        <CheckCircle2 size={14} style={{ flexShrink: 0, marginTop: 1 }} />
        <span>
          <strong>{state.companyName}</strong>
          {state.address && (
            <>
              <br />
              <span style={{ color: 'var(--ink3)' }}>{state.address}</span>
            </>
          )}
        </span>
      </span>
    )
  }

  return null
}

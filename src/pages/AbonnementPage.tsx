import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ExternalLink, CheckCircle2, XCircle } from 'lucide-react'
import { useSubscription } from '../features/billing/hooks'
import { PLAN_OFFERS } from '../features/billing/constants'
import { createCheckoutSession, createPortalSession } from '../features/billing/api'
import { PlanCard } from '../features/billing/components/PlanCard'
import type { BillingPeriod, Plan } from '../features/billing/schemas'

const STATUS_LABELS: Record<string, string> = {
  trialing: 'Essai gratuit',
  active: 'Actif',
  past_due: 'Paiement en retard',
  canceled: 'Annulé',
  unpaid: 'Impayé',
  incomplete: 'Incomplet',
  incomplete_expired: 'Expiré',
}

export function AbonnementPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const { subscription, loading, reload, isActive, isTrialing, trialDaysLeft } = useSubscription()
  const [period, setPeriod] = useState<BillingPeriod>('yearly')
  const [redirecting, setRedirecting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [statusToast, setStatusToast] = useState<'success' | 'canceled' | null>(null)

  // Gestion du retour depuis Stripe Checkout (?status=success|canceled)
  useEffect(() => {
    const status = searchParams.get('status')
    if (status === 'success') {
      setStatusToast('success')
      // Recharge la subscription : le webhook Stripe a normalement déjà
      // mis à jour la DB, mais on lui laisse ~2s au cas où.
      const timer = setTimeout(() => void reload(), 2000)
      // Nettoie l'URL
      searchParams.delete('status')
      searchParams.delete('session_id')
      setSearchParams(searchParams, { replace: true })
      return () => clearTimeout(timer)
    }
    if (status === 'canceled') {
      setStatusToast('canceled')
      searchParams.delete('status')
      setSearchParams(searchParams, { replace: true })
    }
    return undefined
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleChoose(priceId: string, _plan: Plan, _period: BillingPeriod) {
    setRedirecting(true)
    setError(null)
    try {
      const url = await createCheckoutSession(priceId)
      window.location.href = url
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur inconnue')
      setRedirecting(false)
    }
  }

  async function handleOpenPortal() {
    setRedirecting(true)
    setError(null)
    try {
      const url = await createPortalSession()
      window.location.href = url
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur inconnue')
      setRedirecting(false)
    }
  }

  const currentPlanLabel = useMemo(() => {
    if (!subscription) return '—'
    if (subscription.plan) {
      const label = PLAN_OFFERS.find((o) => o.plan === subscription.plan)?.label
      return `${label ?? subscription.plan} · ${subscription.billing_period === 'yearly' ? 'annuel' : 'mensuel'}`
    }
    return STATUS_LABELS[subscription.status] ?? subscription.status
  }, [subscription])

  return (
    <>
      <div className="dash-top">
        <div>
          <div className="dash-title">Abonnement</div>
          <div className="dash-sub">Gérez votre plan Firovia et vos factures</div>
        </div>
      </div>

      {statusToast === 'success' && (
        <div style={toastStyle('success')}>
          <CheckCircle2 size={16} strokeWidth={2.5} />
          <span>Paiement confirmé — votre abonnement est activé. Bienvenue !</span>
          <button
            type="button"
            onClick={() => setStatusToast(null)}
            style={toastCloseStyle}
            aria-label="Fermer"
          >×</button>
        </div>
      )}

      {statusToast === 'canceled' && (
        <div style={toastStyle('info')}>
          <span>Vous avez annulé le paiement. Aucun frais n'a été prélevé.</span>
          <button
            type="button"
            onClick={() => setStatusToast(null)}
            style={toastCloseStyle}
            aria-label="Fermer"
          >×</button>
        </div>
      )}

      {error && (
        <div style={toastStyle('error')}>
          <XCircle size={16} strokeWidth={2.5} />
          <span>{error}</span>
          <button
            type="button"
            onClick={() => setError(null)}
            style={toastCloseStyle}
            aria-label="Fermer"
          >×</button>
        </div>
      )}

      {/* Résumé du plan actuel */}
      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '.8rem' }}>
          <div>
            <div style={{ fontSize: '.75rem', color: 'var(--ink3, #8A8F9A)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: '.3rem' }}>
              Plan actuel
            </div>
            <div style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--ink, #1C2130)' }}>
              {currentPlanLabel}
            </div>
            {isTrialing && trialDaysLeft !== null && trialDaysLeft > 0 && (
              <div style={{ fontSize: '.85rem', color: 'var(--ink2, #5A6070)', marginTop: '.3rem' }}>
                {trialDaysLeft} {trialDaysLeft === 1 ? 'jour restant' : 'jours restants'} d'essai gratuit
              </div>
            )}
            {isActive && subscription?.current_period_end && (
              <div style={{ fontSize: '.85rem', color: 'var(--ink2, #5A6070)', marginTop: '.3rem' }}>
                Prochain prélèvement le {new Date(subscription.current_period_end).toLocaleDateString('fr-FR')}
                {subscription.cancel_at_period_end && ' · annulation programmée à la fin de la période'}
              </div>
            )}
          </div>

          {subscription?.stripe_customer_id && (
            <button
              type="button"
              className="btn-sm"
              onClick={() => void handleOpenPortal()}
              disabled={redirecting}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
            >
              <ExternalLink size={13} strokeWidth={2} />
              {redirecting ? 'Redirection…' : 'Gérer mon abonnement'}
            </button>
          )}
        </div>
      </div>

      {/* Sélecteur mensuel / annuel */}
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '1.5rem' }}>
        <div style={{
          display: 'inline-flex',
          background: 'var(--wht, #F8F9FB)',
          border: '1px solid var(--brd, #E1E5EA)',
          borderRadius: 8,
          padding: 3,
        }}>
          <button
            type="button"
            onClick={() => setPeriod('monthly')}
            style={toggleStyle(period === 'monthly')}
          >
            Mensuel
          </button>
          <button
            type="button"
            onClick={() => setPeriod('yearly')}
            style={toggleStyle(period === 'yearly')}
          >
            Annuel <span style={{ fontSize: '.7rem', color: '#0E7A3F', fontWeight: 700 }}>— 2 mois offerts</span>
          </button>
        </div>
      </div>

      {/* Grille des plans */}
      {loading && !subscription ? (
        <p className="text-ink-2 text-sm font-light">Chargement…</p>
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: '1.2rem',
          marginBottom: '1.5rem',
        }}>
          {PLAN_OFFERS.map((offer) => (
            <PlanCard
              key={offer.plan}
              offer={offer}
              period={period}
              currentPlan={subscription?.plan ?? null}
              currentPeriod={subscription?.billing_period ?? null}
              onChoose={handleChoose}
              loading={redirecting}
            />
          ))}
        </div>
      )}

      {/* Enterprise / contact commercial */}
      <div className="card" style={{ background: 'var(--wht, #F8F9FB)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '.8rem' }}>
          <div>
            <div style={{ fontSize: '.95rem', fontWeight: 600, color: 'var(--ink, #1C2130)' }}>
              Plus de 20 techniciens ?
            </div>
            <div style={{ fontSize: '.85rem', color: 'var(--ink2, #5A6070)', marginTop: '.2rem' }}>
              Formule Enterprise sur devis avec fonctionnalités sur mesure, SLA garanti et onboarding accompagné.
            </div>
          </div>
          <button
            type="button"
            className="btn-sm"
            onClick={() => (window.location.href = 'mailto:contact@firovia.fr?subject=Firovia%20Enterprise')}
          >
            Nous contacter
          </button>
        </div>
      </div>

      <div style={{ marginTop: '1.5rem', fontSize: '.75rem', color: 'var(--ink3, #8A8F9A)', textAlign: 'center' }}>
        Tous les prix sont HT. TVA non applicable, art. 293 B du CGI (micro-entreprise).
        <br />
        Paiement sécurisé par Stripe · Vos données bancaires ne transitent pas par Firovia.
      </div>
    </>
  )
}

function toggleStyle(active: boolean): React.CSSProperties {
  return {
    padding: '.5rem 1.1rem',
    fontSize: '.85rem',
    fontWeight: active ? 600 : 500,
    background: active ? '#fff' : 'transparent',
    color: active ? 'var(--ink, #1C2130)' : 'var(--ink2, #5A6070)',
    border: 'none',
    borderRadius: 6,
    cursor: 'pointer',
    boxShadow: active ? '0 1px 3px rgba(0,0,0,.08)' : 'none',
  }
}

function toastStyle(kind: 'success' | 'error' | 'info'): React.CSSProperties {
  const palette = {
    success: { bg: '#E6F4EB', border: '#B7DFC7', fg: '#0E7A3F' },
    error: { bg: '#FDECEC', border: '#F0B4B4', fg: '#9B1C1C' },
    info: { bg: '#EAF2FF', border: '#B8CDEE', fg: '#1E3A5F' },
  }[kind]
  return {
    display: 'flex',
    alignItems: 'center',
    gap: '.6rem',
    padding: '.7rem 1rem',
    background: palette.bg,
    border: `1px solid ${palette.border}`,
    color: palette.fg,
    borderRadius: 8,
    marginBottom: '1rem',
    fontSize: '.85rem',
  }
}

const toastCloseStyle: React.CSSProperties = {
  marginLeft: 'auto',
  background: 'none',
  border: 'none',
  fontSize: '1.2rem',
  cursor: 'pointer',
  color: 'inherit',
  padding: 0,
  lineHeight: 1,
}

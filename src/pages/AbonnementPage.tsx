import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { AlertTriangle, ExternalLink, CheckCircle2, XCircle } from 'lucide-react'
import { useAuthStore } from '../features/auth/store'
import { useSubscription } from '../features/billing/hooks'
import { CGV_URL, CGV_VERSION, PLAN_OFFERS } from '../features/billing/constants'
import { createCheckoutSession, createPortalSession } from '../features/billing/api'
import { InvoicesList } from '../features/billing/components/InvoicesList'
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
  const { subscription, loading, reload, isActive, isTrialing, trialDaysLeft, isBlocked } = useSubscription()
  const isMember = useAuthStore((s) => s.profile?.user_role === 'member')
  const profile = useAuthStore((s) => s.profile)
  const userEmail = useAuthStore((s) => s.user?.email ?? null)
  const [quoteLoading, setQuoteLoading] = useState<Plan | null>(null)
  const [period, setPeriod] = useState<BillingPeriod>('yearly')
  const [redirecting, setRedirecting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [cgvAccepted, setCgvAccepted] = useState(false)
  const [cgvHighlight, setCgvHighlight] = useState(false)
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
    if (!cgvAccepted) {
      setCgvHighlight(true)
      document.getElementById('cgv-accept')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      return
    }
    setRedirecting(true)
    setError(null)
    try {
      const url = await createCheckoutSession(priceId, CGV_VERSION)
      window.location.href = url
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur inconnue')
      setRedirecting(false)
    }
  }

  async function handleDownloadQuote(offer: (typeof PLAN_OFFERS)[number]) {
    if (!profile?.organization_id) return
    setQuoteLoading(offer.plan)
    setError(null)
    try {
      const { downloadSubscriptionQuote } = await import('../features/billing/pdf/downloadSubscriptionQuote')
      await downloadSubscriptionQuote({
        offer,
        period,
        organizationId: profile.organization_id,
        organizationName: profile.organizations?.name ?? 'Votre entreprise',
        contactName: [profile.first_name, profile.last_name].filter(Boolean).join(' ') || null,
        contactEmail: userEmail,
      })
    } catch (e) {
      console.error('Devis abonnement', e)
      setError('Impossible de générer le devis. Réessayez ou écrivez à contact@firovia.fr.')
    } finally {
      setQuoteLoading(null)
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

      {/* Accès bloqué : essai terminé / abonnement terminé ou impayé */}
      {isBlocked && (
        <div
          className="card"
          style={{
            marginBottom: '1.5rem',
            display: 'flex',
            gap: '.8rem',
            alignItems: 'flex-start',
            background: '#FDF3EC',
            border: '1px solid #F2C9A8',
          }}
        >
          <AlertTriangle size={20} strokeWidth={2} style={{ color: '#C45A1A', flexShrink: 0, marginTop: 2 }} />
          <div style={{ fontSize: '.9rem', color: 'var(--ink2, #5A6070)', lineHeight: 1.55 }}>
            <div style={{ fontWeight: 700, color: 'var(--ink, #1C2130)', fontSize: '1rem', marginBottom: '.2rem' }}>
              {subscription?.status === 'canceled'
                ? 'Votre abonnement a pris fin'
                : subscription?.status === 'unpaid'
                  ? 'Votre abonnement est suspendu (paiement non régularisé)'
                  : 'Votre essai gratuit est terminé'}
            </div>
            {isMember
              ? "Seul un administrateur de votre entreprise peut choisir une formule : demandez-lui de se connecter à Firovia pour rétablir l'accès. Toutes vos données sont conservées."
              : "Choisissez une formule ci-dessous pour retrouver l'accès à Firovia. Toutes vos données sont conservées et l'accès est rétabli dès la validation du paiement."}
            <div style={{ marginTop: '.4rem', fontSize: '.82rem' }}>
              Une question ? <a href="mailto:contact@firovia.fr" style={{ color: 'var(--acc, #3A5CA8)', fontWeight: 500 }}>contact@firovia.fr</a>
            </div>
          </div>
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

      {/* Factures Stripe — admins d'une org déjà passée par Stripe */}
      {subscription?.stripe_customer_id && !isMember && <InvoicesList />}

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

      {/* Acceptation des CGV — obligatoire avant le paiement */}
      <label
        id="cgv-accept"
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: '.6rem',
          maxWidth: 640,
          margin: '0 auto 1.5rem',
          padding: '.75rem 1rem',
          background: cgvHighlight && !cgvAccepted ? '#FDECEC' : 'var(--wht, #F8F9FB)',
          border: `1px solid ${cgvHighlight && !cgvAccepted ? '#F0B4B4' : 'var(--brd, #E1E5EA)'}`,
          borderRadius: 8,
          fontSize: '.85rem',
          color: 'var(--ink2, #5A6070)',
          cursor: 'pointer',
          lineHeight: 1.5,
        }}
      >
        <input
          type="checkbox"
          checked={cgvAccepted}
          onChange={(e) => {
            setCgvAccepted(e.target.checked)
            if (e.target.checked) setCgvHighlight(false)
          }}
          style={{ marginTop: 3, flexShrink: 0 }}
        />
        <span>
          J'ai lu et j'accepte les{' '}
          <a href={CGV_URL} target="_blank" rel="noreferrer" style={{ color: 'var(--acc, #3A5CA8)', fontWeight: 500 }}>
            Conditions Générales de Vente
          </a>{' '}
          de Firovia, y compris l'accord de traitement des données (RGPD), au nom de mon entreprise.
          {cgvHighlight && !cgvAccepted && (
            <strong style={{ display: 'block', color: '#9B1C1C', marginTop: 2 }}>
              Cochez cette case pour choisir un plan.
            </strong>
          )}
        </span>
      </label>

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
              currentPlan={isBlocked ? null : subscription?.plan ?? null}
              currentPeriod={subscription?.billing_period ?? null}
              onChoose={handleChoose}
              loading={redirecting}
              onDownloadQuote={() => void handleDownloadQuote(offer)}
              quoteLoading={quoteLoading === offer.plan}
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

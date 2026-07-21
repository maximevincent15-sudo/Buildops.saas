import { Check } from 'lucide-react'
import type { BillingPeriod, PlanOffer, Plan } from '../schemas'
import { computeYearlySavings } from '../constants'

interface Props {
  offer: PlanOffer
  period: BillingPeriod
  currentPlan: Plan | null
  currentPeriod: BillingPeriod | null
  onChoose: (priceId: string, plan: Plan, period: BillingPeriod) => void
  loading: boolean
}

export function PlanCard({ offer, period, currentPlan, currentPeriod, onChoose, loading }: Props) {
  const price = offer.prices[period]
  const isCurrent = currentPlan === offer.plan && currentPeriod === period
  const savings = period === 'yearly' ? computeYearlySavings(offer) : 0

  const borderColor = offer.accent ? 'var(--acc, #3A5CA8)' : 'var(--brd, #E1E5EA)'
  const buttonLabel = isCurrent
    ? 'Plan actuel'
    : currentPlan
      ? 'Passer sur ce plan'
      : 'Choisir ce plan'

  return (
    <div style={{
      position: 'relative',
      background: '#fff',
      border: `1px solid ${borderColor}`,
      borderWidth: offer.accent ? 2 : 1,
      borderRadius: 12,
      padding: '1.5rem',
      display: 'flex',
      flexDirection: 'column',
      gap: '.8rem',
      minHeight: 500,
    }}>
      {offer.accent && (
        <div style={{
          position: 'absolute',
          top: -12,
          right: 20,
          background: 'var(--acc, #3A5CA8)',
          color: '#fff',
          padding: '.2rem .7rem',
          borderRadius: 999,
          fontSize: '.7rem',
          fontWeight: 700,
          letterSpacing: '.3px',
          textTransform: 'uppercase',
        }}>
          Recommandé
        </div>
      )}

      <div>
        <h3 style={{
          fontSize: '1.4rem',
          fontWeight: 700,
          color: 'var(--ink, #1C2130)',
          margin: 0,
        }}>
          {offer.label}
        </h3>
        <p style={{
          fontSize: '.85rem',
          color: 'var(--ink2, #5A6070)',
          margin: '.2rem 0 0',
        }}>
          {offer.tagline}
        </p>
      </div>

      <div style={{ borderTop: '1px solid var(--brd, #E1E5EA)', paddingTop: '.8rem' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '.3rem' }}>
          <span style={{ fontSize: '2.2rem', fontWeight: 800, color: 'var(--ink)' }}>
            {price.amount} €
          </span>
          <span style={{ fontSize: '.85rem', color: 'var(--ink2)' }}>
            HT / {price.per}
          </span>
        </div>
        {period === 'yearly' && savings > 0 && (
          <div style={{
            display: 'inline-block',
            marginTop: '.4rem',
            fontSize: '.75rem',
            color: '#0E7A3F',
            background: '#E6F4EB',
            padding: '.15rem .5rem',
            borderRadius: 4,
            fontWeight: 600,
          }}>
            Économie de {savings} € vs mensuel
          </div>
        )}
      </div>

      <ul style={{
        listStyle: 'none',
        padding: 0,
        margin: 0,
        display: 'flex',
        flexDirection: 'column',
        gap: '.5rem',
        flex: 1,
      }}>
        {offer.features.map((f) => (
          <li key={f} style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: '.5rem',
            fontSize: '.85rem',
            color: 'var(--ink)',
            lineHeight: 1.4,
          }}>
            <Check size={14} strokeWidth={2.5} color="#0E7A3F" style={{ marginTop: 2, flexShrink: 0 }} />
            <span>{f}</span>
          </li>
        ))}
      </ul>

      <button
        type="button"
        className={`btn-sm ${offer.accent && !isCurrent ? 'acc' : ''}`}
        style={{
          marginTop: 'auto',
          padding: '.7rem 1rem',
          fontSize: '.9rem',
          fontWeight: 600,
          cursor: isCurrent || loading ? 'default' : 'pointer',
          opacity: isCurrent ? 0.5 : 1,
        }}
        onClick={() => !isCurrent && !loading && onChoose(price.priceId, offer.plan, period)}
        disabled={isCurrent || loading}
      >
        {loading ? 'Redirection…' : buttonLabel}
      </button>
    </div>
  )
}

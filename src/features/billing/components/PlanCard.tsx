import { AlertTriangle, Check, FileDown } from 'lucide-react'
import { Link } from 'react-router-dom'
import type { BillingPeriod, PlanOffer, Plan } from '../schemas'
import { SEAT_DISCOUNT_FROM, billedSeats, computePlanTotal, computeYearlySavings } from '../constants'

interface Props {
  offer: PlanOffer
  period: BillingPeriod
  /** Techniciens actifs de l'organisation (base du montant estimé) */
  technicians: number
  /** Comptes de l'équipe (membres + invitations en attente) ; null = inconnu */
  accounts?: number | null
  currentPlan: Plan | null
  currentPeriod: BillingPeriod | null
  onChoose: (priceId: string, plan: Plan, period: BillingPeriod) => void
  loading: boolean
  /** Téléchargement d'un devis PDF pour cette formule / période */
  onDownloadQuote?: () => void
  quoteLoading?: boolean
}

export function PlanCard({ offer, period, technicians, accounts = null, currentPlan, currentPeriod, onChoose, loading, onDownloadQuote, quoteLoading }: Props) {
  const price = offer.prices[period]
  const isCurrent = currentPlan === offer.plan && currentPeriod === period
  const unavailable = !price.priceId
  const seats = billedSeats(offer, technicians)
  const total = computePlanTotal(offer, period, technicians)
  const savings = period === 'yearly' ? computeYearlySavings(offer, technicians) : 0
  // Comptes inclus (CGV art. 4) : un par technicien facturé + comptes bureau.
  // Plus de comptes que ça : déclarer des techniciens ou retirer des comptes avant
  const accountLimit = seats + offer.officeAccounts
  const missingSeats = accounts !== null && accounts > accountLimit ? accounts - accountLimit : 0
  const blockedByAccounts = !isCurrent && missingSeats > 0

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
      minHeight: 540,
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
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '.3rem', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '2.2rem', fontWeight: 800, color: 'var(--ink)' }}>
            {price.unit} €
          </span>
          <span style={{ fontSize: '.85rem', color: 'var(--ink2)' }}>
            HT / technicien / {price.per}
          </span>
        </div>
        <div style={{ fontSize: '.78rem', color: 'var(--ink3, #8A8F9A)', marginTop: '.2rem' }}>
          Minimum {offer.minSeats} techniciens facturés · {price.unitAfter10} € dès le {SEAT_DISCOUNT_FROM}e
          <br />
          {offer.officeAccounts} comptes bureau inclus, en plus d'un compte par technicien
        </div>

        <div style={{
          marginTop: '.7rem',
          padding: '.55rem .7rem',
          background: 'var(--wht, #F8F9FB)',
          border: '1px solid var(--brd, #E1E5EA)',
          borderRadius: 8,
          fontSize: '.82rem',
          color: 'var(--ink2, #5A6070)',
        }}>
          {technicians > 0
            ? <>Avec vos {technicians} technicien{technicians > 1 ? 's' : ''} actif{technicians > 1 ? 's' : ''}</>
            : <>Pour {seats} techniciens</>}
          {technicians > 0 && technicians < offer.minSeats && <> (minimum {offer.minSeats} facturés)</>}
          {' : '}
          <strong style={{ color: 'var(--ink, #1C2130)' }}>{total.toLocaleString('fr-FR')} € HT / {price.per}</strong>
          {seats >= SEAT_DISCOUNT_FROM && (
            <div style={{ fontSize: '.76rem', marginTop: '.15rem' }}>
              soit {SEAT_DISCOUNT_FROM - 1} × {price.unit} € + {seats - SEAT_DISCOUNT_FROM + 1} × {price.unitAfter10} € (tarif dégressif)
            </div>
          )}
          {period === 'yearly' && savings > 0 && (
            <div style={{ color: '#0E7A3F', fontWeight: 600, marginTop: '.15rem' }}>
              2 mois offerts : économie de {savings.toLocaleString('fr-FR')} € vs mensuel
            </div>
          )}
        </div>
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

      {blockedByAccounts && (
        <div style={{
          display: 'flex',
          gap: 8,
          alignItems: 'flex-start',
          background: '#FFF6E5',
          border: '1px solid #F2D49B',
          borderRadius: 8,
          padding: '.6rem .7rem',
          fontSize: '.8rem',
          lineHeight: 1.45,
          color: 'var(--ink)',
          marginBottom: '.7rem',
        }}>
          <AlertTriangle size={14} strokeWidth={2} color="#A86400" style={{ marginTop: 2, flexShrink: 0 }} />
          <span>
            Votre équipe compte {accounts} comptes : cette formule en inclut {accountLimit} (un par technicien
            facturé + {offer.officeAccounts} comptes bureau). Ajoutez {missingSeats} technicien{missingSeats > 1 ? 's' : ''} actif{missingSeats > 1 ? 's' : ''}{' '}
            dans <Link to="/techniciens">Techniciens</Link> (facturé{missingSeats > 1 ? 's' : ''}), ou retirez des comptes dans{' '}
            <Link to="/equipe">Équipe</Link>.
          </span>
        </div>
      )}

      <button
        type="button"
        className={`btn-sm ${offer.accent && !isCurrent ? 'acc' : ''}`}
        style={{
          marginTop: 'auto',
          padding: '.7rem 1rem',
          fontSize: '.9rem',
          fontWeight: 600,
          cursor: isCurrent || loading || unavailable || blockedByAccounts ? 'default' : 'pointer',
          opacity: isCurrent || unavailable || blockedByAccounts ? 0.5 : 1,
        }}
        onClick={() => !isCurrent && !loading && !unavailable && !blockedByAccounts && onChoose(price.priceId, offer.plan, period)}
        disabled={isCurrent || loading || unavailable || blockedByAccounts}
      >
        {loading ? 'Redirection…' : unavailable ? 'Bientôt disponible' : buttonLabel}
      </button>

      {onDownloadQuote && (
        <button
          type="button"
          onClick={onDownloadQuote}
          disabled={quoteLoading}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            background: 'none',
            border: 'none',
            color: 'var(--acc, #3A5CA8)',
            fontSize: '.82rem',
            fontWeight: 500,
            cursor: quoteLoading ? 'default' : 'pointer',
            padding: '.2rem',
          }}
        >
          <FileDown size={14} strokeWidth={2} />
          {quoteLoading ? 'Génération du devis…' : `Télécharger un devis (${period === 'yearly' ? 'annuel' : 'mensuel'})`}
        </button>
      )}
    </div>
  )
}

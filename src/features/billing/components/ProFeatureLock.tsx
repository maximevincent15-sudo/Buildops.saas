import { Lock } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

type Props = {
  title: string
  description: string
  bullets?: string[]
}

/** Carte affichée à la place d'une fonctionnalité réservée aux formules Pro et Entreprise. */
export function ProFeatureLock({ title, description, bullets }: Props) {
  const navigate = useNavigate()
  return (
    <div
      className="card"
      style={{
        display: 'flex',
        gap: '1rem',
        alignItems: 'flex-start',
        border: '1px dashed var(--acc, #3A5CA8)',
        background: 'var(--wht, #F8F9FB)',
      }}
    >
      <div
        style={{
          width: 36,
          height: 36,
          borderRadius: 10,
          background: 'var(--acc, #3A5CA8)',
          color: '#fff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        <Lock size={16} strokeWidth={2.2} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 700, color: 'var(--ink, #1C2130)', fontSize: '1rem' }}>
          {title} <span style={{ fontSize: '.72rem', fontWeight: 600, color: 'var(--acc, #3A5CA8)', marginLeft: 4 }}>FORMULE PRO</span>
        </div>
        <div style={{ fontSize: '.85rem', color: 'var(--ink2, #5A6070)', marginTop: '.25rem' }}>{description}</div>
        {bullets && bullets.length > 0 && (
          <ul style={{ margin: '.5rem 0 0', paddingLeft: '1.1rem', fontSize: '.85rem', color: 'var(--ink2, #5A6070)' }}>
            {bullets.map((b) => <li key={b}>{b}</li>)}
          </ul>
        )}
      </div>
      <button type="button" className="btn-sm acc" onClick={() => navigate('/abonnement')} style={{ flexShrink: 0 }}>
        Passer en Pro
      </button>
    </div>
  )
}

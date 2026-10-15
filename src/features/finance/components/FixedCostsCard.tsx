import { Calculator, Plus, Save, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { formatAmount } from '../../devis/constants'
import { listFixedCosts, saveFixedCosts } from '../api'

type Row = { label: string; amount: string }

const SUGGESTIONS = [
  'Salaires et charges sociales',
  'Loyer et locaux',
  'Véhicules (leasing, carburant, assurance)',
  'Assurances et RC Pro',
  'Logiciels, téléphonie, comptable',
]

function parseAmount(text: string): number {
  const n = Number(text.replace(/[€\s]/g, '').replace(',', '.'))
  return Number.isFinite(n) && n > 0 ? n : 0
}

/**
 * Charges fixes mensuelles (Paramètres, administrateurs) : base du résultat
 * estimé affiché sur le tableau de bord.
 */
export function FixedCostsCard({ organizationId }: { organizationId: string }) {
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [flash, setFlash] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const location = useLocation()
  const cardRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let alive = true
    void listFixedCosts()
      .then((costs) => {
        if (!alive) return
        setRows(costs.length > 0
          ? costs.map((c) => ({ label: c.label, amount: String(c.monthly_amount).replace('.', ',') }))
          : SUGGESTIONS.map((label) => ({ label, amount: '' })))
      })
      .catch((e) => alive && setError(e instanceof Error ? e.message : 'Erreur inconnue'))
      .finally(() => alive && setLoading(false))
    return () => { alive = false }
  }, [])

  // Lien direct depuis le tableau de bord (/parametres#charges-fixes)
  useEffect(() => {
    if (!loading && location.hash === '#charges-fixes') {
      cardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }, [loading, location.hash])

  const total = rows.reduce((s, r) => s + parseAmount(r.amount), 0)

  function update(i: number, patch: Partial<Row>) {
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)))
    setFlash(null)
  }

  async function handleSave() {
    setSaving(true)
    setError(null)
    try {
      const kept = rows
        .filter((r) => r.label.trim() && parseAmount(r.amount) > 0)
        .map((r) => ({ label: r.label, monthly_amount: parseAmount(r.amount) }))
      await saveFixedCosts(organizationId, kept)
      setFlash(kept.length > 0
        ? `Enregistré : ${formatAmount(total)} de charges fixes par mois. Le tableau de bord affiche maintenant ton résultat estimé.`
        : 'Aucune charge enregistrée : le tableau de bord n\'affiche que la marge.')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur inconnue')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="card" id="charges-fixes" ref={cardRef} style={{ marginTop: '1rem', scrollMarginTop: 80 }}>
      <div className="card-top">
        <span className="card-title" style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          <Calculator size={14} strokeWidth={1.8} />
          Charges fixes mensuelles
        </span>
        <span className="text-ink-3 text-xs font-light">Visible par les administrateurs uniquement</span>
      </div>
      <p className="text-ink-2 text-sm font-light" style={{ margin: '0 0 .8rem' }}>
        Renseigne tes charges fixes du mois (montants HT). Le tableau de bord les déduit de ta marge
        pour afficher ton <strong>bénéfice ou ta perte estimés</strong>, mois par mois.
      </p>

      {loading ? (
        <p className="text-ink-3 text-sm font-light">Chargement…</p>
      ) : (
        <>
          <div style={{ display: 'grid', gap: '.5rem' }}>
            {rows.map((r, i) => (
              <div key={i} style={{ display: 'flex', gap: '.5rem', alignItems: 'center' }}>
                <input
                  type="text"
                  className="input-sm"
                  value={r.label}
                  placeholder="Libellé (ex. Loyer)"
                  onChange={(e) => update(i, { label: e.target.value })}
                  style={{ flex: 1, minWidth: 0 }}
                />
                <input
                  type="text"
                  inputMode="decimal"
                  className="input-sm"
                  value={r.amount}
                  placeholder="0"
                  aria-label={`Montant mensuel HT : ${r.label}`}
                  onChange={(e) => update(i, { amount: e.target.value })}
                  style={{ width: 110, textAlign: 'right' }}
                />
                <span className="text-ink-3 text-xs" style={{ width: 44 }}>€ / mois</span>
                <button
                  type="button"
                  onClick={() => setRows((prev) => prev.filter((_, idx) => idx !== i))}
                  aria-label="Retirer cette charge"
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink3)', padding: 4 }}
                >
                  <X size={14} />
                </button>
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '.75rem', flexWrap: 'wrap', marginTop: '.8rem' }}>
            <button type="button" className="mf out" onClick={() => setRows((prev) => [...prev, { label: '', amount: '' }])}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <Plus size={13} strokeWidth={2} /> Ajouter une charge
            </button>
            <span style={{ flex: 1 }} />
            <span className="text-ink-2 text-sm">Total : <strong>{formatAmount(total)}</strong> / mois</span>
            <button type="button" className="btn-sm acc" onClick={() => void handleSave()} disabled={saving}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <Save size={13} strokeWidth={2} /> {saving ? 'Enregistrement…' : 'Enregistrer'}
            </button>
          </div>
        </>
      )}

      {flash && <p className="text-sm" style={{ color: 'var(--grn)', marginTop: '.6rem' }}>{flash}</p>}
      {error && <p className="text-red text-sm" style={{ marginTop: '.6rem' }}>Erreur : {error}</p>}
    </div>
  )
}

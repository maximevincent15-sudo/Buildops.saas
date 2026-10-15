import { Calculator } from 'lucide-react'
import { useState } from 'react'
import type { MouseEvent } from 'react'
import { useAuthStore } from '../../auth/store'
import { formatAmount } from '../../devis/constants'
import { exportAccounting } from '../accountingExport'
import type { AccountingExportResult } from '../accountingExport'

type Preset = 'last_month' | 'this_month' | 'last_quarter' | 'this_year' | 'last_year' | 'custom'

const PRESET_LABELS: Record<Preset, string> = {
  last_month: 'Mois dernier',
  this_month: 'Mois en cours',
  last_quarter: 'Trimestre dernier',
  this_year: 'Année en cours',
  last_year: 'Année dernière',
  custom: 'Autre période',
}

function iso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function presetRange(preset: Exclude<Preset, 'custom'>, now = new Date()): { from: string; to: string } {
  const y = now.getFullYear()
  const m = now.getMonth()
  switch (preset) {
    case 'last_month': return { from: iso(new Date(y, m - 1, 1)), to: iso(new Date(y, m, 0)) }
    case 'this_month': return { from: iso(new Date(y, m, 1)), to: iso(new Date(y, m + 1, 0)) }
    case 'last_quarter': {
      const q = Math.floor(m / 3)
      return { from: iso(new Date(y, (q - 1) * 3, 1)), to: iso(new Date(y, q * 3, 0)) }
    }
    case 'this_year': return { from: `${y}-01-01`, to: `${y}-12-31` }
    case 'last_year': return { from: `${y - 1}-01-01`, to: `${y - 1}-12-31` }
  }
}

/** Export comptable d'une période (Factures) : ZIP Excel + journal des ventes FEC */
export function AccountingExportModal({ onClose }: { onClose: () => void }) {
  const orgName = useAuthStore((s) => s.profile?.organizations?.name ?? 'Firovia')
  const [preset, setPreset] = useState<Preset>('last_month')
  const [range, setRange] = useState(() => presetRange('last_month'))
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<AccountingExportResult | null>(null)

  function choose(p: Preset) {
    setPreset(p)
    setResult(null)
    if (p !== 'custom') setRange(presetRange(p))
  }

  async function handleExport() {
    if (!range.from || !range.to || range.from > range.to) {
      setError('Période invalide : la date de début doit précéder la date de fin.')
      return
    }
    setRunning(true)
    setError(null)
    try {
      const res = await exportAccounting(range.from, range.to, orgName)
      const url = URL.createObjectURL(res.blob)
      const a = document.createElement('a')
      a.href = url
      a.download = res.filename
      document.body.appendChild(a)
      a.click()
      a.remove()
      setTimeout(() => URL.revokeObjectURL(url), 10_000)
      setResult(res)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur inconnue')
    } finally {
      setRunning(false)
    }
  }

  function handleBackdrop(e: MouseEvent<HTMLDivElement>) {
    if (e.target === e.currentTarget && !running) onClose()
  }

  return (
    <div className="overlay open" onClick={handleBackdrop}>
      <div className="modal" style={{ maxWidth: 560 }}>
        <div className="modal-head">
          <span className="modal-title" style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <Calculator size={16} strokeWidth={1.8} /> Export comptable
          </span>
          <button type="button" className="modal-x" onClick={onClose} aria-label="Fermer" disabled={running}>×</button>
        </div>

        <p className="text-ink-2 text-sm font-light" style={{ margin: '0 0 .9rem' }}>
          À envoyer à ton expert-comptable : factures, journal des ventes (format FEC, importable dans son logiciel),
          TVA collectée par taux et notes de frais validées.
        </p>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.4rem', marginBottom: '.8rem' }}>
          {(Object.keys(PRESET_LABELS) as Preset[]).map((p) => (
            <button key={p} type="button" className={`filter-pill${preset === p ? ' on' : ''}`} onClick={() => choose(p)}>
              {PRESET_LABELS[p]}
            </button>
          ))}
        </div>

        <div className="mrow">
          <div className="fg">
            <label>Du</label>
            <input type="date" value={range.from} onChange={(e) => { setPreset('custom'); setResult(null); setRange((r) => ({ ...r, from: e.target.value })) }} />
          </div>
          <div className="fg">
            <label>Au</label>
            <input type="date" value={range.to} onChange={(e) => { setPreset('custom'); setResult(null); setRange((r) => ({ ...r, to: e.target.value })) }} />
          </div>
        </div>

        {result && (
          <div className="card" style={{ marginTop: '.4rem', background: '#E6F4EB', border: '1px solid #B7DFC7', color: '#0E7A3F', fontSize: '.85rem' }}>
            Export téléchargé : {result.invoiceCount} facture{result.invoiceCount > 1 ? 's' : ''} ({formatAmount(result.totalHt)} HT),{' '}
            {result.expenseCount} note{result.expenseCount > 1 ? 's' : ''} de frais.
            {result.balanced ? ' Journal équilibré.' : ' Attention : journal déséquilibré, vérifie les factures.'}
            {result.cancelledCount > 0 && ` ${result.cancelledCount} facture${result.cancelledCount > 1 ? 's' : ''} annulée${result.cancelledCount > 1 ? 's' : ''} à régulariser par un avoir.`}
          </div>
        )}
        {error && <p className="text-red text-sm" style={{ marginTop: '.4rem' }}>Erreur : {error}</p>}

        <div className="modal-foot" style={{ marginTop: '1rem' }}>
          <button type="button" className="mf out" onClick={onClose} disabled={running}>Fermer</button>
          <button type="button" className="mf prim" onClick={() => void handleExport()} disabled={running}>
            {running ? 'Préparation…' : "Télécharger l'export (ZIP)"}
          </button>
        </div>
      </div>
    </div>
  )
}

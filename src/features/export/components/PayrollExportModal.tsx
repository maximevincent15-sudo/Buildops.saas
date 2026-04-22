import { Download, FileSpreadsheet } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import type { MouseEvent } from 'react'
import { useAuthStore } from '../../auth/store'
import { listExpenses } from '../../expenses/api'
import { listOvertime } from '../../overtime/api'
import {
  buildPayrollFilename,
  generatePayrollXlsx,
  triggerDownload,
} from '../payrollExport'

type Props = {
  open: boolean
  onClose: () => void
}

type Filter = 'approved' | 'all'

function toIso(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function currentMonthRange(): { from: string; to: string } {
  const now = new Date()
  const from = new Date(now.getFullYear(), now.getMonth(), 1)
  const to = new Date(now.getFullYear(), now.getMonth() + 1, 0)
  return { from: toIso(from), to: toIso(to) }
}

function previousMonthRange(): { from: string; to: string } {
  const now = new Date()
  const from = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const to = new Date(now.getFullYear(), now.getMonth(), 0)
  return { from: toIso(from), to: toIso(to) }
}

export function PayrollExportModal({ open, onClose }: Props) {
  const profile = useAuthStore((s) => s.profile)
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [filter, setFilter] = useState<Filter>('approved')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      const { from, to } = currentMonthRange()
      setFromDate(from)
      setToDate(to)
      setFilter('approved')
      setError(null)
    }
  }, [open])

  const orgName = useMemo(
    () => profile?.organizations?.name ?? 'Organisation',
    [profile],
  )

  async function handleExport() {
    if (!fromDate || !toDate) {
      setError('Choisis une période.')
      return
    }
    if (fromDate > toDate) {
      setError('La date de début doit être avant la date de fin.')
      return
    }

    setLoading(true)
    setError(null)
    try {
      const [allExpenses, allOvertime] = await Promise.all([
        listExpenses(),
        listOvertime(),
      ])

      const filterStatus = (status: string) =>
        filter === 'all' ? status !== 'rejected' : status === 'approved'

      const expenses = allExpenses.filter(
        (e) => e.spent_on >= fromDate && e.spent_on <= toDate && filterStatus(e.status),
      )
      const overtime = allOvertime.filter(
        (o) => o.worked_on >= fromDate && o.worked_on <= toDate && filterStatus(o.status),
      )

      const blob = await generatePayrollXlsx({
        expenses,
        overtime,
        organizationName: orgName,
        from: fromDate,
        to: toDate,
      })

      const filename = buildPayrollFilename(orgName, fromDate, toDate)
      triggerDownload(blob, filename)
      onClose()
    } catch (err) {
      console.error('Erreur export paie', err)
      setError(err instanceof Error ? err.message : 'Erreur lors de la génération du fichier')
    } finally {
      setLoading(false)
    }
  }

  function handleBackdrop(e: MouseEvent<HTMLDivElement>) {
    if (e.target === e.currentTarget && !loading) onClose()
  }

  function applyRange(range: { from: string; to: string }) {
    setFromDate(range.from)
    setToDate(range.to)
  }

  if (!open) return null

  return (
    <div className="overlay open" onClick={handleBackdrop}>
      <div className="modal" style={{ maxWidth: 520 }}>
        <div className="modal-head">
          <span className="modal-title" style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <FileSpreadsheet size={16} strokeWidth={2} />
            Export paie — fichier Excel
          </span>
          <button type="button" className="modal-x" onClick={onClose} aria-label="Fermer">×</button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <p className="text-ink-2 text-sm font-light" style={{ margin: 0 }}>
            Génère un fichier <strong>.xlsx</strong> avec 2 onglets (Notes de frais + Heures sup)
            à transmettre à ton expert-comptable.
          </p>

          <div className="fg">
            <label>Période rapide</label>
            <div style={{ display: 'flex', gap: '.4rem', flexWrap: 'wrap' }}>
              <button
                type="button"
                className="filter-pill"
                onClick={() => applyRange(currentMonthRange())}
              >
                Mois en cours
              </button>
              <button
                type="button"
                className="filter-pill"
                onClick={() => applyRange(previousMonthRange())}
              >
                Mois précédent
              </button>
            </div>
          </div>

          <div className="mrow">
            <div className="fg">
              <label>Du</label>
              <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
            </div>
            <div className="fg">
              <label>Au</label>
              <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
            </div>
          </div>

          <div className="fg">
            <label>Statut à inclure</label>
            <div style={{ display: 'flex', gap: '.4rem', flexWrap: 'wrap' }}>
              <button
                type="button"
                className={`filter-pill${filter === 'approved' ? ' on' : ''}`}
                onClick={() => setFilter('approved')}
              >
                Validées uniquement (recommandé)
              </button>
              <button
                type="button"
                className={`filter-pill${filter === 'all' ? ' on' : ''}`}
                onClick={() => setFilter('all')}
              >
                Validées + En attente
              </button>
            </div>
            <span className="text-ink-3 text-xs font-light" style={{ marginTop: 4 }}>
              Les notes/heures refusées ne sont jamais incluses dans l'export.
            </span>
          </div>

          {error && <span className="ferr on">{error}</span>}

          <div className="modal-foot">
            <button type="button" className="mf out" onClick={onClose} disabled={loading}>
              Annuler
            </button>
            <button
              type="button"
              className="mf prim"
              onClick={() => void handleExport()}
              disabled={loading}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
            >
              <Download size={14} strokeWidth={2} />
              {loading ? 'Génération…' : 'Télécharger le fichier'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

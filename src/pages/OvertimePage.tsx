import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import { Check, Download, Plus, Trash2, Undo2, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { RhTabs } from '../features/dashboard/components/RhTabs'
import { PayrollExportModal } from '../features/export/components/PayrollExportModal'
import { OvertimeModal } from '../features/overtime/components/OvertimeModal'
import {
  approveOvertime,
  deleteOvertime,
  listOvertime,
  rejectOvertime,
  resetOvertimeToPending,
} from '../features/overtime/api'
import {
  OVERTIME_TYPE_ICON,
  OVERTIME_TYPE_LABEL,
  OVERTIME_TYPE_SHORT,
  formatHours,
} from '../features/overtime/constants'
import type { OvertimeStatus } from '../features/overtime/constants'
import type { Overtime } from '../features/overtime/schemas'

function formatDate(d: string): string {
  try {
    return format(new Date(d), 'EEE d MMM yyyy', { locale: fr })
  } catch {
    return d
  }
}

function startOfMonthIso(): string {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10)
}

export function OvertimePage() {
  const [items, setItems] = useState<Overtime[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<OvertimeStatus>('pending')
  const [modalOpen, setModalOpen] = useState(false)
  const [exportOpen, setExportOpen] = useState(false)

  async function reload() {
    try {
      const data = await listOvertime()
      setItems(data)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur de chargement')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void reload()
  }, [])

  const counts = {
    pending: items.filter((i) => i.status === 'pending').length,
    approved: items.filter((i) => i.status === 'approved').length,
    rejected: items.filter((i) => i.status === 'rejected').length,
  }

  const filtered = items.filter((i) => i.status === tab)

  // KPI : heures totales par statut pour le mois en cours
  const monthStart = startOfMonthIso()
  const monthApproved = items
    .filter((i) => i.status === 'approved' && i.worked_on >= monthStart)
    .reduce((sum, i) => sum + Number(i.hours), 0)
  const monthPending = items
    .filter((i) => i.status === 'pending' && i.worked_on >= monthStart)
    .reduce((sum, i) => sum + Number(i.hours), 0)
  const distinctTechsPending = new Set(
    items.filter((i) => i.status === 'pending' && i.worked_on >= monthStart).map((i) => i.technician_id),
  ).size

  async function handleApprove(i: Overtime) {
    try {
      await approveOvertime(i.id)
      void reload()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erreur lors de la validation')
    }
  }

  async function handleReject(i: Overtime) {
    const reason = window.prompt(`Raison du refus (${formatHours(Number(i.hours))} le ${formatDate(i.worked_on)}) ?`)
    if (reason === null) return
    if (!reason.trim()) {
      alert('Merci d\'indiquer une raison.')
      return
    }
    try {
      await rejectOvertime(i.id, reason.trim())
      void reload()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erreur lors du refus')
    }
  }

  async function handleReset(i: Overtime) {
    if (!window.confirm('Remettre cette saisie en attente ?')) return
    try {
      await resetOvertimeToPending(i.id)
      void reload()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erreur')
    }
  }

  async function handleDelete(i: Overtime) {
    if (!window.confirm(`Supprimer cette saisie de ${formatHours(Number(i.hours))} ?`)) return
    try {
      await deleteOvertime(i.id)
      void reload()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erreur')
    }
  }

  return (
    <>
      <RhTabs />
      <div className="dash-top">
        <div>
          <div className="dash-title">Heures supplémentaires</div>
          <div className="dash-sub">
            Saisie et validation des heures sup pour préparer la paie. La majoration est appliquée par l'expert-comptable.
          </div>
        </div>
        <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap' }}>
          <button
            type="button"
            className="mf out"
            onClick={() => setExportOpen(true)}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            <Download size={14} strokeWidth={2} />
            Export paie
          </button>
          <button type="button" className="mf prim" onClick={() => setModalOpen(true)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <Plus size={14} strokeWidth={2} />
            Nouvelle saisie
          </button>
        </div>
      </div>

      <div className="kpi-grid" style={{ marginBottom: '1rem' }}>
        <div className="kpi">
          <div className="kpi-lbl">À valider (mois en cours)</div>
          <div className="kpi-val">{formatHours(monthPending)}</div>
          <div className="kpi-sub">{distinctTechsPending} technicien{distinctTechsPending > 1 ? 's' : ''} concerné{distinctTechsPending > 1 ? 's' : ''}</div>
        </div>
        <div className="kpi">
          <div className="kpi-lbl">Validées (mois en cours)</div>
          <div className="kpi-val">{formatHours(monthApproved)}</div>
          <div className="kpi-sub">{counts.approved} saisie{counts.approved > 1 ? 's' : ''} au total</div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '.5rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
        <button type="button" className={`filter-pill${tab === 'pending' ? ' on' : ''}`} onClick={() => setTab('pending')}>
          À valider ({counts.pending})
        </button>
        <button type="button" className={`filter-pill${tab === 'approved' ? ' on' : ''}`} onClick={() => setTab('approved')}>
          Validées ({counts.approved})
        </button>
        <button type="button" className={`filter-pill${tab === 'rejected' ? ' on' : ''}`} onClick={() => setTab('rejected')}>
          Refusées ({counts.rejected})
        </button>
      </div>

      <div className="card">
        {loading && <p className="text-ink-2 text-sm font-light">Chargement…</p>}

        {error && !loading && (
          <p className="text-red text-sm">Erreur : {error}</p>
        )}

        {!loading && !error && filtered.length === 0 && (
          <div style={{ textAlign: 'center', padding: '3rem 1rem' }}>
            <p className="text-ink-2 font-light" style={{ marginBottom: '.5rem' }}>
              {tab === 'pending' && 'Aucune heure sup à valider.'}
              {tab === 'approved' && 'Aucune heure sup validée pour le moment.'}
              {tab === 'rejected' && 'Aucune heure sup refusée.'}
            </p>
            {tab === 'pending' && (
              <p className="text-ink-3 text-xs font-light" style={{ maxWidth: 420, margin: '0 auto' }}>
                Clique sur "Nouvelle saisie" pour enregistrer des heures sup (ex: 2h le mardi soir pour un dépannage urgent).
              </p>
            )}
          </div>
        )}

        {!loading && !error && filtered.length > 0 && (
          <div className="expenses-list">
            {filtered.map((i) => {
              const Icon = OVERTIME_TYPE_ICON[i.type]
              return (
                <div key={i.id} className={`expense-row status-${i.status}`}>
                  <div className="expense-icon">
                    <Icon size={18} strokeWidth={2} />
                  </div>
                  <div className="expense-main">
                    <div className="expense-title">
                      {i.technician_name}
                      <span className="expense-tech"> — {OVERTIME_TYPE_SHORT[i.type]}</span>
                    </div>
                    <div className="expense-meta">
                      {formatDate(i.worked_on)}
                      {i.description && <> · {i.description}</>}
                      {i.status === 'rejected' && i.rejection_reason && (
                        <div className="expense-reject-reason">Refus : {i.rejection_reason}</div>
                      )}
                    </div>
                  </div>
                  <div className="expense-amount">
                    <div className="expense-amount-val">{formatHours(Number(i.hours))}</div>
                    <div className="expense-amount-sub">{OVERTIME_TYPE_LABEL[i.type].toLowerCase()}</div>
                  </div>
                  <div className="expense-actions">
                    {i.status === 'pending' && (
                      <>
                        <button
                          type="button"
                          className="exp-act approve"
                          onClick={() => void handleApprove(i)}
                          title="Valider"
                          aria-label="Valider"
                        >
                          <Check size={14} strokeWidth={2.2} />
                        </button>
                        <button
                          type="button"
                          className="exp-act reject"
                          onClick={() => void handleReject(i)}
                          title="Refuser"
                          aria-label="Refuser"
                        >
                          <X size={14} strokeWidth={2.2} />
                        </button>
                      </>
                    )}
                    {(i.status === 'approved' || i.status === 'rejected') && (
                      <button
                        type="button"
                        className="exp-act neutral"
                        onClick={() => void handleReset(i)}
                        title="Remettre en attente"
                        aria-label="Remettre en attente"
                      >
                        <Undo2 size={13} strokeWidth={2} />
                      </button>
                    )}
                    <button
                      type="button"
                      className="exp-act delete"
                      onClick={() => void handleDelete(i)}
                      title="Supprimer"
                      aria-label="Supprimer"
                    >
                      <Trash2 size={13} strokeWidth={2} />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      <OvertimeModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onCreated={() => void reload()}
      />

      <PayrollExportModal
        open={exportOpen}
        onClose={() => setExportOpen(false)}
      />
    </>
  )
}

import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import { Check, Paperclip, Plus, Trash2, Undo2, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { ExpenseModal } from '../features/expenses/components/ExpenseModal'
import {
  approveExpense,
  deleteExpense,
  deleteExpenseReceipt,
  listExpenses,
  rejectExpense,
  resetExpenseToPending,
} from '../features/expenses/api'
import {
  EXPENSE_CATEGORY_ICON,
  EXPENSE_CATEGORY_LABEL,
  formatAmount,
} from '../features/expenses/constants'
import type { ExpenseStatus } from '../features/expenses/constants'
import type { Expense } from '../features/expenses/schemas'

function formatDate(d: string): string {
  try {
    return format(new Date(d), 'd MMM yyyy', { locale: fr })
  } catch {
    return d
  }
}

function startOfMonthIso(): string {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10)
}

export function ExpensesPage() {
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<ExpenseStatus>('pending')
  const [modalOpen, setModalOpen] = useState(false)

  async function reload() {
    try {
      const data = await listExpenses()
      setExpenses(data)
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
    pending: expenses.filter((e) => e.status === 'pending').length,
    approved: expenses.filter((e) => e.status === 'approved').length,
    rejected: expenses.filter((e) => e.status === 'rejected').length,
  }

  const filtered = expenses.filter((e) => e.status === tab)

  // KPI : total validé du mois courant
  const monthStart = startOfMonthIso()
  const monthApproved = expenses
    .filter((e) => e.status === 'approved' && e.spent_on >= monthStart)
    .reduce((sum, e) => sum + Number(e.amount_ttc), 0)
  const monthPending = expenses
    .filter((e) => e.status === 'pending' && e.spent_on >= monthStart)
    .reduce((sum, e) => sum + Number(e.amount_ttc), 0)

  async function handleApprove(e: Expense) {
    try {
      await approveExpense(e.id)
      void reload()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erreur lors de la validation')
    }
  }

  async function handleReject(e: Expense) {
    const reason = window.prompt(`Raison du refus pour "${EXPENSE_CATEGORY_LABEL[e.category]}" (${formatAmount(Number(e.amount_ttc))}) ?`)
    if (reason === null) return
    if (!reason.trim()) {
      alert('Merci d\'indiquer une raison.')
      return
    }
    try {
      await rejectExpense(e.id, reason.trim())
      void reload()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erreur lors du refus')
    }
  }

  async function handleReset(e: Expense) {
    if (!window.confirm('Remettre cette note en attente ?')) return
    try {
      await resetExpenseToPending(e.id)
      void reload()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erreur')
    }
  }

  async function handleDelete(e: Expense) {
    if (!window.confirm(`Supprimer définitivement cette note de frais de ${formatAmount(Number(e.amount_ttc))} ?`)) return
    try {
      if (e.receipt_path) {
        try { await deleteExpenseReceipt(e.receipt_path) } catch { /* ignore */ }
      }
      await deleteExpense(e.id)
      void reload()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erreur')
    }
  }

  return (
    <>
      <div className="dash-top">
        <div>
          <div className="dash-title">Notes de frais</div>
          <div className="dash-sub">
            Saisie des dépenses des techniciens (repas, achats fournisseur, carburant…) avec justificatif et validation.
          </div>
        </div>
        <button type="button" className="mf prim" onClick={() => setModalOpen(true)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <Plus size={14} strokeWidth={2} />
          Nouvelle note
        </button>
      </div>

      {/* KPIs */}
      <div className="kpi-grid" style={{ marginBottom: '1rem' }}>
        <div className="kpi">
          <div className="kpi-lbl">À valider (mois en cours)</div>
          <div className="kpi-val">{formatAmount(monthPending)}</div>
          <div className="kpi-sub">{counts.pending} note{counts.pending > 1 ? 's' : ''} au total</div>
        </div>
        <div className="kpi">
          <div className="kpi-lbl">Validées (mois en cours)</div>
          <div className="kpi-val">{formatAmount(monthApproved)}</div>
          <div className="kpi-sub">{counts.approved} note{counts.approved > 1 ? 's' : ''} au total</div>
        </div>
      </div>

      {/* Onglets */}
      <div style={{ display: 'flex', gap: '.5rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
        <button
          type="button"
          className={`filter-pill${tab === 'pending' ? ' on' : ''}`}
          onClick={() => setTab('pending')}
        >
          À valider ({counts.pending})
        </button>
        <button
          type="button"
          className={`filter-pill${tab === 'approved' ? ' on' : ''}`}
          onClick={() => setTab('approved')}
        >
          Validées ({counts.approved})
        </button>
        <button
          type="button"
          className={`filter-pill${tab === 'rejected' ? ' on' : ''}`}
          onClick={() => setTab('rejected')}
        >
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
              {tab === 'pending' && 'Aucune note en attente.'}
              {tab === 'approved' && 'Aucune note validée pour le moment.'}
              {tab === 'rejected' && 'Aucune note refusée.'}
            </p>
            {tab === 'pending' && (
              <p className="text-ink-3 text-xs font-light" style={{ maxWidth: 420, margin: '0 auto' }}>
                Clique sur "Nouvelle note" pour saisir un frais (repas, achat fournisseur, carburant…) avec la photo du ticket.
              </p>
            )}
          </div>
        )}

        {!loading && !error && filtered.length > 0 && (
          <div className="expenses-list">
            {filtered.map((e) => {
              const Icon = EXPENSE_CATEGORY_ICON[e.category]
              return (
                <div key={e.id} className={`expense-row status-${e.status}`}>
                  <div className="expense-icon">
                    <Icon size={18} strokeWidth={2} />
                  </div>
                  <div className="expense-main">
                    <div className="expense-title">
                      {EXPENSE_CATEGORY_LABEL[e.category]}
                      <span className="expense-tech"> — {e.technician_name}</span>
                    </div>
                    <div className="expense-meta">
                      {formatDate(e.spent_on)}
                      {e.description && <> · {e.description}</>}
                      {e.vat_rate > 0 && <> · TVA {e.vat_rate}%</>}
                      {e.receipt_url && (
                        <>
                          {' · '}
                          <a
                            href={e.receipt_url}
                            target="_blank"
                            rel="noreferrer"
                            className="expense-receipt-link"
                          >
                            <Paperclip size={10} strokeWidth={2} /> justificatif
                          </a>
                        </>
                      )}
                      {e.status === 'rejected' && e.rejection_reason && (
                        <div className="expense-reject-reason">Refus : {e.rejection_reason}</div>
                      )}
                    </div>
                  </div>
                  <div className="expense-amount">
                    <div className="expense-amount-val">{formatAmount(Number(e.amount_ttc))}</div>
                    <div className="expense-amount-sub">TTC</div>
                  </div>
                  <div className="expense-actions">
                    {e.status === 'pending' && (
                      <>
                        <button
                          type="button"
                          className="exp-act approve"
                          onClick={() => void handleApprove(e)}
                          title="Valider"
                          aria-label="Valider"
                        >
                          <Check size={14} strokeWidth={2.2} />
                        </button>
                        <button
                          type="button"
                          className="exp-act reject"
                          onClick={() => void handleReject(e)}
                          title="Refuser"
                          aria-label="Refuser"
                        >
                          <X size={14} strokeWidth={2.2} />
                        </button>
                      </>
                    )}
                    {(e.status === 'approved' || e.status === 'rejected') && (
                      <button
                        type="button"
                        className="exp-act neutral"
                        onClick={() => void handleReset(e)}
                        title="Remettre en attente"
                        aria-label="Remettre en attente"
                      >
                        <Undo2 size={13} strokeWidth={2} />
                      </button>
                    )}
                    <button
                      type="button"
                      className="exp-act delete"
                      onClick={() => void handleDelete(e)}
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

      <ExpenseModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onCreated={() => void reload()}
      />
    </>
  )
}

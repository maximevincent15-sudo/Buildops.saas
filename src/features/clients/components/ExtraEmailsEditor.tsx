import { Plus, X } from 'lucide-react'
import { RECIPIENT_KIND_LABELS, isValidEmail } from '../recipients'
import type { DocumentRecipientKind } from '../recipients'
import type { ClientEmailRecipient } from '../schemas'

type Props = {
  value: ClientEmailRecipient[]
  onChange: (next: ClientEmailRecipient[]) => void
}

const KINDS: DocumentRecipientKind[] = ['reports', 'quotes', 'invoices']

/**
 * Destinataires supplémentaires d'un client (gardien, syndic, comptabilité…) :
 * chacun reçoit les types de documents cochés, en plus de l'email principal.
 */
export function ExtraEmailsEditor({ value, onChange }: Props) {
  function update(i: number, patch: Partial<ClientEmailRecipient>) {
    onChange(value.map((r, k) => (k === i ? { ...r, ...patch } : r)))
  }

  return (
    <div className="fg">
      <label>
        Autres destinataires des documents{' '}
        <span style={{ color: 'var(--ink3)', fontWeight: 400 }}>(gardien, syndic, comptabilité…)</span>
      </label>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {value.map((r, i) => {
          const invalid = r.email.trim() !== '' && !isValidEmail(r.email)
          return (
            <div key={i} style={{ border: '.5px solid var(--brd)', borderRadius: 8, padding: '8px 10px', background: 'var(--wht)' }}>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', position: 'relative', paddingRight: 30 }}>
                <input
                  type="text"
                  placeholder="Nom (ex : Comptabilité)"
                  value={r.name ?? ''}
                  onChange={(e) => update(i, { name: e.target.value })}
                  style={{ flex: '1 1 120px', minWidth: 0 }}
                />
                <input
                  type="email"
                  placeholder="email@client.fr"
                  value={r.email}
                  onChange={(e) => update(i, { email: e.target.value })}
                  style={{ flex: '2 1 190px', minWidth: 0 }}
                />
                <button
                  type="button"
                  className="ql-remove"
                  onClick={() => onChange(value.filter((_, k) => k !== i))}
                  aria-label="Retirer ce destinataire"
                  style={{ position: 'absolute', right: 0, top: 9 }}
                >
                  <X size={12} strokeWidth={2.5} />
                </button>
              </div>
              <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 6, fontSize: 12.5 }}>
                <span className="text-ink-3">Reçoit :</span>
                {KINDS.map((k) => (
                  <label key={k} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, cursor: 'pointer', fontWeight: 400 }}>
                    <input type="checkbox" checked={r[k]} onChange={(e) => update(i, { [k]: e.target.checked })} />
                    {RECIPIENT_KIND_LABELS[k]}
                  </label>
                ))}
              </div>
              {invalid && <span className="ferr on">Email invalide</span>}
            </div>
          )
        })}
        <button
          type="button"
          className="quote-add-line"
          onClick={() => onChange([...value, { email: '', name: '', reports: true, quotes: false, invoices: false }])}
          style={{ alignSelf: 'flex-start' }}
        >
          <Plus size={13} strokeWidth={2} /> Ajouter un destinataire
        </button>
      </div>
      <span className="text-ink-3 text-xs font-light" style={{ marginTop: 4 }}>
        L'email principal reçoit tous les documents. À l'envoi, les bons destinataires sont proposés automatiquement.
      </span>
    </div>
  )
}

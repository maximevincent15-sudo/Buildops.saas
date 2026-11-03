import { ArrowDown, ArrowUp, Plus, RotateCcw, Save, Trash2, X } from 'lucide-react'
import { useState } from 'react'
import { newPointId } from '../api'
import type { ChecklistPoint } from '../api'

type Props = {
  name: string
  items: ChecklistPoint[]
  /** Liste par appareil : son nom est modifiable */
  nameEditable: boolean
  /** Liste Firovia modifiée par l'entreprise : « Revenir à la liste Firovia » */
  canReset: boolean
  /** Liste créée par l'entreprise : « Supprimer la liste » */
  canDelete: boolean
  onSave: (name: string, items: ChecklistPoint[]) => Promise<void>
  onReset?: () => Promise<void>
  onDelete?: () => Promise<void>
}

/** Édition d'une liste de points de contrôle : renommer, ajouter, retirer, réordonner */
export function ChecklistListEditor({ name, items, nameEditable, canReset, canDelete, onSave, onReset, onDelete }: Props) {
  const [draftName, setDraftName] = useState(name)
  const [draft, setDraft] = useState<ChecklistPoint[]>(items)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const dirty = draftName !== name || JSON.stringify(draft) !== JSON.stringify(items)
  const empty = draft.every((it) => !it.label.trim())

  function update(i: number, label: string) {
    setDraft((d) => d.map((it, j) => (j === i ? { ...it, label } : it)))
  }
  function move(i: number, by: -1 | 1) {
    setDraft((d) => {
      const j = i + by
      if (j < 0 || j >= d.length) return d
      const next = [...d]
      ;[next[i], next[j]] = [next[j]!, next[i]!]
      return next
    })
  }

  async function run(action: () => Promise<void>) {
    setBusy(true)
    setError(null)
    try {
      await action()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Enregistrement impossible')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="cl-editor">
      {nameEditable && (
        <div className="fg" style={{ marginBottom: 10 }}>
          <label>Nom de la liste</label>
          <input type="text" value={draftName} onChange={(e) => setDraftName(e.target.value)} disabled={busy} />
        </div>
      )}
      <ol className="cl-items">
        {draft.map((it, i) => (
          <li key={it.id} className="cl-item">
            <span className="cl-num">{i + 1}</span>
            <input
              type="text"
              value={it.label}
              onChange={(e) => update(i, e.target.value)}
              placeholder="Point à vérifier"
              disabled={busy}
              aria-label={`Point ${i + 1}`}
            />
            <button type="button" className="cl-icon" onClick={() => move(i, -1)} disabled={busy || i === 0} title="Monter" aria-label="Monter"><ArrowUp size={14} /></button>
            <button type="button" className="cl-icon" onClick={() => move(i, 1)} disabled={busy || i === draft.length - 1} title="Descendre" aria-label="Descendre"><ArrowDown size={14} /></button>
            <button type="button" className="cl-icon danger" onClick={() => setDraft((d) => d.filter((_, j) => j !== i))} disabled={busy} title="Retirer ce point" aria-label="Retirer ce point"><X size={14} /></button>
          </li>
        ))}
      </ol>
      <button type="button" className="quote-add-line" onClick={() => setDraft((d) => [...d, { id: newPointId(), label: '' }])} disabled={busy}>
        <Plus size={13} strokeWidth={2} /> Ajouter un point
      </button>

      {error && <p className="text-red text-sm" style={{ margin: '.6rem 0 0' }}>{error}</p>}

      <div className="cl-actions">
        {canDelete && onDelete && (
          <button type="button" className="btn-sm" onClick={() => {
            if (window.confirm('Supprimer cette liste ? Les appareils qui l\'utilisaient reprendront la première liste de leur famille.')) void run(onDelete)
          }} disabled={busy} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <Trash2 size={13} /> Supprimer la liste
          </button>
        )}
        {canReset && onReset && (
          <button type="button" className="btn-sm" onClick={() => {
            if (window.confirm('Revenir à la liste Firovia ? Tes modifications de cette liste seront perdues.')) void run(onReset)
          }} disabled={busy} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <RotateCcw size={13} /> Revenir à la liste Firovia
          </button>
        )}
        {dirty && (
          <button type="button" className="btn-sm" onClick={() => { setDraftName(name); setDraft(items) }} disabled={busy}>
            Annuler
          </button>
        )}
        <button
          type="button"
          className="btn-sm acc"
          onClick={() => void run(() => onSave(draftName, draft))}
          disabled={busy || !dirty || empty}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
        >
          <Save size={13} /> {busy ? 'Enregistrement…' : 'Enregistrer'}
        </button>
      </div>
    </div>
  )
}

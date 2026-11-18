import { BookCheck, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useAuthStore } from '../../auth/store'
import { DEFAULT_STANDARDS, standardsFor } from '../../rapports/workOrder'
import { getInvoicingSettings, setStandardsList } from '../api'

/**
 * Référentiels proposés sur le bon d'intervention et le procès-verbal de
 * réception : la liste de l'entreprise (normes, certifications, libellés
 * maison), à la place de la liste par défaut.
 */
export function StandardsCard() {
  const organizationId = useAuthStore((s) => s.profile?.organization_id)
  const [list, setList] = useState<string[] | null>(null)
  const [saved, setSaved] = useState<string[]>([])
  const [draft, setDraft] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [flash, setFlash] = useState<string | null>(null)

  useEffect(() => {
    if (!organizationId) return
    let alive = true
    void getInvoicingSettings(organizationId)
      .then((s) => {
        if (!alive) return
        const l = standardsFor(s?.standards_list)
        setList(l)
        setSaved(l)
      })
      .catch(() => { if (alive) { setList([...DEFAULT_STANDARDS]); setSaved([...DEFAULT_STANDARDS]) } })
    return () => { alive = false }
  }, [organizationId])

  function add() {
    const items = draft.split(/[\n;]+/).map((x) => x.trim()).filter(Boolean)
    if (items.length === 0 || !list) return
    setList([...list, ...items.filter((x) => !list.includes(x))])
    setDraft('')
  }

  async function save(next: string[], message: string) {
    if (!organizationId) return
    setSaving(true)
    setError(null)
    try {
      const isDefault = next.length === DEFAULT_STANDARDS.length && next.every((x, i) => x === DEFAULT_STANDARDS[i])
      await setStandardsList(organizationId, isDefault ? [] : next)
      setList(next)
      setSaved(next)
      setFlash(message)
      setTimeout(() => setFlash(null), 3500)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Enregistrement impossible')
    } finally {
      setSaving(false)
    }
  }

  if (!list) return null
  const changed = list.length !== saved.length || list.some((x, i) => x !== saved[i])

  return (
    <div className="card" style={{ marginBottom: '1rem' }}>
      <div className="card-top">
        <span className="card-title" style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          <BookCheck size={14} strokeWidth={1.8} />
          Référentiels
        </span>
        <span className="text-ink-3 text-xs font-light">Proposés sur le bon d'intervention et le PV de réception</span>
      </div>
      <p className="text-ink-3 text-xs font-light" style={{ margin: '0 0 .7rem', lineHeight: 1.5 }}>
        Mettez les libellés que vous utilisez (ex. « Installation NF S 61-932 », vos certifications). Sur le PV, ils apparaissent tous, cochés ou non.
      </p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: '.7rem' }}>
        {list.map((x) => (
          <span key={x} className="filter-pill on" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'default' }}>
            {x}
            <button
              type="button"
              onClick={() => setList(list.filter((y) => y !== x))}
              aria-label={`Retirer ${x}`}
              style={{ background: 'none', border: 0, padding: 0, color: 'inherit', cursor: 'pointer', display: 'inline-flex' }}
            >
              <X size={12} strokeWidth={2.2} />
            </button>
          </span>
        ))}
        {list.length === 0 && <span className="text-ink-3 text-xs">Liste vide : la liste par défaut sera utilisée.</span>}
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add() } }}
          placeholder="Ajouter un référentiel (plusieurs : séparés par ;)"
          style={{ flex: 1, minWidth: 0 }}
        />
        <button type="button" className="btn-sm" onClick={add} disabled={!draft.trim()}>Ajouter</button>
      </div>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: '.8rem', flexWrap: 'wrap' }}>
        <button
          type="button"
          className="btn-sm subtle"
          onClick={() => void save([...DEFAULT_STANDARDS], 'Liste par défaut remise.')}
          disabled={saving}
        >
          Remettre la liste par défaut
        </button>
        <button
          type="button"
          className="btn-sm acc"
          onClick={() => void save(list, 'Référentiels enregistrés : ils seront proposés sur les prochains bons et PV.')}
          disabled={saving || !changed}
        >
          {saving ? 'Enregistrement…' : 'Enregistrer'}
        </button>
      </div>
      {flash && <p className="text-grn text-sm" style={{ margin: '.6rem 0 0' }}>{flash}</p>}
      {error && <p className="text-red text-sm" style={{ margin: '.6rem 0 0' }}>{error}</p>}
    </div>
  )
}

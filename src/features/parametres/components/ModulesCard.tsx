import { CheckCircle2, LayoutGrid } from 'lucide-react'
import { useState } from 'react'
import { useAuthStore } from '../../auth/store'
import { MODULE_INFO, OPTIONAL_MODULES, updateDisabledModules } from '../modules'
import type { OptionalModule } from '../modules'

/**
 * Modules affichés : une entreprise qui garde ses devis et factures dans un
 * autre logiciel passe en « mode terrain » (planning, rapports, équipements,
 * clients). Aucune donnée n'est supprimée.
 */
export function ModulesCard() {
  const profile = useAuthStore((s) => s.profile)
  const setProfile = useAuthStore((s) => s.setProfile)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [flash, setFlash] = useState<string | null>(null)

  const disabled = (profile?.organizations?.disabled_modules ?? []) as OptionalModule[]
  const fieldMode = OPTIONAL_MODULES.every((m) => disabled.includes(m))

  async function save(next: OptionalModule[], message: string) {
    if (!profile?.organization_id || !profile.organizations) return
    setSaving(true)
    setError(null)
    try {
      await updateDisabledModules(profile.organization_id, next)
      setProfile({ ...profile, organizations: { ...profile.organizations, disabled_modules: next } })
      setFlash(message)
      setTimeout(() => setFlash(null), 3000)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Enregistrement impossible')
    } finally {
      setSaving(false)
    }
  }

  function toggle(m: OptionalModule, show: boolean) {
    const next = show ? disabled.filter((x) => x !== m) : [...disabled, m]
    void save(OPTIONAL_MODULES.filter((x) => next.includes(x)), `${MODULE_INFO[m].label} : ${show ? 'affiché' : 'masqué'}.`)
  }

  return (
    <div className="card" style={{ marginBottom: '1rem' }}>
      <div className="card-top">
        <span className="card-title" style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          <LayoutGrid size={14} strokeWidth={1.8} />
          Modules affichés
        </span>
        <span className="text-ink-3 text-xs font-light">Pour toute l'équipe</span>
      </div>
      <p className="text-ink-2 text-sm font-light" style={{ margin: '0 0 .8rem', lineHeight: 1.5 }}>
        Vous faites vos devis et factures dans un autre logiciel (Sage, EBP…) ? Passez en <strong>mode terrain</strong> :
        le menu ne garde que le planning, les rapports, les équipements et les clients. Rien n'est supprimé,
        vous pouvez tout réafficher à tout moment.
      </p>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: '.9rem' }}>
        <button
          type="button"
          className={fieldMode ? 'mf out' : 'mf prim'}
          disabled={saving || fieldMode}
          onClick={() => void save([...OPTIONAL_MODULES], 'Mode terrain activé : devis, factures, catalogue et contrats sont masqués.')}
        >
          {fieldMode ? 'Mode terrain activé' : 'Passer en mode terrain'}
        </button>
        {disabled.length > 0 && (
          <button type="button" className="mf out" disabled={saving} onClick={() => void save([], 'Tous les modules sont affichés.')}>
            Tout afficher
          </button>
        )}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {OPTIONAL_MODULES.map((m) => (
          <label key={m} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: saving ? 'wait' : 'pointer' }}>
            <input
              type="checkbox"
              checked={!disabled.includes(m)}
              disabled={saving}
              onChange={(e) => toggle(m, e.target.checked)}
              style={{ marginTop: 3 }}
            />
            <span style={{ fontSize: 13.5, lineHeight: 1.4 }}>
              <strong>{MODULE_INFO[m].label}</strong>
              <span className="text-ink-3" style={{ display: 'block', fontSize: 12 }}>{MODULE_INFO[m].hint}</span>
            </span>
          </label>
        ))}
      </div>

      {flash && (
        <p className="text-grn text-sm" style={{ margin: '.8rem 0 0', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <CheckCircle2 size={14} /> {flash}
        </p>
      )}
      {error && <p className="text-red text-sm" style={{ margin: '.8rem 0 0' }}>{error}</p>}
    </div>
  )
}

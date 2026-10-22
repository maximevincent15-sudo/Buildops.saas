import { FAMILY_ATTRIBUTES } from '../identification'
import type { EquipmentFamily } from '../schemas'

type Props = {
  family: EquipmentFamily
  value: Record<string, string>
  onChange: (next: Record<string, string>) => void
  readOnly?: boolean
}

/** Caractéristiques propres à la famille (degré d'une porte coupe-feu, agent d'un extincteur…) */
export function UnitAttributesFields({ family, value, onChange, readOnly }: Props) {
  const fields = FAMILY_ATTRIBUTES[family]
  if (fields.length === 0) return null

  function set(key: string, v: string) {
    const next = { ...value }
    if (v.trim()) next[key] = v
    else delete next[key]
    onChange(next)
  }

  return (
    <div className="unit-attrs">
      {fields.map((f) => (
        <div className="fg" key={f.key}>
          <label>{f.label}</label>
          {f.options ? (
            <select value={value[f.key] ?? ''} onChange={(e) => set(f.key, e.target.value)} disabled={readOnly}>
              <option value="">—</option>
              {/* Valeur hors liste (import, ancienne saisie) : on la garde visible */}
              {value[f.key] && !f.options.includes(value[f.key]!) && (
                <option value={value[f.key]}>{value[f.key]}</option>
              )}
              {f.options.map((o) => (
                <option key={o} value={o}>{o}</option>
              ))}
            </select>
          ) : (
            <input
              type="text"
              value={value[f.key] ?? ''}
              onChange={(e) => set(f.key, e.target.value)}
              placeholder={f.placeholder}
              disabled={readOnly}
            />
          )}
        </div>
      ))}
    </div>
  )
}

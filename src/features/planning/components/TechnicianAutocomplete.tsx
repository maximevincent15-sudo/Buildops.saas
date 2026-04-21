import { useEffect, useMemo, useState } from 'react'
import type { KeyboardEvent } from 'react'
import { listTechnicians } from '../../technicians/api'
import type { Technician } from '../../technicians/schemas'

type Props = {
  value: string
  onChange: (name: string, technician: Technician | null) => void
  placeholder?: string
}

function fullName(t: Technician): string {
  return `${t.first_name} ${t.last_name}`.trim()
}

export function TechnicianAutocomplete({ value, onChange, placeholder }: Props) {
  const [technicians, setTechnicians] = useState<Technician[]>([])
  const [isOpen, setIsOpen] = useState(false)
  const [highlight, setHighlight] = useState(-1)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    listTechnicians()
      .then((data) => {
        setTechnicians(data.filter((t) => t.active))
        setLoaded(true)
      })
      .catch(() => setLoaded(true))
  }, [])

  const suggestions = useMemo(() => {
    if (!value || value.trim().length === 0) return technicians.slice(0, 8)
    const q = value.toLowerCase().trim()
    return technicians
      .filter((t) => fullName(t).toLowerCase().includes(q))
      .slice(0, 8)
  }, [value, technicians])

  const showNoMatch =
    isOpen &&
    loaded &&
    value.trim().length > 0 &&
    suggestions.length === 0 &&
    technicians.length > 0

  function pick(t: Technician) {
    onChange(fullName(t), t)
    setIsOpen(false)
    setHighlight(-1)
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (!isOpen || suggestions.length === 0) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlight((h) => Math.min(h + 1, suggestions.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlight((h) => Math.max(h - 1, 0))
    } else if (e.key === 'Enter' && highlight >= 0) {
      e.preventDefault()
      pick(suggestions[highlight]!)
    } else if (e.key === 'Escape') {
      setIsOpen(false)
    }
  }

  return (
    <div className="addr-autocomplete">
      <input
        type="text"
        autoComplete="off"
        value={value ?? ''}
        onChange={(e) => { onChange(e.target.value, null); setIsOpen(true); setHighlight(-1) }}
        onFocus={() => setIsOpen(true)}
        onBlur={() => setTimeout(() => setIsOpen(false), 150)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
      />

      {isOpen && suggestions.length > 0 && (
        <div className="addr-dropdown">
          {suggestions.map((t, i) => (
            <button
              type="button"
              key={t.id}
              className={`addr-option${i === highlight ? ' hi' : ''}`}
              onMouseDown={(e) => { e.preventDefault(); pick(t) }}
              onMouseEnter={() => setHighlight(i)}
            >
              <div className="addr-label">{fullName(t)}</div>
              {t.role && <div className="addr-sub">{t.role}</div>}
            </button>
          ))}
        </div>
      )}

      {showNoMatch && (
        <div className="addr-dropdown">
          <div
            className="addr-option"
            style={{ cursor: 'default', color: 'var(--ink3)', fontSize: '.78rem' }}
          >
            Aucun technicien existant. "{value}" sera enregistré comme nom libre.
          </div>
        </div>
      )}
    </div>
  )
}

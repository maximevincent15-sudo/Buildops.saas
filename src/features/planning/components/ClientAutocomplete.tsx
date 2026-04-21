import { useEffect, useMemo, useState } from 'react'
import type { KeyboardEvent } from 'react'
import { listClients } from '../../clients/api'
import type { Client } from '../../clients/schemas'

type Props = {
  value: string
  onChange: (name: string, client: Client | null) => void
  placeholder?: string
}

export function ClientAutocomplete({ value, onChange, placeholder }: Props) {
  const [clients, setClients] = useState<Client[]>([])
  const [isOpen, setIsOpen] = useState(false)
  const [highlight, setHighlight] = useState(-1)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    listClients()
      .then((data) => { setClients(data); setLoaded(true) })
      .catch(() => { setLoaded(true) })
  }, [])

  const suggestions = useMemo(() => {
    if (!value || value.trim().length === 0) {
      return clients.slice(0, 8)
    }
    const q = value.toLowerCase().trim()
    return clients
      .filter((c) => c.name.toLowerCase().includes(q))
      .slice(0, 8)
  }, [value, clients])

  const showNoMatch =
    isOpen &&
    loaded &&
    value.trim().length > 0 &&
    suggestions.length === 0 &&
    clients.length > 0

  function pick(c: Client) {
    onChange(c.name, c)
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
          {suggestions.map((c, i) => (
            <button
              type="button"
              key={c.id}
              className={`addr-option${i === highlight ? ' hi' : ''}`}
              onMouseDown={(e) => { e.preventDefault(); pick(c) }}
              onMouseEnter={() => setHighlight(i)}
            >
              <div className="addr-label">{c.name}</div>
              {(c.contact_name || c.address) && (
                <div className="addr-sub">
                  {c.contact_name && <>{c.contact_name}</>}
                  {c.contact_name && c.address && ' · '}
                  {c.address && <>{c.address}</>}
                </div>
              )}
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
            Aucun client existant. "{value}" sera enregistré comme nouveau nom libre.
          </div>
        </div>
      )}
    </div>
  )
}

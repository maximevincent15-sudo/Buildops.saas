import { useEffect, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'

type Suggestion = {
  label: string
  context: string
}

type ApiFeature = {
  properties: {
    label: string
    context: string
  }
}

async function searchAddress(query: string, signal: AbortSignal): Promise<Suggestion[]> {
  if (query.trim().length < 3) return []
  const url = `https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(query)}&limit=5&autocomplete=1`
  const res = await fetch(url, { signal })
  if (!res.ok) throw new Error('Erreur API adresse')
  const data = (await res.json()) as { features: ApiFeature[] }
  return (data.features ?? []).map((f) => ({
    label: f.properties.label,
    context: f.properties.context,
  }))
}

type Props = {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  id?: string
}

export function AddressAutocomplete({ value, onChange, placeholder, id }: Props) {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [isOpen, setIsOpen] = useState(false)
  const [highlight, setHighlight] = useState(-1)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (abortRef.current) abortRef.current.abort()

    if (!value || value.trim().length < 3) {
      setSuggestions([])
      return
    }

    debounceRef.current = setTimeout(() => {
      const ctrl = new AbortController()
      abortRef.current = ctrl
      searchAddress(value, ctrl.signal)
        .then(setSuggestions)
        .catch(() => { /* AbortError ou réseau → on ignore */ })
    }, 250)

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [value])

  function pick(s: Suggestion) {
    onChange(s.label)
    setSuggestions([])
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
        id={id}
        type="text"
        autoComplete="off"
        value={value ?? ''}
        onChange={(e) => { onChange(e.target.value); setIsOpen(true); setHighlight(-1) }}
        onFocus={() => setIsOpen(true)}
        onBlur={() => { setTimeout(() => setIsOpen(false), 150) }}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
      />
      {isOpen && suggestions.length > 0 && (
        <div className="addr-dropdown">
          {suggestions.map((s, i) => (
            <button
              type="button"
              key={`${s.label}-${i}`}
              className={`addr-option${i === highlight ? ' hi' : ''}`}
              onMouseDown={(e) => { e.preventDefault(); pick(s) }}
              onMouseEnter={() => setHighlight(i)}
            >
              <div className="addr-label">{s.label}</div>
              <div className="addr-sub">{s.context}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

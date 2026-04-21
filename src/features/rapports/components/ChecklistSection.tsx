import type { CheckValue, ChecklistItem } from '../checklists'
import type { ChecklistResponse } from '../schemas'

type Props = {
  items: ChecklistItem[]
  responses: ChecklistResponse[]
  onChange: (responses: ChecklistResponse[]) => void
  readOnly?: boolean
}

export function ChecklistSection({ items, responses, onChange, readOnly }: Props) {
  function getValue(id: string): CheckValue | null {
    return responses.find((r) => r.id === id)?.value ?? null
  }

  function setValue(id: string, value: CheckValue) {
    if (readOnly) return
    const existing = responses.find((r) => r.id === id)
    if (existing) {
      onChange(responses.map((r) => (r.id === id ? { ...r, value } : r)))
    } else {
      onChange([...responses, { id, value }])
    }
  }

  return (
    <div className="check-list">
      {items.map((item) => {
        const value = getValue(item.id)
        return (
          <div key={item.id} className="check-row">
            <div className="check-info">
              <div className="check-label">{item.label}</div>
              {item.helper && <div className="check-helper">{item.helper}</div>}
            </div>
            <div className="check-btns">
              <button
                type="button"
                className={`check-btn ok${value === 'ok' ? ' on' : ''}`}
                onClick={() => setValue(item.id, 'ok')}
                disabled={readOnly}
              >
                OK
              </button>
              <button
                type="button"
                className={`check-btn nok${value === 'nok' ? ' on' : ''}`}
                onClick={() => setValue(item.id, 'nok')}
                disabled={readOnly}
              >
                NOK
              </button>
              <button
                type="button"
                className={`check-btn na${value === 'na' ? ' on' : ''}`}
                onClick={() => setValue(item.id, 'na')}
                disabled={readOnly}
              >
                N/A
              </button>
            </div>
          </div>
        )
      })}
    </div>
  )
}

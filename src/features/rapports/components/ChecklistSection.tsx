import { AlertTriangle, Camera, Eye, MessageSquare, Wrench, X } from 'lucide-react'
import { useRef, useState } from 'react'
import type { ChangeEvent } from 'react'
import { uploadReportPhoto } from '../../../shared/lib/storage'
import type { StoredPhoto } from '../../../shared/lib/storage'
import type { CheckValue, ChecklistItem } from '../checklists'
import type { ChecklistResponse, RecommendedAction } from '../schemas'
import { RECOMMENDED_ACTION_LABEL } from '../schemas'

type Props = {
  items: ChecklistItem[]
  responses: ChecklistResponse[]
  onChange: (responses: ChecklistResponse[]) => void
  organizationId: string
  interventionId: string
  readOnly?: boolean
}

const MAX_SIZE_MB = 10

const ACTION_ICONS: Record<RecommendedAction, typeof Wrench> = {
  replacement: Wrench,
  repair: Wrench,
  verification: Eye,
}

export function ChecklistSection({
  items,
  responses,
  onChange,
  organizationId,
  interventionId,
  readOnly,
}: Props) {
  const [uploadingId, setUploadingId] = useState<string | null>(null)
  const [showReasonFor, setShowReasonFor] = useState<string | null>(null)
  const fileInputs = useRef<Record<string, HTMLInputElement | null>>({})

  function getResponse(id: string): ChecklistResponse | undefined {
    return responses.find((r) => r.id === id)
  }

  function updateResponse(id: string, patch: Partial<ChecklistResponse>) {
    if (readOnly) return
    const existing = getResponse(id)
    if (existing) {
      onChange(responses.map((r) => (r.id === id ? { ...r, ...patch } : r)))
    } else {
      onChange([...responses, { id, value: null, ...patch }])
    }
  }

  function setValue(id: string, value: CheckValue) {
    if (readOnly) return
    // Si on passe OK / N/A, on nettoie les champs spécifiques NOK (photos, action, reason)
    if (value === 'ok' || value === 'na') {
      updateResponse(id, { value, photos: undefined, action: undefined, noPhotoReason: undefined })
      return
    }
    updateResponse(id, { value })
  }

  function setAction(id: string, action: RecommendedAction) {
    updateResponse(id, { action })
  }

  function setNote(id: string, note: string) {
    updateResponse(id, { note })
  }

  function setReason(id: string, reason: string) {
    updateResponse(id, { noPhotoReason: reason })
  }

  async function handleFileChange(id: string, e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > MAX_SIZE_MB * 1024 * 1024) {
      alert(`Photo trop lourde (> ${MAX_SIZE_MB} MB).`)
      return
    }
    setUploadingId(id)
    try {
      const stored = await uploadReportPhoto(file, organizationId, interventionId)
      const current = getResponse(id)?.photos ?? []
      updateResponse(id, { photos: [...current, stored], noPhotoReason: undefined })
    } catch (err) {
      alert(err instanceof Error ? err.message : "Erreur lors de l'upload")
    } finally {
      setUploadingId(null)
      const input = fileInputs.current[id]
      if (input) input.value = ''
    }
  }

  function removePhoto(id: string, photo: StoredPhoto) {
    const current = getResponse(id)?.photos ?? []
    updateResponse(id, { photos: current.filter((p) => p.path !== photo.path) })
  }

  return (
    <div className="check-list">
      {items.map((item) => {
        const resp = getResponse(item.id)
        const value = resp?.value ?? null
        const photos = resp?.photos ?? []
        const isNok = value === 'nok'
        const needsPhoto = isNok && photos.length === 0 && !resp?.noPhotoReason
        return (
          <div
            key={item.id}
            className={`check-row${isNok ? ' nok-row' : ''}${needsPhoto ? ' needs-photo' : ''}`}
          >
            <div className="check-header">
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

            {/* Détails NOK : photos + action recommandée + note */}
            {isNok && (
              <div className="check-nok-details">
                {/* Photos */}
                <div className="check-photos">
                  <div className="check-photos-label">
                    <Camera size={12} strokeWidth={2} />
                    <span>Photos du défaut</span>
                    {needsPhoto && (
                      <span className="check-required">
                        <AlertTriangle size={10} strokeWidth={2.5} /> Photo obligatoire
                      </span>
                    )}
                  </div>
                  <div className="check-photos-grid">
                    {photos.map((p) => (
                      <div key={p.path} className="check-photo-thumb">
                        <a href={p.url} target="_blank" rel="noreferrer">
                          <img src={p.url} alt="" loading="lazy" />
                        </a>
                        {!readOnly && (
                          <button
                            type="button"
                            className="check-photo-remove"
                            onClick={() => removePhoto(item.id, p)}
                            aria-label="Retirer"
                          >
                            <X size={10} strokeWidth={2.5} />
                          </button>
                        )}
                      </div>
                    ))}
                    {!readOnly && (
                      <button
                        type="button"
                        className="check-photo-add"
                        onClick={() => fileInputs.current[item.id]?.click()}
                        disabled={uploadingId === item.id}
                      >
                        <Camera size={14} strokeWidth={1.8} />
                        <span>{uploadingId === item.id ? '...' : 'Ajouter'}</span>
                      </button>
                    )}
                    <input
                      ref={(el) => { fileInputs.current[item.id] = el }}
                      type="file"
                      accept="image/*"
                      capture="environment"
                      hidden
                      onChange={(e) => void handleFileChange(item.id, e)}
                    />
                  </div>
                  {/* Bouton "Justifier sans photo" (échappatoire) */}
                  {!readOnly && photos.length === 0 && (
                    <div style={{ marginTop: '.4rem' }}>
                      {!resp?.noPhotoReason && showReasonFor !== item.id && (
                        <button
                          type="button"
                          className="check-justify-btn"
                          onClick={() => setShowReasonFor(item.id)}
                        >
                          Impossible de prendre une photo ? Justifier →
                        </button>
                      )}
                      {(showReasonFor === item.id || resp?.noPhotoReason) && (
                        <div style={{ marginTop: '.3rem' }}>
                          <input
                            type="text"
                            value={resp?.noPhotoReason ?? ''}
                            onChange={(e) => setReason(item.id, e.target.value)}
                            placeholder="Ex: Pièce sous scellé, pas d'accès au local…"
                            className="check-reason-input"
                          />
                        </div>
                      )}
                    </div>
                  )}
                  {readOnly && resp?.noPhotoReason && (
                    <div className="check-reason-readonly">
                      Justification : {resp.noPhotoReason}
                    </div>
                  )}
                </div>

                {/* Action recommandée */}
                <div className="check-action">
                  <div className="check-photos-label">
                    <Wrench size={12} strokeWidth={2} />
                    <span>Action recommandée</span>
                    {!resp?.action && (
                      <span className="check-required">
                        <AlertTriangle size={10} strokeWidth={2.5} /> Requis
                      </span>
                    )}
                  </div>
                  <div className="check-action-pills">
                    {(['replacement', 'repair', 'verification'] as RecommendedAction[]).map((a) => {
                      const Icon = ACTION_ICONS[a]
                      const on = resp?.action === a
                      return (
                        <button
                          type="button"
                          key={a}
                          className={`check-action-pill${on ? ' on' : ''}`}
                          onClick={() => setAction(item.id, a)}
                          disabled={readOnly}
                        >
                          <Icon size={11} strokeWidth={2} />
                          {RECOMMENDED_ACTION_LABEL[a]}
                        </button>
                      )
                    })}
                  </div>
                </div>

                {/* Note libre */}
                <div className="check-note">
                  <div className="check-photos-label">
                    <MessageSquare size={12} strokeWidth={2} />
                    <span>Précisions (optionnel)</span>
                  </div>
                  <input
                    type="text"
                    value={resp?.note ?? ''}
                    onChange={(e) => setNote(item.id, e.target.value)}
                    placeholder="Ex: remplacer manomètre, pression à 4 bars"
                    className="check-reason-input"
                    disabled={readOnly}
                  />
                </div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

import { Camera, ImageOff, Loader2 } from 'lucide-react'
import { useRef, useState } from 'react'
import type { ChangeEvent } from 'react'
import { uploadUnitPhoto } from '../api'

export type UnitPhoto = { path: string; url: string }

type Props = {
  organizationId: string
  value: UnitPhoto | null
  /** Nouvelle photo envoyée, ou null si retirée */
  onChange: (photo: UnitPhoto | null) => void
  readOnly?: boolean
  /** compact : fiche d'ajout rapide ; large : photo en grand pendant le contrôle */
  variant?: 'default' | 'compact' | 'large'
}

/**
 * Photo de repérage : l'appareil dans son environnement, pour le reconnaître
 * à la visite suivante (surtout sans étiquette, ou pour une porte coupe-feu).
 */
export function UnitPhotoField({ organizationId, value, onChange, readOnly, variant = 'default' }: Props) {
  const compact = variant === 'compact'
  const large = variant === 'large'
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [zoom, setZoom] = useState(false)

  async function handleFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setUploading(true)
    setError(null)
    try {
      onChange(await uploadUnitPhoto(file, organizationId))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Envoi de la photo impossible. Vérifie ta connexion.')
    } finally {
      setUploading(false)
    }
  }

  const size = compact ? 56 : 84

  return (
    <div style={large ? { display: 'flex', flexDirection: 'column', gap: 10 } : { display: 'flex', alignItems: 'center', gap: 12 }}>
      {value && large ? (
        <button
          type="button"
          onClick={() => setZoom(true)}
          aria-label="Agrandir la photo de repérage"
          style={{ padding: 0, border: 'none', background: 'none', cursor: 'zoom-in', display: 'block', width: '100%' }}
        >
          <img
            src={value.url}
            alt="Photo de repérage"
            style={{ width: '100%', height: 190, objectFit: 'cover', borderRadius: 8, display: 'block', border: '1px solid var(--brd)' }}
          />
        </button>
      ) : value ? (
        <button
          type="button"
          onClick={() => setZoom(true)}
          aria-label="Agrandir la photo de repérage"
          style={{ padding: 0, border: 'none', background: 'none', cursor: 'zoom-in', flexShrink: 0 }}
        >
          <img
            src={value.url}
            alt="Photo de repérage"
            style={{ width: size, height: size, objectFit: 'cover', borderRadius: 8, display: 'block', border: '1px solid var(--brd)' }}
          />
        </button>
      ) : large ? null : (
        <div
          style={{
            width: size, height: size, borderRadius: 8, flexShrink: 0,
            border: '1.5px dashed var(--brd2)', display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'var(--ink3)', background: 'var(--bg)',
          }}
        >
          <ImageOff size={compact ? 18 : 22} strokeWidth={1.6} />
        </div>
      )}

      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
        {!compact && !(large && value) && (
          <span style={{ fontSize: 12, color: 'var(--ink2)', lineHeight: 1.4 }}>
            {value
              ? 'Le technicien reconnaît l\'appareil d\'un coup d\'œil à la prochaine visite.'
              : 'Photographie l\'appareil avec ce qui l\'entoure (porte, mur, couloir) pour le retrouver facilement.'}
          </span>
        )}
        {!readOnly && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <button
              type="button"
              className="btn-sm"
              onClick={() => inputRef.current?.click()}
              disabled={uploading}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
            >
              {uploading ? <Loader2 size={13} className="spin" /> : <Camera size={13} strokeWidth={2} />}
              {uploading ? 'Envoi…' : value ? 'Changer la photo' : 'Prendre la photo'}
            </button>
            {value && !uploading && (
              <button type="button" className="btn-sm" onClick={() => onChange(null)}>
                Retirer
              </button>
            )}
          </div>
        )}
        {error && <span className="ferr on">{error}</span>}
      </div>

      <input ref={inputRef} type="file" accept="image/*" capture="environment" hidden onChange={handleFile} />

      {zoom && value && (
        <div
          className="overlay open"
          style={{ zIndex: 10000, cursor: 'zoom-out' }}
          onClick={() => setZoom(false)}
        >
          <img
            src={value.url}
            alt="Photo de repérage"
            style={{ maxWidth: '100%', maxHeight: '90vh', borderRadius: 10, boxShadow: '0 10px 40px rgba(0,0,0,.4)' }}
          />
        </div>
      )}
    </div>
  )
}

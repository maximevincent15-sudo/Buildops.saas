import { ImagePlus, X } from 'lucide-react'
import { useRef, useState } from 'react'
import type { ChangeEvent } from 'react'
import { deleteReportPhoto, uploadReportPhoto } from '../lib/storage'
import type { StoredPhoto } from '../lib/storage'

type Props = {
  photos: StoredPhoto[]
  onChange: (photos: StoredPhoto[]) => void
  organizationId: string
  interventionId: string
  readOnly?: boolean
}

const MAX_SIZE_MB = 10

export function PhotoUploader({ photos, onChange, organizationId, interventionId, readOnly }: Props) {
  const fileInput = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleFiles(files: FileList | File[]) {
    setError(null)
    const list = Array.from(files).filter((f) => f.type.startsWith('image/'))
    if (list.length === 0) {
      setError('Seuls les fichiers image sont acceptés.')
      return
    }
    const oversized = list.find((f) => f.size > MAX_SIZE_MB * 1024 * 1024)
    if (oversized) {
      setError(`"${oversized.name}" dépasse ${MAX_SIZE_MB} MB.`)
      return
    }

    setUploading(true)
    try {
      const uploaded: StoredPhoto[] = []
      for (const file of list) {
        const stored = await uploadReportPhoto(file, organizationId, interventionId)
        uploaded.push(stored)
      }
      onChange([...photos, ...uploaded])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur lors de l\'upload.')
    } finally {
      setUploading(false)
      if (fileInput.current) fileInput.current.value = ''
    }
  }

  function handleInputChange(e: ChangeEvent<HTMLInputElement>) {
    if (e.target.files && e.target.files.length > 0) {
      void handleFiles(e.target.files)
    }
  }

  async function handleRemove(photo: StoredPhoto) {
    const ok = window.confirm('Supprimer cette photo ?')
    if (!ok) return
    try {
      await deleteReportPhoto(photo.path)
      onChange(photos.filter((p) => p.path !== photo.path))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur lors de la suppression.')
    }
  }

  // Read-only mode: just show the grid
  if (readOnly) {
    if (photos.length === 0) {
      return <div className="photos-empty">Aucune photo.</div>
    }
    return (
      <div className="photos-grid">
        {photos.map((p) => (
          <a key={p.path} href={p.url} target="_blank" rel="noreferrer" className="photo-thumb">
            <img src={p.url} alt="" loading="lazy" />
          </a>
        ))}
      </div>
    )
  }

  return (
    <div>
      <div className="photos-grid">
        {photos.map((p) => (
          <div key={p.path} className="photo-thumb">
            <a href={p.url} target="_blank" rel="noreferrer" aria-label="Ouvrir la photo">
              <img src={p.url} alt="" loading="lazy" />
            </a>
            <button
              type="button"
              className="photo-remove"
              onClick={() => void handleRemove(p)}
              aria-label="Supprimer"
            >
              <X size={12} strokeWidth={2.5} />
            </button>
          </div>
        ))}

        <button
          type="button"
          className="photo-add"
          onClick={() => fileInput.current?.click()}
          disabled={uploading}
        >
          <ImagePlus size={18} strokeWidth={1.8} />
          <span>{uploading ? 'Envoi…' : 'Ajouter'}</span>
        </button>
      </div>

      <input
        ref={fileInput}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={handleInputChange}
      />

      {error && <p className="text-red text-xs" style={{ marginTop: '.5rem' }}>{error}</p>}
      {photos.length === 0 && !error && (
        <p className="text-ink-3 text-xs font-light" style={{ marginTop: '.5rem' }}>
          Aucune photo pour l'instant. Clique sur "Ajouter" pour en joindre.
        </p>
      )}
    </div>
  )
}

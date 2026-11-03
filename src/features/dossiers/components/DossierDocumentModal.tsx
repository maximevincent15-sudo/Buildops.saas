import { Paperclip } from 'lucide-react'
import { useState } from 'react'
import type { MouseEvent } from 'react'
import { useAuthStore } from '../../auth/store'
import { DOSSIER_FILE_TYPES } from '../../../shared/lib/storage'
import { DOSSIER_DOCUMENT_KINDS, DOSSIER_DOCUMENT_LABELS, addDossierDocument } from '../api'
import type { DossierDocumentKind } from '../api'

type Props = {
  open: boolean
  dossierNumber: string
  onClose: () => void
  onAdded: (count: number) => void
}

const ACCEPT = Object.keys(DOSSIER_FILE_TYPES).map((ext) => `.${ext}`).join(',')

function todayIso(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Type proposé d'après le nom du fichier (modifiable) */
function guessKind(file: File): DossierDocumentKind {
  const n = file.name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  if (/\bbl\b|livraison/.test(n)) return 'delivery_note'
  if (/plan/.test(n)) return 'plan'
  if (/\bpv\b|proces|attestation|certificat/.test(n)) return 'certificate'
  if (/rapport/.test(n)) return 'report'
  if (file.type.startsWith('image/') || /\.(jpe?g|png|webp|heic|heif)$/.test(n)) return 'photo'
  return 'other'
}

function titleFromFile(file: File): string {
  return file.name.replace(/\.[^.]+$/, '').replace(/[_]+/g, ' ').trim()
}

/** Ajout de documents à un dossier : bon de livraison, plan, PV, ancien rapport, photo… */
export function DossierDocumentModal({ open, dossierNumber, onClose, onAdded }: Props) {
  const profile = useAuthStore((s) => s.profile)
  const [files, setFiles] = useState<File[]>([])
  const [kind, setKind] = useState<DossierDocumentKind>('other')
  const [title, setTitle] = useState('')
  const [documentDate, setDocumentDate] = useState(todayIso())
  const [saving, setSaving] = useState(false)
  const [progress, setProgress] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  if (!open) return null

  function reset() {
    setFiles([])
    setKind('other')
    setTitle('')
    setDocumentDate(todayIso())
    setProgress(null)
    setError(null)
  }

  function close() {
    if (saving) return
    reset()
    onClose()
  }

  function pick(list: FileList | null) {
    const picked = Array.from(list ?? [])
    setFiles(picked)
    setError(null)
    if (picked.length > 0) {
      setKind(guessKind(picked[0]!))
      setTitle(picked.length === 1 ? titleFromFile(picked[0]!) : '')
    }
  }

  async function handleSave() {
    if (!profile?.organization_id || files.length === 0) return
    setSaving(true)
    setError(null)
    const name = [profile.first_name, profile.last_name].filter(Boolean).join(' ') || null
    let done = 0
    try {
      for (const file of files) {
        setProgress(files.length > 1 ? `Envoi ${done + 1} / ${files.length}…` : 'Envoi…')
        await addDossierDocument({
          file,
          organizationId: profile.organization_id,
          dossierNumber,
          kind,
          title: files.length === 1 ? title : titleFromFile(file),
          documentDate,
          createdByName: name,
        })
        done++
      }
      reset()
      onAdded(done)
    } catch (e) {
      setError(
        (done > 0 ? `${done} document${done > 1 ? 's' : ''} ajouté${done > 1 ? 's' : ''}, puis erreur : ` : '')
        + (e instanceof Error ? e.message : 'Erreur inconnue'),
      )
      if (done > 0) onAdded(done)
    } finally {
      setSaving(false)
      setProgress(null)
    }
  }

  return (
    <div className="overlay open" onClick={(e: MouseEvent<HTMLDivElement>) => { if (e.target === e.currentTarget) close() }}>
      <div className="modal" style={{ maxWidth: 560 }}>
        <div className="modal-head">
          <span className="modal-title" style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <Paperclip size={16} strokeWidth={2} />
            Ajouter un document
          </span>
          <button type="button" className="modal-x" onClick={close} disabled={saving} aria-label="Fermer">×</button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <p className="text-ink-2 text-sm font-light" style={{ margin: 0 }}>
            Dossier <strong>{dossierNumber}</strong> : bon de livraison, plan, PV, ancien rapport, photo…
            PDF, photo, Excel ou Word, 10 Mo maximum par fichier.
          </p>

          <div className="fg">
            <label>Fichier{files.length > 1 ? 's' : ''}</label>
            <input type="file" multiple accept={ACCEPT} onChange={(e) => pick(e.target.files)} disabled={saving} />
            {files.length > 1 && (
              <span className="text-ink-3 text-xs font-light" style={{ marginTop: 4 }}>
                {files.length} fichiers : chacun gardera son nom comme titre.
              </span>
            )}
          </div>

          <div className="mrow">
            <div className="fg">
              <label>Type</label>
              <select value={kind} onChange={(e) => setKind(e.target.value as DossierDocumentKind)} disabled={saving}>
                {DOSSIER_DOCUMENT_KINDS.map((k) => <option key={k} value={k}>{DOSSIER_DOCUMENT_LABELS[k]}</option>)}
              </select>
            </div>
            <div className="fg">
              <label>Date du document</label>
              <input type="date" value={documentDate} onChange={(e) => setDocumentDate(e.target.value)} disabled={saving} />
            </div>
          </div>

          {files.length <= 1 && (
            <div className="fg">
              <label>Titre</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Ex : BL exutoires Hall exposition"
                disabled={saving}
              />
            </div>
          )}

          {error && <span className="ferr on">{error}</span>}

          <div className="modal-foot">
            <button type="button" className="mf out" onClick={close} disabled={saving}>Annuler</button>
            <button type="button" className="mf prim" onClick={() => void handleSave()} disabled={saving || files.length === 0}>
              {saving ? progress ?? 'Envoi…' : files.length > 1 ? `Ajouter ${files.length} documents` : 'Ajouter'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

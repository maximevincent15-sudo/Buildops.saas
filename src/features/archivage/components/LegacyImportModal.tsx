import { useState } from 'react'
import { CheckCircle2, FileText, Upload, X, XCircle } from 'lucide-react'
import { importLegacyDocument } from '../legacyApi'
import type { LegacyKind } from '../legacyApi'
import { useAuthStore } from '../../auth/store'

interface Props {
  open: boolean
  onClose: () => void
  onImported: () => void
}

interface PendingFile {
  id: string
  file: File
  kind: LegacyKind
  reference: string
  document_date: string
  client_name: string
  site_name: string
  amount_ttc: string
  status: 'pending' | 'importing' | 'imported' | 'error'
  error?: string
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

/**
 * Modal d'import batch de PDF historiques dans l'archivage.
 * Drag&drop plusieurs fichiers d'un coup, chaque fichier a son propre
 * formulaire de métadonnées (type, référence, client, date).
 */
export function LegacyImportModal({ open, onClose, onImported }: Props) {
  const profile = useAuthStore((s) => s.profile)
  const [files, setFiles] = useState<PendingFile[]>([])
  const [dragOver, setDragOver] = useState(false)
  const [globalError, setGlobalError] = useState<string | null>(null)

  if (!open) return null

  function addFiles(fileList: FileList | File[]) {
    const arr = Array.from(fileList)
    const pdfs = arr.filter((f) => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf'))
    const rejected = arr.length - pdfs.length
    if (rejected > 0) {
      setGlobalError(`${rejected} fichier(s) ignoré(s) : format PDF requis.`)
    }
    setFiles((prev) => [
      ...prev,
      ...pdfs.map((file) => ({
        id: crypto.randomUUID(),
        file,
        kind: 'report' as LegacyKind,
        // Référence auto : nom du fichier sans extension, tronqué
        reference: file.name.replace(/\.pdf$/i, '').slice(0, 40),
        document_date: todayIso(),
        client_name: '',
        site_name: '',
        amount_ttc: '',
        status: 'pending' as const,
      })),
    ])
  }

  function updateFile(id: string, patch: Partial<PendingFile>) {
    setFiles((prev) => prev.map((f) => (f.id === id ? { ...f, ...patch } : f)))
  }

  function removeFile(id: string) {
    setFiles((prev) => prev.filter((f) => f.id !== id))
  }

  async function handleImport() {
    if (!profile?.organization_id) {
      setGlobalError("Impossible d'importer : pas d'organisation")
      return
    }
    setGlobalError(null)

    for (const pf of files) {
      if (pf.status === 'imported') continue
      if (!pf.reference.trim() || !pf.client_name.trim()) {
        updateFile(pf.id, { status: 'error', error: 'Référence + client requis' })
        continue
      }
      updateFile(pf.id, { status: 'importing', error: undefined })
      try {
        await importLegacyDocument(
          {
            kind: pf.kind,
            reference: pf.reference,
            document_date: pf.document_date,
            client_name: pf.client_name,
            site_name: pf.site_name || undefined,
            amount_ttc: pf.amount_ttc ? Number(pf.amount_ttc) : undefined,
            file: pf.file,
          },
          profile.organization_id,
        )
        updateFile(pf.id, { status: 'imported' })
      } catch (e) {
        updateFile(pf.id, {
          status: 'error',
          error: e instanceof Error ? e.message : 'Erreur inconnue',
        })
      }
    }

    // Notifie le parent pour refresh
    onImported()
  }

  const allImported = files.length > 0 && files.every((f) => f.status === 'imported')
  const anyImporting = files.some((f) => f.status === 'importing')

  return (
    <div className="overlay open" onClick={(e) => {
      if (e.target === e.currentTarget && !anyImporting) onClose()
    }}>
      <div className="modal" style={{ maxWidth: 800 }}>
        <div className="modal-head">
          <span className="modal-title">Importer des documents PDF historiques</span>
          <button
            className="modal-x"
            onClick={onClose}
            disabled={anyImporting}
            aria-label="Fermer"
          >×</button>
        </div>

        <div style={{ padding: '1rem 0' }}>
          <p style={{ fontSize: '.85rem', color: 'var(--ink2)', marginBottom: '1rem', lineHeight: 1.5 }}>
            Uploadez vos anciens rapports, devis et factures au format PDF. Ils apparaîtront dans
            votre archivage avec un badge <strong>« Importé »</strong>. Vos clients auront ainsi
            un historique complet dès le premier jour.
          </p>

          {/* Zone drag&drop */}
          <div
            onDragOver={(e) => {
              e.preventDefault()
              setDragOver(true)
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault()
              setDragOver(false)
              if (e.dataTransfer.files.length > 0) addFiles(e.dataTransfer.files)
            }}
            style={{
              border: `2px dashed ${dragOver ? 'var(--acc, #3A5CA8)' : 'var(--brd, #E1E5EA)'}`,
              borderRadius: 10,
              padding: '1.5rem',
              textAlign: 'center',
              background: dragOver ? 'var(--acc-lt, #E8EEF8)' : 'var(--wht, #F8F9FB)',
              transition: 'all .15s',
              marginBottom: '1rem',
            }}
          >
            <Upload size={28} strokeWidth={1.5} color="var(--ink2)" style={{ marginBottom: 8 }} />
            <div style={{ fontSize: '.9rem', color: 'var(--ink)', marginBottom: 6 }}>
              Glissez vos fichiers PDF ici
            </div>
            <div style={{ fontSize: '.75rem', color: 'var(--ink2)', marginBottom: 12 }}>
              ou
            </div>
            <label className="btn-sm acc" style={{ cursor: 'pointer', display: 'inline-block' }}>
              Choisir des fichiers
              <input
                type="file"
                accept="application/pdf,.pdf"
                multiple
                onChange={(e) => {
                  if (e.target.files) addFiles(e.target.files)
                  e.target.value = '' // Reset pour permettre de re-sélectionner le même fichier
                }}
                style={{ display: 'none' }}
              />
            </label>
          </div>

          {globalError && (
            <div style={{
              padding: '.5rem .8rem',
              background: '#FDECEC',
              border: '1px solid #F0B4B4',
              borderRadius: 6,
              color: '#9B1C1C',
              fontSize: '.8rem',
              marginBottom: '1rem',
            }}>
              {globalError}
            </div>
          )}

          {/* Liste des fichiers à importer */}
          {files.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '.7rem' }}>
              <div style={{ fontSize: '.8rem', fontWeight: 600, color: 'var(--ink2)' }}>
                {files.length} fichier(s) prêt(s)
              </div>
              {files.map((pf) => (
                <FileRow
                  key={pf.id}
                  file={pf}
                  onChange={(patch) => updateFile(pf.id, patch)}
                  onRemove={() => removeFile(pf.id)}
                />
              ))}
            </div>
          )}
        </div>

        <div className="modal-foot">
          <button
            type="button"
            className="btn-sm"
            onClick={onClose}
            disabled={anyImporting}
          >
            {allImported ? 'Fermer' : 'Annuler'}
          </button>
          {files.length > 0 && !allImported && (
            <button
              type="button"
              className="btn-sm acc"
              onClick={() => void handleImport()}
              disabled={anyImporting}
            >
              {anyImporting ? 'Import en cours…' : `Importer ${files.filter((f) => f.status !== 'imported').length} document(s)`}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

interface FileRowProps {
  file: PendingFile
  onChange: (patch: Partial<PendingFile>) => void
  onRemove: () => void
}

function FileRow({ file, onChange, onRemove }: FileRowProps) {
  const isImported = file.status === 'imported'
  const isError = file.status === 'error'
  const isImporting = file.status === 'importing'

  return (
    <div style={{
      padding: '.7rem .8rem',
      border: `1px solid ${isError ? '#F0B4B4' : isImported ? '#B7DFC7' : 'var(--brd, #E1E5EA)'}`,
      borderRadius: 8,
      background: isImported ? '#E6F4EB' : isError ? '#FDECEC' : '#fff',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem', marginBottom: '.5rem' }}>
        <FileText size={14} strokeWidth={2} color="var(--ink2)" />
        <span style={{ fontSize: '.8rem', fontWeight: 600, color: 'var(--ink)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {file.file.name}
        </span>
        <span style={{ fontSize: '.7rem', color: 'var(--ink3)' }}>
          {(file.file.size / 1024).toFixed(0)} Ko
        </span>
        {isImported && <CheckCircle2 size={14} strokeWidth={2.5} color="#0E7A3F" />}
        {isError && <XCircle size={14} strokeWidth={2.5} color="#C0392B" />}
        {!isImported && !isImporting && (
          <button
            type="button"
            onClick={onRemove}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, color: 'var(--ink3)' }}
            aria-label="Retirer"
          >
            <X size={14} strokeWidth={2} />
          </button>
        )}
      </div>

      {isError && (
        <div style={{ fontSize: '.75rem', color: '#9B1C1C', marginBottom: '.5rem' }}>
          ⚠ {file.error}
        </div>
      )}

      {!isImported && (
        <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr 1fr', gap: '.5rem', fontSize: '.78rem' }}>
          <select
            value={file.kind}
            onChange={(e) => onChange({ kind: e.target.value as LegacyKind })}
            disabled={isImporting}
            style={selectStyle}
          >
            <option value="report">Rapport</option>
            <option value="quote">Devis</option>
            <option value="invoice">Facture</option>
          </select>
          <input
            type="text"
            placeholder="Référence *"
            value={file.reference}
            onChange={(e) => onChange({ reference: e.target.value })}
            disabled={isImporting}
            style={inputStyle}
          />
          <input
            type="date"
            value={file.document_date}
            onChange={(e) => onChange({ document_date: e.target.value })}
            disabled={isImporting}
            style={inputStyle}
          />
          <input
            type="text"
            placeholder="Nom du client *"
            value={file.client_name}
            onChange={(e) => onChange({ client_name: e.target.value })}
            disabled={isImporting}
            style={{ ...inputStyle, gridColumn: 'span 2' }}
          />
          <input
            type="text"
            placeholder="Site (optionnel)"
            value={file.site_name}
            onChange={(e) => onChange({ site_name: e.target.value })}
            disabled={isImporting}
            style={inputStyle}
          />
          {(file.kind === 'quote' || file.kind === 'invoice') && (
            <input
              type="number"
              placeholder="Montant TTC €"
              value={file.amount_ttc}
              onChange={(e) => onChange({ amount_ttc: e.target.value })}
              disabled={isImporting}
              step="0.01"
              style={{ ...inputStyle, gridColumn: 'span 3' }}
            />
          )}
        </div>
      )}
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  padding: '.35rem .5rem',
  border: '1px solid var(--brd, #E1E5EA)',
  borderRadius: 5,
  fontSize: '.78rem',
  fontFamily: 'inherit',
  width: '100%',
}

const selectStyle: React.CSSProperties = {
  ...inputStyle,
  cursor: 'pointer',
}

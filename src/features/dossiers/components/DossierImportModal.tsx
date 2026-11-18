import { CheckCircle2, FolderInput, Loader2, Upload, XCircle } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import type { ChangeEvent, DragEvent } from 'react'
import { useAuthStore } from '../../auth/store'
import { DOSSIER_FILE_TYPES } from '../../../shared/lib/storage'
import { supabase } from '../../../shared/lib/supabase'
import { DOSSIER_DOCUMENT_KINDS, DOSSIER_DOCUMENT_LABELS, addDossierDocument } from '../api'
import type { DossierDocumentKind } from '../api'
import { DOSSIER_VIA_LABELS, classifyBatch, dateFromText, guessDocumentKind, readPdfText, titleFromFileName } from '../classify'
import type { DossierVia } from '../classify'

type Props = {
  /** N° de dossier déjà connus dans l'entreprise */
  knownNumbers: string[]
  onClose: () => void
  /** Import terminé (au moins un document ajouté) */
  onImported: (count: number) => void
}

type RowState = 'pending' | 'saving' | 'done' | 'error'

type Row = {
  id: string
  file: File
  /** Chemin d'origine : nom du ZIP ou du dossier, puis du fichier */
  source: string
  dossier: string
  kind: DossierDocumentKind
  title: string
  date: string
  include: boolean
  supported: boolean
  state: RowState
  error: string | null
  /** Même fichier déjà présent plus haut dans cet import (non importé) */
  inBatchCopy: boolean
  /** Méthode qui a donné le n° de dossier */
  via: DossierVia | null
  /** Début de n° lu (lettre finale manquante), proposé à compléter */
  suggestion: string | null
}

const ACCEPT = ['.zip', ...Object.keys(DOSSIER_FILE_TYPES).map((ext) => `.${ext}`)].join(',')
const JUNK = /(^|\/)(__MACOSX|\.DS_Store|Thumbs\.db|\._)/

const extOf = (name: string) => name.split('.').pop()?.toLowerCase() ?? ''
const baseName = (path: string) => path.split('/').pop() ?? path

/** Fichiers à classer : ceux déposés, et le contenu des ZIP */
async function expandFiles(input: File[]): Promise<Array<{ file: File; source: string }>> {
  const out: Array<{ file: File; source: string }> = []
  for (const f of input) {
    const rel = (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name
    if (JUNK.test(rel)) continue
    if (extOf(f.name) === 'zip') {
      const { unzip } = await import('fflate')
      const bytes = new Uint8Array(await f.arrayBuffer())
      const entries = await new Promise<Record<string, Uint8Array>>((resolve, reject) =>
        unzip(bytes, (err, data) => (err ? reject(err) : resolve(data))))
      for (const [path, data] of Object.entries(entries)) {
        if (path.endsWith('/') || JUNK.test(path) || data.length === 0) continue
        const name = baseName(path)
        const type = DOSSIER_FILE_TYPES[extOf(name)] ?? 'application/octet-stream'
        out.push({ file: new File([data.slice()], name, { type }), source: `${f.name.replace(/\.zip$/i, '')}/${path}` })
      }
    } else {
      out.push({ file: f, source: rel })
    }
  }
  return out
}

/**
 * Import de documents en lot : ZIP, dossiers ou fichiers en vrac. Chaque
 * fichier est rangé dans son dossier (n° trouvé dans le nom du ZIP, du
 * fichier ou dans le PDF), avec son type et sa date ; tout se vérifie et se
 * corrige avant l'import.
 */
export function DossierImportModal({ knownNumbers, onClose, onImported }: Props) {
  const profile = useAuthStore((s) => s.profile)
  const [rows, setRows] = useState<Row[]>([])
  const [existing, setExisting] = useState<Set<string>>(new Set())
  const [phase, setPhase] = useState<'drop' | 'reading' | 'review' | 'importing' | 'done'>('drop')
  const [readCount, setReadCount] = useState({ done: 0, total: 0 })
  const [error, setError] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const [importTotal, setImportTotal] = useState(0)
  const fileRef = useRef<HTMLInputElement>(null)
  const folderRef = useRef<HTMLInputElement>(null)

  const known = useMemo(() => new Set(knownNumbers), [knownNumbers])
  const dupKey = (dossier: string, fileName: string) => `${dossier}|${fileName}`

  async function handleFiles(list: File[]) {
    if (list.length === 0) return
    setError(null)
    setPhase('reading')
    try {
      const [expanded, docsRes] = await Promise.all([
        expandFiles(list),
        supabase.from('dossier_documents').select('dossier_number, file_name'),
      ])
      const already = new Set(((docsRes.data ?? []) as Array<{ dossier_number: string; file_name: string | null }>)
        .filter((d) => d.file_name)
        .map((d) => dupKey(d.dossier_number, d.file_name!)))
      setExisting(already)
      setReadCount({ done: 0, total: expanded.length })
      const out: Row[] = []
      // 1. Lecture de chaque fichier (texte des PDF)
      const read: Array<{ file: File; source: string; folder: string; text: string; supported: boolean }> = []
      for (const { file, source } of expanded) {
        const ext = extOf(file.name)
        const supported = !!DOSSIER_FILE_TYPES[ext]
        const text = supported && ext === 'pdf' ? await readPdfText(file) : ''
        read.push({ file, source, folder: source.split('/').slice(0, -1).join(' / '), text, supported })
        setReadCount((c) => ({ ...c, done: c.done + 1 }))
      }
      // 2. Classement du lot : chaque méthode complète les autres (ZIP, fichier, PDF, même ZIP, même devis)
      const classified = classifyBatch(read.map((r) => ({ name: r.file.name, folder: r.folder, text: r.text })), knownNumbers)
      read.forEach((r, i) => {
        const { dossier, via, suggestion } = classified[i]!
        // Déjà dans le dossier, ou même fichier déjà vu dans cet import (copie « (1) »…)
        const sameInBatch = out.some((o) => o.dossier === dossier && o.file.name === r.file.name && o.file.size === r.file.size)
        const duplicate = !!dossier && (already.has(dupKey(dossier, r.file.name)) || sameInBatch)
        out.push({
          id: crypto.randomUUID(),
          file: r.file,
          source: r.source,
          dossier: r.supported ? dossier : '',
          via: r.supported ? via : null,
          suggestion: r.supported ? suggestion : null,
          kind: guessDocumentKind(r.file.name, r.text),
          title: titleFromFileName(r.file.name),
          date: dateFromText(r.text) ?? '',
          include: r.supported && !!dossier && !duplicate,
          inBatchCopy: !!dossier && sameInBatch,
          supported: r.supported,
          state: 'pending',
          error: null,
        })
      })
      // D'abord ce qui demande une action (n° manquant), puis par dossier ; les formats refusés à la fin
      const rank = (r: Row) => (!r.supported ? 2 : r.dossier ? 1 : 0)
      out.sort((a, b) => rank(a) - rank(b)
        || a.dossier.localeCompare(b.dossier, 'fr', { numeric: true })
        || a.file.name.localeCompare(b.file.name, 'fr'))
      setRows(out)
      setPhase('review')
    } catch (e) {
      setError(e instanceof Error ? `Lecture impossible : ${e.message}` : 'Lecture impossible.')
      setPhase('drop')
    }
  }

  function onPick(e: ChangeEvent<HTMLInputElement>) {
    const list = Array.from(e.target.files ?? [])
    e.target.value = ''
    void handleFiles(list)
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault()
    setDragOver(false)
    void handleFiles(Array.from(e.dataTransfer.files ?? []))
  }

  function update(id: string, patch: Partial<Row>) {
    setRows((list) => list.map((r) => (r.id === id ? { ...r, ...patch } : r)))
  }

  const isDuplicate = (r: Row) => !!r.dossier && (r.inBatchCopy || existing.has(dupKey(r.dossier.trim(), r.file.name)))
  const selected = rows.filter((r) => r.include && r.supported && r.dossier.trim())
  const dossiersSelected = new Set(selected.map((r) => r.dossier.trim()))
  const newDossiers = [...dossiersSelected].filter((d) => !known.has(d))
  const withoutDossier = rows.filter((r) => r.supported && !r.dossier.trim()).length
  const duplicates = rows.filter(isDuplicate).length

  async function runImport() {
    if (!profile?.organization_id || selected.length === 0) return
    setPhase('importing')
    setImportTotal(selected.length)
    setError(null)
    const createdBy = [profile.first_name, profile.last_name].filter(Boolean).join(' ') || null
    let ok = 0
    const queue = [...selected]
    async function worker() {
      for (;;) {
        const r = queue.shift()
        if (!r) return
        update(r.id, { state: 'saving', error: null })
        try {
          await addDossierDocument({
            file: r.file,
            organizationId: profile!.organization_id!,
            dossierNumber: r.dossier.trim(),
            kind: r.kind,
            title: r.title.trim() || r.file.name,
            documentDate: r.date || null,
            createdByName: createdBy,
          })
          ok += 1
          update(r.id, { state: 'done', include: false })
        } catch (e) {
          update(r.id, { state: 'error', error: e instanceof Error ? e.message : 'Échec' })
        }
      }
    }
    await Promise.all([worker(), worker(), worker()])
    setPhase('done')
    if (ok > 0) onImported(ok)
  }

  const doneCount = rows.filter((r) => r.state === 'done').length
  const errorCount = rows.filter((r) => r.state === 'error').length
  const busy = phase === 'reading' || phase === 'importing'

  return (
    <div className="overlay open">
      <div className="modal" style={{ maxWidth: 1080 }}>
        <div className="modal-head">
          <span className="modal-title" style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <FolderInput size={16} strokeWidth={2} /> Importer des documents
          </span>
          {!busy && <button type="button" className="modal-x" onClick={onClose} aria-label="Fermer">×</button>}
        </div>

        {phase === 'drop' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '.9rem' }}>
            <p className="text-ink-2 text-sm" style={{ margin: 0, lineHeight: 1.55 }}>
              Déposez vos ZIP, vos dossiers ou vos fichiers en vrac (devis, AR de commande, bons de livraison, PV, plans, photos…).
              Firovia range chaque document dans son dossier d'après le n° trouvé dans le nom du ZIP, du fichier ou dans le PDF,
              et propose son type et sa date. Vous vérifiez avant d'importer.
            </p>
            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
              onDragLeave={() => setDragOver(false)}
              onDrop={onDrop}
              style={{
                border: `2px dashed ${dragOver ? 'var(--acc)' : 'var(--brd2)'}`,
                borderRadius: 12,
                padding: '2.2rem 1rem',
                textAlign: 'center',
                background: dragOver ? 'var(--acc-lt, #EEF2FB)' : 'var(--bg)',
              }}
            >
              <Upload size={26} strokeWidth={1.6} style={{ color: 'var(--acc)' }} />
              <div style={{ fontWeight: 600, margin: '.5rem 0 .8rem' }}>Glissez vos fichiers ici</div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
                <button type="button" className="btn-sm acc" onClick={() => fileRef.current?.click()}>Choisir des fichiers ou des ZIP</button>
                <button type="button" className="btn-sm" onClick={() => folderRef.current?.click()}>Choisir un dossier</button>
              </div>
              <input ref={fileRef} type="file" multiple accept={ACCEPT} hidden onChange={onPick} />
              <input ref={folderRef} type="file" multiple hidden onChange={onPick} {...{ webkitdirectory: '', directory: '' }} />
            </div>
            {error && <p className="text-red text-sm" style={{ margin: 0 }}>{error}</p>}
          </div>
        )}

        {phase === 'reading' && (
          <p className="text-ink-2 text-sm" style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '1rem 0' }}>
            <Loader2 size={16} className="spin" /> Lecture des documents… {readCount.total > 0 ? `${readCount.done} / ${readCount.total}` : ''}
          </p>
        )}

        {(phase === 'review' || phase === 'importing' || phase === 'done') && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '.8rem' }}>
            <p className="text-ink-2 text-sm" style={{ margin: 0 }}>
              <strong>{rows.length}</strong> fichier{rows.length > 1 ? 's' : ''} lu{rows.length > 1 ? 's' : ''} ·{' '}
              <strong>{selected.length}</strong> à importer dans <strong>{dossiersSelected.size}</strong> dossier{dossiersSelected.size > 1 ? 's' : ''}
              {newDossiers.length > 0 && <> · dont {newDossiers.length} nouveau{newDossiers.length > 1 ? 'x' : ''} ({newDossiers.join(', ')})</>}
              {withoutDossier > 0 && <span className="text-red"> · {withoutDossier} sans n° de dossier (à compléter)</span>}
              {duplicates > 0 && <> · {duplicates} en double ou déjà dans leur dossier (décochés)</>}
            </p>

            <div style={{ maxHeight: '55vh', overflow: 'auto', border: '1px solid var(--brd)', borderRadius: 8 }}>
              <table className="dtbl" style={{ width: '100%', fontSize: 12.5 }}>
                <thead>
                  <tr>
                    <th style={{ width: 28 }} />
                    <th>Fichier</th>
                    <th style={{ width: 130 }}>N° de dossier</th>
                    <th style={{ width: 170 }}>Type</th>
                    <th style={{ width: 130 }}>Date</th>
                    <th style={{ width: 110 }}>État</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const dup = isDuplicate(r)
                    const isNew = !!r.dossier.trim() && !known.has(r.dossier.trim())
                    const locked = phase !== 'review' || r.state === 'done'
                    return (
                      <tr key={r.id} style={{ opacity: r.supported ? 1 : 0.5 }}>
                        <td>
                          <input
                            type="checkbox"
                            checked={r.include}
                            disabled={locked || !r.supported || !r.dossier.trim()}
                            onChange={(e) => update(r.id, { include: e.target.checked })}
                            style={{ width: 'auto' }}
                          />
                        </td>
                        <td>
                          <input
                            type="text"
                            value={r.title}
                            disabled={locked}
                            onChange={(e) => update(r.id, { title: e.target.value })}
                            style={{ width: '100%', fontSize: 12.5, padding: '3px 6px' }}
                          />
                          <div className="text-ink-3" style={{ fontSize: 11, marginTop: 2, wordBreak: 'break-all' }}>{r.source}</div>
                        </td>
                        <td>
                          <input
                            type="text"
                            list="dossier-import-numbers"
                            value={r.dossier}
                            disabled={locked || !r.supported}
                            placeholder={r.suggestion ? `${r.suggestion}… ?` : 'N° à saisir'}
                            onChange={(e) => {
                              const v = e.target.value
                              update(r.id, { dossier: v, via: null, inBatchCopy: false, include: !!v.trim() && !existing.has(dupKey(v.trim(), r.file.name)) })
                            }}
                            style={{ width: '100%', fontSize: 12.5, padding: '3px 6px' }}
                          />
                        </td>
                        <td>
                          <select
                            value={r.kind}
                            disabled={locked || !r.supported}
                            onChange={(e) => update(r.id, { kind: e.target.value as DossierDocumentKind })}
                            style={{ width: '100%', fontSize: 12.5, padding: '3px 4px' }}
                          >
                            {DOSSIER_DOCUMENT_KINDS.map((k) => <option key={k} value={k}>{DOSSIER_DOCUMENT_LABELS[k]}</option>)}
                          </select>
                        </td>
                        <td>
                          <input
                            type="date"
                            value={r.date}
                            disabled={locked || !r.supported}
                            onChange={(e) => update(r.id, { date: e.target.value })}
                            style={{ width: '100%', fontSize: 12.5, padding: '3px 4px' }}
                          />
                        </td>
                        <td style={{ fontSize: 11.5 }}>
                          {r.state === 'saving' ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Loader2 size={12} className="spin" /> Envoi…</span>
                            : r.state === 'done' ? <span className="text-grn" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><CheckCircle2 size={12} /> Importé</span>
                              : r.state === 'error' ? <span className="text-red" title={r.error ?? ''} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><XCircle size={12} /> {r.error?.slice(0, 40)}</span>
                                : !r.supported ? <span className="text-ink-3">Format non accepté</span>
                                  : !r.dossier.trim() ? <span className="text-red">{r.suggestion ? `N° incomplet (${r.suggestion}…)` : 'N° manquant'}</span>
                                    : dup ? <span className="text-ink-3">{r.inBatchCopy ? 'En double dans cet import' : 'Déjà dans le dossier'}</span>
                                      : <span className="text-ink-2" title={r.via ? DOSSIER_VIA_LABELS[r.via] : undefined}>
                                          {isNew ? 'Nouveau dossier' : 'Prêt'}
                                          {r.via && r.via !== 'dossier' && r.via !== 'fichier' && (
                                            <span className="text-ink-3" style={{ display: 'block', fontSize: 10.5 }}>
                                              {r.via === 'pdf' ? 'lu dans le PDF' : r.via === 'meme-zip' ? 'même ZIP' : r.via === 'meme-devis' ? 'même devis' : 'complété'}
                                            </span>
                                          )}
                                        </span>}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              <datalist id="dossier-import-numbers">
                {knownNumbers.map((n) => <option key={n} value={n} />)}
              </datalist>
            </div>

            {phase === 'done' && (
              <p className={errorCount ? 'text-red text-sm' : 'text-grn text-sm'} style={{ margin: 0 }}>
                {doneCount} document{doneCount > 1 ? 's' : ''} importé{doneCount > 1 ? 's' : ''}
                {errorCount > 0 ? `, ${errorCount} en échec (survolez l'état pour le détail)` : ''}.
              </p>
            )}

            <div className="modal-foot">
              {phase === 'done' ? (
                <button type="button" className="mf prim" onClick={onClose}>Fermer</button>
              ) : (
                <>
                  <button type="button" className="mf out" onClick={() => { setRows([]); setPhase('drop') }} disabled={busy}>Recommencer</button>
                  <button type="button" className="mf prim" onClick={() => void runImport()} disabled={busy || selected.length === 0}>
                    {phase === 'importing'
                      ? `Import… ${doneCount + errorCount} / ${importTotal}`
                      : `Importer ${selected.length} document${selected.length > 1 ? 's' : ''}`}
                  </button>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

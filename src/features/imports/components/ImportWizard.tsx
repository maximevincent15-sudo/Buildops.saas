import {
  AlertCircle,
  AlertTriangle,
  Check,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  RefreshCw,
  Upload,
  X,
} from 'lucide-react'
import { useRef, useState } from 'react'
import type { ChangeEvent } from 'react'
import { useAuthStore } from '../../auth/store'
import { parseImportFile } from '../parsers'
import { downloadTemplate, generateImportTemplate } from '../templateGenerator'
import type {
  ImportContext,
  ImportDefinition,
  ImportResult,
  RowAnalysis,
} from '../types'

type Props = {
  definition: ImportDefinition
  onDone?: () => void
}

type Step = 'upload' | 'preview' | 'done'

export function ImportWizard({ definition, onDone }: Props) {
  const profile = useAuthStore((s) => s.profile)
  const [step, setStep] = useState<Step>('upload')
  const [rows, setRows] = useState<RowAnalysis[]>([])
  const [loadingParse, setLoadingParse] = useState(false)
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState<ImportResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)

  const orgId = profile?.organization_id ?? ''

  async function handleDownloadTemplate() {
    try {
      const blob = await generateImportTemplate(definition)
      downloadTemplate(blob, definition.templateFilename)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur génération template')
    }
  }

  async function handleFile(file: File) {
    if (!orgId) {
      setError('Organisation non chargée, reconnecte-toi.')
      return
    }
    setLoadingParse(true)
    setError(null)
    try {
      const parsed = await parseImportFile(file, definition.fields)
      if (parsed.length === 0) {
        setError('Le fichier ne contient aucune ligne exploitable. Vérifie que les en-têtes correspondent au template.')
        setLoadingParse(false)
        return
      }
      const ctx: ImportContext = { organizationId: orgId, cache: {} }
      const analyses: RowAnalysis[] = []
      for (let i = 0; i < parsed.length; i++) {
        const analysis = await definition.validateRow(parsed[i], ctx)
        analyses.push({
          ...analysis,
          index: i,
          values: parsed[i],
          duplicateAction: analysis.status === 'duplicate' ? 'skip' : undefined,
        })
      }
      setRows(analyses)
      setStep('preview')
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur à la lecture du fichier")
    } finally {
      setLoadingParse(false)
    }
  }

  function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) void handleFile(file)
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files?.[0]
    if (file) void handleFile(file)
  }

  function toggleDuplicateAction(index: number) {
    setRows((prev) =>
      prev.map((r) =>
        r.index === index
          ? { ...r, duplicateAction: r.duplicateAction === 'update' ? 'skip' : 'update' }
          : r,
      ),
    )
  }

  async function handleImport() {
    if (!orgId) return
    setImporting(true)
    setError(null)
    try {
      const ctx: ImportContext = { organizationId: orgId, cache: {} }
      const result: ImportResult = { created: 0, updated: 0, skipped: 0, errors: [] }
      for (const row of rows) {
        if (row.status === 'invalid') {
          result.skipped++
          continue
        }
        if (row.status === 'duplicate' && row.duplicateAction === 'skip') {
          result.skipped++
          continue
        }
        try {
          const outcome = await definition.importRow(row.values, row, ctx)
          if (outcome === 'created') result.created++
          else if (outcome === 'updated') result.updated++
          else result.skipped++
        } catch (err) {
          result.errors.push({
            rowIndex: row.index,
            message: err instanceof Error ? err.message : 'Erreur inconnue',
          })
        }
      }
      setImportResult(result)
      setStep('done')
      onDone?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur pendant l\'import')
    } finally {
      setImporting(false)
    }
  }

  function resetWizard() {
    setStep('upload')
    setRows([])
    setImportResult(null)
    setError(null)
    if (fileInput.current) fileInput.current.value = ''
  }

  const countValid = rows.filter((r) => r.status === 'valid').length
  const countDuplicates = rows.filter((r) => r.status === 'duplicate').length
  const countInvalid = rows.filter((r) => r.status === 'invalid').length
  const countToImport = rows.filter(
    (r) =>
      r.status === 'valid' ||
      (r.status === 'duplicate' && r.duplicateAction === 'update'),
  ).length

  // ─── Étape 1 : upload ──────────────────────────────────────────────
  if (step === 'upload') {
    return (
      <>
        <div className="card" style={{ marginBottom: '1rem' }}>
          <div className="card-top">
            <span className="card-title">1. Télécharge le template</span>
          </div>
          <p className="text-ink-2 text-sm font-light" style={{ margin: '0 0 .8rem' }}>
            {definition.description}
          </p>
          <button
            type="button"
            className="btn-sm"
            onClick={() => void handleDownloadTemplate()}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            <Download size={14} strokeWidth={2} />
            Télécharger le template Excel
          </button>
          <p className="text-ink-3 text-xs font-light" style={{ marginTop: '.8rem' }}>
            Le template contient les colonnes attendues avec un exemple et des indications.
            Remplis-le avec tes données existantes (copier-coller depuis Excel possible) et importe-le ensuite.
          </p>
        </div>

        <div className="card">
          <div className="card-top">
            <span className="card-title">2. Importe le fichier rempli</span>
          </div>
          <div
            className={`import-dropzone${dragOver ? ' over' : ''}`}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => fileInput.current?.click()}
          >
            <Upload size={32} strokeWidth={1.5} />
            <div className="import-dropzone-title">
              {loadingParse ? 'Analyse du fichier…' : 'Glisse ton fichier ici ou clique pour choisir'}
            </div>
            <div className="import-dropzone-sub">
              Formats acceptés : <strong>.xlsx</strong>, <strong>.csv</strong>
            </div>
          </div>
          <input
            ref={fileInput}
            type="file"
            accept=".xlsx,.xls,.csv,.tsv"
            hidden
            onChange={handleFileChange}
          />

          {error && (
            <p className="text-red text-sm" style={{ marginTop: '1rem' }}>
              <AlertCircle size={14} style={{ display: 'inline', verticalAlign: '-3px', marginRight: 4 }} />
              {error}
            </p>
          )}
        </div>
      </>
    )
  }

  // ─── Étape 2 : preview ─────────────────────────────────────────────
  if (step === 'preview') {
    return (
      <>
        <div className="card" style={{ marginBottom: '1rem' }}>
          <div className="card-top">
            <span className="card-title">Prévisualisation — {rows.length} ligne{rows.length > 1 ? 's' : ''} détectée{rows.length > 1 ? 's' : ''}</span>
            <button
              type="button"
              className="btn-sm"
              onClick={resetWizard}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
            >
              <RefreshCw size={12} /> Changer de fichier
            </button>
          </div>
          <div className="import-kpis">
            <div className="import-kpi valid">
              <CheckCircle2 size={14} /> {countValid} nouvelle{countValid > 1 ? 's' : ''}
            </div>
            <div className="import-kpi dup">
              <RefreshCw size={14} /> {countDuplicates} doublon{countDuplicates > 1 ? 's' : ''}
            </div>
            {countInvalid > 0 && (
              <div className="import-kpi invalid">
                <AlertTriangle size={14} /> {countInvalid} ligne{countInvalid > 1 ? 's' : ''} invalide{countInvalid > 1 ? 's' : ''}
              </div>
            )}
          </div>
        </div>

        <div className="card" style={{ marginBottom: '1rem', overflowX: 'auto' }}>
          <table className="import-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Statut</th>
                {definition.fields.map((f) => (
                  <th key={f.key}>{f.label}</th>
                ))}
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.index} className={`row-${row.status}`}>
                  <td className="row-index">{row.index + 1}</td>
                  <td>
                    {row.status === 'valid' && (
                      <span className="row-badge valid">
                        <CheckCircle2 size={10} /> Nouveau
                      </span>
                    )}
                    {row.status === 'duplicate' && (
                      <span className="row-badge dup">
                        <RefreshCw size={10} /> Existe déjà
                      </span>
                    )}
                    {row.status === 'invalid' && (
                      <span className="row-badge invalid">
                        <X size={10} /> Invalide
                      </span>
                    )}
                    {row.messages.length > 0 && (
                      <div className="row-messages">
                        {row.messages.map((m, i) => (
                          <div key={i}>{m}</div>
                        ))}
                      </div>
                    )}
                  </td>
                  {definition.fields.map((f) => (
                    <td key={f.key} className="row-value">
                      {row.values[f.key] ?? <span className="text-ink-3">—</span>}
                    </td>
                  ))}
                  <td>
                    {row.status === 'duplicate' && (
                      <button
                        type="button"
                        className={`act-btn subtle${row.duplicateAction === 'update' ? ' on' : ''}`}
                        onClick={() => toggleDuplicateAction(row.index)}
                      >
                        {row.duplicateAction === 'update' ? 'Mettre à jour' : 'Ignorer'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {error && (
          <p className="text-red text-sm" style={{ marginBottom: '1rem' }}>{error}</p>
        )}

        <div style={{ display: 'flex', gap: '.7rem', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          <button
            type="button"
            className="btn-sm"
            onClick={resetWizard}
            disabled={importing}
          >
            Annuler
          </button>
          <button
            type="button"
            className="btn-sm acc"
            onClick={() => void handleImport()}
            disabled={importing || countToImport === 0}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            <Check size={14} />
            {importing
              ? 'Import en cours…'
              : `Importer ${countToImport} ligne${countToImport > 1 ? 's' : ''}`}
          </button>
        </div>
      </>
    )
  }

  // ─── Étape 3 : terminé ─────────────────────────────────────────────
  if (step === 'done' && importResult) {
    return (
      <div className="card" style={{ maxWidth: 680 }}>
        <div className="card-top">
          <span className="card-title" style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <FileSpreadsheet size={16} />
            Import terminé
          </span>
        </div>
        <div className="import-kpis" style={{ marginTop: '.5rem' }}>
          <div className="import-kpi valid">
            <CheckCircle2 size={14} /> {importResult.created} créé{importResult.created > 1 ? 's' : ''}
          </div>
          {importResult.updated > 0 && (
            <div className="import-kpi dup">
              <RefreshCw size={14} /> {importResult.updated} mis à jour
            </div>
          )}
          {importResult.skipped > 0 && (
            <div className="import-kpi neutral">
              <X size={14} /> {importResult.skipped} ignoré{importResult.skipped > 1 ? 's' : ''}
            </div>
          )}
          {importResult.errors.length > 0 && (
            <div className="import-kpi invalid">
              <AlertTriangle size={14} /> {importResult.errors.length} erreur{importResult.errors.length > 1 ? 's' : ''}
            </div>
          )}
        </div>

        {importResult.errors.length > 0 && (
          <div className="import-errors">
            <div className="text-ink-2 text-sm" style={{ fontWeight: 500, marginBottom: 6 }}>
              Détail des erreurs :
            </div>
            {importResult.errors.map((e, i) => (
              <div key={i} className="text-red text-xs">
                Ligne {e.rowIndex + 1} : {e.message}
              </div>
            ))}
          </div>
        )}

        <div style={{ display: 'flex', gap: '.7rem', marginTop: '1.2rem', flexWrap: 'wrap' }}>
          <button
            type="button"
            className="btn-sm acc"
            onClick={resetWizard}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            <Upload size={13} /> Importer un autre fichier
          </button>
        </div>
      </div>
    )
  }

  return null
}

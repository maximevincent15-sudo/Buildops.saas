import { ImageIcon, Trash2, Upload } from 'lucide-react'
import { useRef, useState } from 'react'
import type { ChangeEvent } from 'react'
import { removeOrganizationLogo, uploadOrganizationLogo } from '../logo'

type Props = {
  organizationId: string
  logoUrl: string | null
  /** Nouvelle adresse du logo (null si retiré), déjà enregistrée */
  onChange: (url: string | null) => void
}

/** Logo de l'entreprise, imprimé en tête des devis, factures, rapports et contrats (administrateurs) */
export function LogoCard({ organizationId, logoUrl, onChange }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState<'upload' | 'remove' | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function handleFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setBusy('upload')
    setError(null)
    try {
      onChange(await uploadOrganizationLogo(organizationId, file, logoUrl))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Envoi du logo impossible.')
    } finally {
      setBusy(null)
    }
  }

  async function handleRemove() {
    if (!window.confirm('Retirer le logo ? Il ne sera plus imprimé sur les prochains documents.')) return
    setBusy('remove')
    setError(null)
    try {
      await removeOrganizationLogo(organizationId, logoUrl)
      onChange(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Impossible de retirer le logo.')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="card" style={{ marginBottom: '1rem' }}>
      <div className="card-top">
        <span className="card-title" style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          <ImageIcon size={14} strokeWidth={1.8} />
          Logo de l'entreprise
        </span>
        <span className="text-ink-3 text-xs font-light">
          Imprimé en tête de tes devis, factures, rapports et contrats.
        </span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
        <div
          style={{
            width: 200, height: 80, borderRadius: 10, background: '#fff',
            border: logoUrl ? '1px solid var(--brd)' : '1.5px dashed var(--brd)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 10, flexShrink: 0,
          }}
        >
          {logoUrl
            ? <img src={logoUrl} alt="Logo de l'entreprise" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
            : <span className="text-ink-3 text-xs font-light">Pas encore de logo</span>}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button
              type="button"
              className="btn-sm acc"
              onClick={() => inputRef.current?.click()}
              disabled={busy !== null}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
            >
              <Upload size={13} strokeWidth={2} />
              {busy === 'upload' ? 'Envoi…' : logoUrl ? 'Changer le logo' : 'Ajouter le logo'}
            </button>
            {logoUrl && (
              <button
                type="button"
                className="btn-sm"
                onClick={() => void handleRemove()}
                disabled={busy !== null}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
              >
                <Trash2 size={13} strokeWidth={2} />
                {busy === 'remove' ? 'Retrait…' : 'Retirer'}
              </button>
            )}
          </div>
          <span className="text-ink-3 text-xs font-light" style={{ lineHeight: 1.5 }}>
            PNG ou JPG, 1 Mo maximum. Un logo en largeur, sur fond blanc ou transparent, rend le mieux.
            Les documents déjà générés ne changent pas : régénère le PDF pour y mettre le nouveau logo.
          </span>
          {error && <span className="ferr on">{error}</span>}
        </div>
      </div>

      <input ref={inputRef} type="file" accept="image/png,image/jpeg" onChange={(e) => void handleFile(e)} style={{ display: 'none' }} />
    </div>
  )
}

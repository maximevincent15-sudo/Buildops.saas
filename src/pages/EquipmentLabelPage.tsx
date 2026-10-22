import { QrCode } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { findUnitsByQrCodes } from '../features/equipment/api'
import { labelUrl } from '../features/equipment/labels'

/**
 * Étiquette QR Firovia scannée avec l'appareil photo du téléphone
 * (app.firovia.fr/e/<CODE>) : ouvre la fiche de l'équipement.
 */
export function EquipmentLabelPage() {
  const { code = '' } = useParams()
  const navigate = useNavigate()
  const [state, setState] = useState<'loading' | 'unknown' | 'error'>('loading')

  useEffect(() => {
    let alive = true
    findUnitsByQrCodes([labelUrl(code.toUpperCase()), labelUrl(code), code])
      .then((found) => {
        if (!alive) return
        if (found.length > 0) navigate(`/equipements?open=${found[0]!.id}`, { replace: true })
        else setState('unknown')
      })
      .catch(() => { if (alive) setState('error') })
    return () => { alive = false }
  }, [code, navigate])

  if (state === 'loading') {
    return (
      <div className="card">
        <p className="text-ink-2 text-sm font-light">Recherche de l'équipement…</p>
      </div>
    )
  }

  return (
    <div className="card" style={{ maxWidth: 560 }}>
      <div className="card-top">
        <span className="card-title" style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          <QrCode size={15} strokeWidth={2} /> Étiquette {code.toUpperCase()}
        </span>
      </div>
      {state === 'error' ? (
        <p className="text-red text-sm">Impossible de vérifier l'étiquette. Vérifie ta connexion et réessaie.</p>
      ) : (
        <>
          <p className="text-ink-2 text-sm" style={{ lineHeight: 1.55, margin: '0 0 1rem' }}>
            Cette étiquette n'est encore associée à aucun équipement de ton entreprise.
            Pour l'associer : ouvre le rapport de l'intervention sur ce site, touche
            <strong> « Scanner une étiquette »</strong> et scanne-la. L'appareil est créé avec ce code.
          </p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Link to="/rapports" className="mf prim" style={{ textDecoration: 'none' }}>Ouvrir les rapports</Link>
            <Link to="/equipements" className="mf out" style={{ textDecoration: 'none' }}>Voir les équipements</Link>
          </div>
        </>
      )}
    </div>
  )
}

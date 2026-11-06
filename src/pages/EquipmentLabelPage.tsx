import { QrCode } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { findUnitsByQrCodes } from '../features/equipment/api'
import { labelUrl } from '../features/equipment/labels'
import { findOpenVisitForSite } from '../features/planning/api'

/**
 * Étiquette QR Firovia scannée avec l'appareil photo du téléphone
 * (app.firovia.fr/e/<CODE>) : ouvre le rapport de la visite en cours sur le
 * site (ou prévue aujourd'hui) avec l'appareil, sinon la fiche de l'équipement.
 */
export function EquipmentLabelPage() {
  const { code = '' } = useParams()
  const navigate = useNavigate()
  const [state, setState] = useState<'loading' | 'unknown' | 'error'>('loading')

  useEffect(() => {
    let alive = true
    findUnitsByQrCodes([labelUrl(code.toUpperCase()), labelUrl(code), code])
      .then(async (found) => {
        if (!alive) return
        const unit = found[0]
        if (!unit) { setState('unknown'); return }
        const visit = unit.site_id ? await findOpenVisitForSite(unit.site_id).catch(() => null) : null
        if (!alive) return
        if (visit) navigate(`/rapports/${visit.id}?unit=${unit.id}`, { replace: true })
        else navigate(`/equipements?open=${unit.id}`, { replace: true })
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
        <>
          <p className="text-red text-sm" style={{ margin: '0 0 .6rem' }}>Impossible de vérifier l'étiquette sans réseau.</p>
          <p className="text-ink-2 text-sm" style={{ lineHeight: 1.55, margin: '0 0 1rem' }}>
            Sur place, scannez plutôt depuis le rapport de la visite (bouton <strong>« Scanner une étiquette »</strong>) :
            le scan y fonctionne même sans réseau.
          </p>
          <Link to="/planning" className="mf prim" style={{ textDecoration: 'none' }}>Ouvrir le planning</Link>
        </>
      ) : (
        <>
          <p className="text-ink-2 text-sm" style={{ lineHeight: 1.55, margin: '0 0 1rem' }}>
            Cette étiquette n'est encore associée à aucun équipement de votre entreprise.
            Pour l'associer : ouvrez le rapport de l'intervention sur ce site, touchez
            <strong> « Scanner une étiquette »</strong> et scannez-la. L'appareil est créé avec ce code.
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

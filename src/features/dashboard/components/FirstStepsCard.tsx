import { CheckCircle2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../../shared/lib/supabase'

type Props = {
  organizationId: string
  /** Ouvre la fenêtre « Nouvelle intervention » du tableau de bord */
  onPlanVisit: () => void
}

type Progress = {
  identity: boolean
  clients: boolean
  units: boolean
  technicians: boolean
  visits: boolean
}

const hiddenKey = (orgId: string) => `firovia.premiersPas.masque.${orgId}`

function readHidden(orgId: string): boolean {
  try {
    return localStorage.getItem(hiddenKey(orgId)) === '1'
  } catch {
    return false
  }
}

async function hasRows(table: string): Promise<boolean> {
  const { count, error } = await supabase.from(table).select('id', { count: 'exact', head: true })
  if (error) throw error
  return (count ?? 0) > 0
}

async function loadProgress(orgId: string): Promise<Progress> {
  const [settings, clients, units, technicians, visits] = await Promise.all([
    supabase
      .from('organization_invoicing_settings')
      .select('siret, legal_address')
      .eq('organization_id', orgId)
      .maybeSingle()
      .then(({ data }) => data as { siret: string | null; legal_address: string | null } | null),
    hasRows('clients'),
    hasRows('equipment_units'),
    hasRows('technicians'),
    hasRows('interventions'),
  ])
  return {
    identity: !!settings?.siret && !!settings?.legal_address,
    clients,
    units,
    technicians,
    visits,
  }
}

/**
 * « Premiers pas » : les 5 étapes pour démarrer, cochées d'après les données
 * de l'entreprise. Disparaît quand tout est fait, ou sur « Masquer »
 * (mémorisé sur ce navigateur).
 */
export function FirstStepsCard({ organizationId, onPlanVisit }: Props) {
  const [progress, setProgress] = useState<Progress | null>(null)
  const [hidden, setHidden] = useState(() => readHidden(organizationId))

  useEffect(() => {
    if (hidden) return
    let alive = true
    loadProgress(organizationId)
      .then((p) => { if (alive) setProgress(p) })
      .catch(() => { /* le tableau de bord reste utilisable sans ce guide */ })
    return () => { alive = false }
  }, [organizationId, hidden])

  if (hidden || !progress) return null

  const steps: Array<{
    done: boolean
    title: string
    sub: string
    action: ReactNode
    secondary?: ReactNode
  }> = [
    {
      done: progress.identity,
      title: 'Vérifier l’identité de l’entreprise',
      sub: 'SIRET, adresse du siège, TVA : imprimés sur les devis, factures et rapports. Repris de votre SIRET, à vérifier.',
      action: <Link to="/parametres" className="b-btn acc">Ouvrir les paramètres</Link>,
    },
    {
      done: progress.clients,
      title: 'Ajouter vos clients',
      sub: 'Un par un, ou d’un coup depuis votre fichier Excel.',
      action: <Link to="/clients/import" className="b-btn acc">Importer un Excel</Link>,
      secondary: <Link to="/clients" className="b-section-link">ou un par un</Link>,
    },
    {
      done: progress.units,
      title: 'Enregistrer le parc d’équipements',
      sub: 'Extincteurs, BAES, désenfumage… site par site. Les sites se créent à l’import.',
      action: <Link to="/equipements/import" className="b-btn acc">Importer un Excel</Link>,
      secondary: <Link to="/equipements" className="b-section-link">ou à la main</Link>,
    },
    {
      done: progress.technicians,
      title: 'Ajouter vos techniciens',
      sub: 'Pour leur attribuer des visites et leur donner accès à l’app sur téléphone.',
      action: <Link to="/techniciens" className="b-btn acc">Ajouter un technicien</Link>,
    },
    {
      done: progress.visits,
      title: 'Planifier une première visite',
      sub: 'Le technicien la retrouve sur son téléphone et y fait le rapport.',
      action: <button type="button" className="b-btn acc" onClick={onPlanVisit}>Planifier une visite</button>,
      secondary: <Link to="/planning/import" className="b-section-link">ou importer un planning</Link>,
    },
  ]
  const doneCount = steps.filter((s) => s.done).length
  if (doneCount === steps.length) return null

  function hide() {
    try {
      localStorage.setItem(hiddenKey(organizationId), '1')
    } catch { /* navigateur sans stockage : masqué jusqu'au rechargement */ }
    setHidden(true)
  }

  return (
    <div className="b-section">
      <div className="b-card">
        <div className="b-section-head" style={{ marginBottom: 8 }}>
          <div>
            <div className="b-section-h" style={{ fontSize: 15 }}>Premiers pas</div>
            <div className="b-section-s" style={{ fontSize: 12 }}>
              {doneCount}/{steps.length} étapes faites · les cases se cochent toutes seules
            </div>
          </div>
          <button type="button" className="b-section-link" style={{ background: 'none', border: 'none', padding: 0 }} onClick={hide}>
            Masquer
          </button>
        </div>
        <div className="b-list">
          {steps.map((s, i) => (
            <div key={s.title} className="b-list-item" style={{ alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <div
                aria-hidden
                style={{
                  width: 26, height: 26, flex: '0 0 26px', borderRadius: '50%',
                  display: 'grid', placeItems: 'center', fontSize: 12, fontWeight: 700,
                  background: s.done ? 'var(--grn-lt)' : 'var(--bg)',
                  color: s.done ? 'var(--grn)' : 'var(--ink2)',
                }}
              >
                {s.done ? <CheckCircle2 size={16} strokeWidth={2.2} /> : i + 1}
              </div>
              <div style={{ flex: '1 1 240px', minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: s.done ? 'var(--ink3)' : 'var(--ink)', textDecoration: s.done ? 'line-through' : 'none' }}>
                  {s.title}
                </div>
                {!s.done && <div style={{ fontSize: 12.5, color: 'var(--ink2)', marginTop: 2 }}>{s.sub}</div>}
              </div>
              {!s.done && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  {s.secondary}
                  {s.action}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

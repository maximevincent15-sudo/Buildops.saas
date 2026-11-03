import { ArrowLeft, ListChecks, Plus } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuthStore } from '../features/auth/store'
import {
  deleteChecklistTemplate,
  invalidateChecklistContext,
  loadChecklistContext,
  saveChecklistTemplate,
  unitLists,
  visitList,
} from '../features/checklists/api'
import type { ChecklistContext, ChecklistPoint, EffectiveList } from '../features/checklists/api'
import { ChecklistListEditor } from '../features/checklists/components/ChecklistListEditor'
import { FAMILY_TO_EQUIPMENT_TYPE } from '../features/contrats/schemas'
import type { EquipmentFamily } from '../features/equipment/schemas'
import { EQUIPMENT_TYPES } from '../shared/constants/interventions'
import type { EquipmentType } from '../shared/constants/interventions'

const TYPES = Object.keys(EQUIPMENT_TYPES) as EquipmentType[]

/** Famille d'appareils d'un type d'intervention (aucune pour l'extinction automatique) */
function familyOf(type: EquipmentType): EquipmentFamily | null {
  const entry = Object.entries(FAMILY_TO_EQUIPMENT_TYPE).find(([, t]) => t === type)
  return (entry?.[0] as EquipmentFamily | undefined) ?? null
}

/** Checklists de l'entreprise : celle de la visite et celles des appareils, par type */
export function ChecklistsPage() {
  const organizationId = useAuthStore((s) => s.profile?.organization_id)
  const [ctx, setCtx] = useState<ChecklistContext | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [type, setType] = useState<EquipmentType>('extincteurs')
  const [version, setVersion] = useState(0)
  const [flash, setFlash] = useState<string | null>(null)

  useEffect(() => {
    if (!organizationId) return
    let alive = true
    invalidateChecklistContext()
    void loadChecklistContext(organizationId)
      .then((c) => { if (alive) { setCtx(c); setError(null) } })
      .catch((e) => { if (alive) setError(e instanceof Error ? e.message : 'Chargement impossible') })
    return () => { alive = false }
  }, [organizationId, version])

  // Après un enregistrement : on recharge, et les listes réapparaissent avec les données à jour
  const done = (message: string) => {
    setFlash(message)
    setTimeout(() => setFlash(null), 3000)
    setCtx(null)
    setVersion((v) => v + 1)
  }

  if (!organizationId) return null
  const family = familyOf(type)
  const visit = visitList(ctx, type)
  const lists = family ? unitLists(ctx, family) : []

  async function saveList(list: EffectiveList, scope: 'visit' | 'unit', kind: string, name: string, items: ChecklistPoint[]) {
    await saveChecklistTemplate({ organizationId: organizationId!, rowId: list.rowId, scope, kind, builtinKey: list.builtinKey, name, items })
    done('Liste enregistrée : elle s\'applique aux prochains contrôles.')
  }

  async function addUnitList() {
    if (!family) return
    const base = lists[0]
    await saveChecklistTemplate({
      organizationId: organizationId!,
      rowId: null,
      scope: 'unit',
      kind: family,
      builtinKey: null,
      name: base ? `${base.name} (copie)` : 'Nouvelle liste',
      items: base?.items.length ? base.items : [{ id: 'p1', label: 'Point à vérifier' }],
      position: lists.length,
    })
    done('Nouvelle liste créée : renomme-la et adapte ses points.')
  }

  return (
    <>
      <div className="dash-top">
        <div>
          <div className="dash-title" style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
            <ListChecks size={22} strokeWidth={2} />
            Checklists de contrôle
          </div>
          <div className="dash-sub">
            Adapte les points que tes techniciens vérifient. Les rapports déjà finalisés ne changent pas.
          </div>
        </div>
        <div className="dash-acts">
          <Link to="/parametres" className="btn-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <ArrowLeft size={14} /> Paramètres
          </Link>
        </div>
      </div>

      {error && <p className="text-red text-sm">Erreur : {error}</p>}
      {flash && <p className="text-grn text-sm" style={{ margin: '0 0 .8rem' }}>{flash}</p>}

      <div className="filter-row" style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: '1rem' }}>
        {TYPES.map((t) => (
          <button key={t} type="button" className={`filter-pill${type === t ? ' on' : ''}`} onClick={() => setType(t)}>
            {EQUIPMENT_TYPES[t]}
          </button>
        ))}
      </div>

      {!ctx ? (
        <p className="text-ink-2 text-sm font-light">Chargement des checklists…</p>
      ) : (
        <>
          <div className="card" style={{ marginBottom: '1rem' }}>
            <div className="card-top">
              <span className="card-title">Checklist de la visite · {EQUIPMENT_TYPES[type]}</span>
              <span className="text-ink-3 text-xs font-light">{visit.rowId ? 'Modifiée par ton entreprise' : 'Liste Firovia'}</span>
            </div>
            <p className="text-ink-3 text-xs font-light" style={{ margin: '0 0 .8rem' }}>
              Points du site cochés une fois par visite (OK, non conforme ou sans objet), dans la partie « Checklist » du rapport.
            </p>
            <ChecklistListEditor
              key={`visit-${type}-${visit.rowId ?? 'firovia'}-${version}`}
              name={visit.name}
              items={visit.items}
              nameEditable={false}
              canReset={!!visit.rowId}
              canDelete={false}
              onSave={(name, items) => saveList(visit, 'visit', type, name, items)}
              onReset={async () => { await deleteChecklistTemplate(visit.rowId!); done('Liste Firovia rétablie.') }}
            />
          </div>

          {family ? (
            <div className="card">
              <div className="card-top">
                <span className="card-title">Checklist par appareil · {EQUIPMENT_TYPES[type]}</span>
                <span className="text-ink-3 text-xs font-light">{lists.length} liste{lists.length > 1 ? 's' : ''}</span>
              </div>
              <p className="text-ink-3 text-xs font-light" style={{ margin: '0 0 .8rem' }}>
                Points vérifiés sur chaque appareil pendant la visite. Avec plusieurs listes, le technicien choisit celle de l'appareil ;
                Firovia la garde pour les visites suivantes. La première liste s'applique par défaut.
              </p>
              {lists.map((l, i) => (
                <div key={l.key} className="cl-block">
                  <div className="cl-block-head">
                    <strong>{i + 1}. {l.name}</strong>
                    <span className="text-ink-3 text-xs font-light">
                      {l.builtinKey ? (l.rowId ? 'Liste Firovia modifiée' : 'Liste Firovia') : 'Créée par ton entreprise'}
                      {i === 0 ? ' · par défaut' : ''}
                    </span>
                  </div>
                  <ChecklistListEditor
                    key={`unit-${l.key}-${l.rowId ?? 'firovia'}-${version}`}
                    name={l.name}
                    items={l.items}
                    nameEditable
                    canReset={!!l.builtinKey && !!l.rowId}
                    canDelete={!l.builtinKey}
                    onSave={(name, items) => saveList(l, 'unit', family, name, items)}
                    onReset={async () => { await deleteChecklistTemplate(l.rowId!); done('Liste Firovia rétablie.') }}
                    onDelete={async () => { await deleteChecklistTemplate(l.rowId!); done('Liste supprimée.') }}
                  />
                </div>
              ))}
              <button type="button" className="btn-sm" onClick={() => void addUnitList().catch((e) => setError(e instanceof Error ? e.message : 'Création impossible'))} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 10 }}>
                <Plus size={13} /> Nouvelle liste par appareil
              </button>
            </div>
          ) : (
            <p className="text-ink-3 text-sm font-light">Pas de contrôle appareil par appareil pour ce type : seule la checklist de la visite s'applique.</p>
          )}
        </>
      )}
    </>
  )
}

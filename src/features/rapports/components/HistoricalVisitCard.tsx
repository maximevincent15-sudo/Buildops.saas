import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import { CalendarPlus, Download, FileClock, FolderOpen } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { INSPECTION_FREQUENCIES_DAYS } from '../../alertes/frequencies'
import type { DossierDocument } from '../../dossiers/api'
import { normalizeSearch } from '../../../shared/lib/search'
import { supabase } from '../../../shared/lib/supabase'
import { resolveEquipmentTypes } from '../../../shared/constants/interventions'
import type { EquipmentType } from '../../../shared/constants/interventions'
import type { Intervention } from '../../planning/schemas'
import { FileLink } from '../../../shared/ui/FileLink'

type Props = {
  intervention: Intervention
  dossierNumber: string | null
  /** Administrateur : lien vers le dossier et planification */
  isAdmin: boolean
  /** Ouvre la fiche de la visite suivante, pré-remplie à la date proposée */
  onPlanNext: (date: string) => void
  /** Faire quand même le rapport de cette visite dans Firovia */
  onWriteReport: () => void
  /** Change après la planification : recharge la visite suivante */
  refreshKey?: number
}

type NextVisit = { id: string; reference: string; scheduled_date: string | null; status: string }

function isoDay(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function frDay(d: string): string {
  return format(new Date(d), 'd MMMM yyyy', { locale: fr })
}

/**
 * Visite terminée sans rapport Firovia (historique importé) : au lieu d'un
 * rapport vide « incomplet », le rapport d'origine joint au dossier, la
 * prochaine échéance et la planification de la visite suivante.
 */
export function HistoricalVisitCard({ intervention, dossierNumber, isAdmin, onPlanNext, onWriteReport, refreshKey }: Props) {
  const [docs, setDocs] = useState<DossierDocument[]>([])
  const [next, setNext] = useState<NextVisit | null>(null)

  const visitDate = intervention.scheduled_date ?? intervention.created_at.slice(0, 10)
  const types = resolveEquipmentTypes(intervention) as EquipmentType[]
  const freqDays = Math.min(...types.map((t) => INSPECTION_FREQUENCIES_DAYS[t] ?? 365), 365)
  const due = new Date(visitDate)
  due.setDate(due.getDate() + freqDays)
  const dueIso = isoDay(due)
  const today = isoDay(new Date())
  const daysLate = Math.floor((new Date(today).getTime() - new Date(dueIso).getTime()) / 86_400_000)

  // Rapport d'origine : « Ancien rapport » du dossier, au nom du site, sinon à la date de la visite
  useEffect(() => {
    if (!dossierNumber) return
    let alive = true
    void supabase
      .from('dossier_documents')
      .select('*')
      .eq('dossier_number', dossierNumber)
      .eq('kind', 'report')
      .then(({ data }) => {
        if (!alive) return
        const all = (data ?? []) as DossierDocument[]
        const site = normalizeSearch(intervention.site_name ?? '')
        const bySite = site ? all.filter((d) => normalizeSearch(`${d.title} ${d.file_name ?? ''}`).includes(site)) : []
        const byDate = all.filter((d) => d.document_date === visitDate)
        setDocs(bySite.length > 0 ? bySite : byDate.length > 0 ? byDate : all)
      })
    return () => { alive = false }
  }, [dossierNumber, intervention.site_name, visitDate])

  // Visite suivante déjà prévue sur le même site
  useEffect(() => {
    let alive = true
    let q = supabase
      .from('interventions')
      .select('id, reference, scheduled_date, status')
      .neq('id', intervention.id)
      .gt('scheduled_date', visitDate)
      .order('scheduled_date', { ascending: true })
      .limit(1)
    q = intervention.site_id
      ? q.eq('site_id', intervention.site_id)
      : q.eq('client_name', intervention.client_name).eq('site_name', intervention.site_name ?? '')
    void q.then(({ data }) => { if (alive) setNext(((data ?? [])[0] as NextVisit | undefined) ?? null) })
    return () => { alive = false }
  }, [intervention.id, intervention.site_id, intervention.client_name, intervention.site_name, visitDate, refreshKey])

  return (
    <div className="card" style={{ marginBottom: '1rem' }}>
      <div className="card-top">
        <span className="card-title" style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          <FileClock size={15} strokeWidth={1.8} />
          Visite du {frDay(visitDate)} · historique
        </span>
        {isAdmin && dossierNumber && (
          <Link to={`/dossiers/${encodeURIComponent(dossierNumber)}`} className="btn-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <FolderOpen size={13} strokeWidth={2} /> Dossier {dossierNumber}
          </Link>
        )}
      </div>

      <p className="text-ink-2 text-sm font-light" style={{ margin: '0 0 .9rem' }}>
        Cette visite a été faite avant Firovia, ou sans rapport dans Firovia.
        {docs.length > 0 ? ' Son rapport d\'origine est joint au dossier.' : ''}
      </p>

      {docs.length > 0 && (
        <div className="archive-list" style={{ marginBottom: '1rem' }}>
          {docs.map((d) => (
            <div key={d.id} className="archive-row b-acc">
              <div className="archive-main">
                <div className="archive-title">
                  <span className="archive-kind">Rapport d'origine</span>
                  <strong>{d.title}</strong>
                </div>
                <div className="archive-meta">{d.file_name}</div>
              </div>
              <div className="archive-actions">
                <FileLink url={d.file_url} target="_blank" rel="noreferrer" className="btn-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <Download size={11} strokeWidth={2} /> Ouvrir
                </FileLink>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="historical-due">
        <div>
          <div className="text-ink-3 text-xs" style={{ textTransform: 'uppercase', letterSpacing: '.04em' }}>Prochaine échéance</div>
          <div style={{ fontWeight: 600, marginTop: 2 }}>
            {frDay(dueIso)}
            {next
              ? <span className="text-grn text-sm" style={{ fontWeight: 400 }}> · visite {next.reference} {next.status === 'terminee' ? 'faite' : 'prévue'}{next.scheduled_date ? ` le ${frDay(next.scheduled_date)}` : ''}</span>
              : daysLate > 0
                ? <span className="text-red text-sm" style={{ fontWeight: 400 }}> · en retard de {daysLate} jour{daysLate > 1 ? 's' : ''}</span>
                : null}
          </div>
        </div>
        {next ? (
          <Link to={`/rapports/${next.id}`} className="btn-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            Ouvrir {next.reference}
          </Link>
        ) : isAdmin ? (
          <button
            type="button"
            className="btn-sm acc"
            onClick={() => onPlanNext(dueIso > today ? dueIso : today)}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            <CalendarPlus size={14} /> Planifier la visite {dueIso.slice(0, 4)}
          </button>
        ) : null}
      </div>

      <p className="text-ink-3 text-xs font-light" style={{ margin: '.9rem 0 0' }}>
        La prochaine visite reprend les équipements du site : le technicien les contrôle un par un et Firovia fait le nouveau rapport.{' '}
        <button type="button" className="link-btn" onClick={onWriteReport}>Faire quand même le rapport de cette visite dans Firovia</button>
      </p>
    </div>
  )
}

import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import {
  ArrowLeft,
  Camera,
  ClipboardCheck,
  Download,
  ExternalLink,
  FileText,
  FolderOpen,
  MapPin,
  Paperclip,
  Plus,
  Receipt,
  Trash2,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'
import { QUOTE_STATUS_BADGE, QUOTE_STATUS_LABEL, formatAmount } from '../features/devis/constants'
import type { QuoteStatus } from '../features/devis/constants'
import { DOSSIER_DOCUMENT_LABELS, deleteDossierDocument, getDossier } from '../features/dossiers/api'
import type { DossierDetail, DossierDocument, DossierVisit } from '../features/dossiers/api'
import { DossierDocumentModal } from '../features/dossiers/components/DossierDocumentModal'
import { exportDossierZip, saveBlob } from '../features/dossiers/zip'
import { useAuthStore } from '../features/auth/store'
import { INVOICE_STATUS_BADGE, INVOICE_STATUS_LABEL } from '../features/factures/constants'
import type { InvoiceStatus } from '../features/factures/constants'
import { INTERVENTION_STATUSES, STATUS_BADGE_CLASSES, formatEquipmentTypes } from '../shared/constants/interventions'
import type { InterventionStatus } from '../shared/constants/interventions'

const PHOTOS_STEP = 24

function formatDate(d: string | null | undefined): string {
  if (!d) return '—'
  try {
    return format(new Date(d), 'd MMM yyyy', { locale: fr })
  } catch {
    return d
  }
}

function formatSize(bytes: number | null): string | null {
  if (!bytes) return null
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} Mo` : `${Math.max(1, Math.round(bytes / 1024))} Ko`
}

/** Conformité d'une visite, telle qu'enregistrée à la finalisation du rapport */
function visitResult(v: DossierVisit): { label: string; cls: string } | null {
  if (!v.report?.completed_at) {
    return v.intervention.status === 'terminee' ? { label: 'Historique importé, sans rapport Firovia', cls: 'b-gry' } : null
  }
  if (v.report.is_conform === true) return { label: 'Conforme', cls: 'b-grn' }
  if (v.report.is_conform === false) {
    const n = v.report.anomaly_count ?? 0
    return { label: `Non conforme${n > 0 ? ` · ${n} anomalie${n > 1 ? 's' : ''}` : ''}`, cls: 'b-red' }
  }
  return { label: 'Incomplet', cls: 'b-org' }
}

function Section({ icon, title, count, action, children }: { icon: ReactNode; title: string; count: number; action?: ReactNode; children: ReactNode }) {
  return (
    <div className="card" style={{ marginBottom: '1rem' }}>
      <div className="card-top">
        <span className="card-title" style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          {icon}
          {title}
          <span className="text-ink-3 text-xs font-light">({count})</span>
        </span>
        {action}
      </div>
      {children}
    </div>
  )
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="text-ink-3 text-sm font-light" style={{ margin: '.2rem 0 .4rem' }}>{children}</p>
}

/** Dossier d'un chantier : sites, visites et rapports, devis, factures, documents, photos */
export function DossierPage() {
  const { number: rawNumber } = useParams<{ number: string }>()
  const number = rawNumber ?? ''
  const [dossier, setDossier] = useState<DossierDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [docOpen, setDocOpen] = useState(false)
  const [flash, setFlash] = useState<string | null>(null)
  const [photoLimit, setPhotoLimit] = useState(PHOTOS_STEP)
  const orgName = useAuthStore((s) => s.profile?.organizations?.name ?? '')
  const [zipLabel, setZipLabel] = useState<string | null>(null)

  async function handleZip() {
    if (!dossier) return
    setZipLabel('Préparation…')
    try {
      const res = await exportDossierZip(dossier, orgName, (label, done, total) =>
        setZipLabel(total > 1 ? `${label} ${done}/${total}` : label))
      saveBlob(res.blob, res.filename)
      setFlash(`Dossier téléchargé : ${res.fileCount} pièce${res.fileCount > 1 ? 's' : ''}${res.failed ? `, ${res.failed} indisponible${res.failed > 1 ? 's' : ''}` : ''}.`)
      setTimeout(() => setFlash(null), 4000)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur inconnue')
    } finally {
      setZipLabel(null)
    }
  }

  async function load() {
    try {
      const d = await getDossier(number)
      setDossier(d)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur inconnue')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    let alive = true
    getDossier(number)
      .then((d) => { if (alive) { setDossier(d); setError(null) } })
      .catch((e) => { if (alive) setError(e instanceof Error ? e.message : 'Erreur inconnue') })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [number])

  async function handleDelete(doc: DossierDocument) {
    if (!window.confirm(`Retirer « ${doc.title} » du dossier ?\n\nLe fichier sera supprimé.`)) return
    try {
      await deleteDossierDocument(doc)
      setFlash('Document retiré du dossier.')
      setTimeout(() => setFlash(null), 3000)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur inconnue')
    }
  }

  if (loading) return <p className="text-ink-2 text-sm font-light">Chargement du dossier…</p>

  if (error || !dossier) {
    return (
      <div className="card">
        <p className="text-red text-sm">Erreur : {error ?? 'dossier introuvable'}</p>
        <Link to="/dossiers" className="btn-sm" style={{ marginTop: '1rem', display: 'inline-block' }}>← Dossiers</Link>
      </div>
    )
  }

  const { sites, visits, quotes, invoices, documents, photos } = dossier
  const unitTotal = sites.reduce((n, s) => n + s.unitCount, 0)
  const clientLabel = dossier.clients.map((c) => c.name).join(', ')
  const lastVisit = visits.find((v) => v.intervention.status === 'terminee')
  const nextVisit = [...visits].reverse().find((v) => v.intervention.status !== 'terminee' && v.intervention.scheduled_date)
  const isEmpty = sites.length === 0 && visits.length === 0 && quotes.length === 0 && invoices.length === 0 && documents.length === 0

  return (
    <>
      <div className="dash-top">
        <div>
          <div className="dash-title" style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
            <FolderOpen size={22} strokeWidth={2} />
            Dossier {dossier.number}
          </div>
          <div className="dash-sub">
            {dossier.years.length > 0 && `${dossier.years.join(', ')} · `}
            {clientLabel || 'Client non renseigné'}
            {sites.length > 0 && ` · ${sites.length} site${sites.length > 1 ? 's' : ''} · ${unitTotal} équipement${unitTotal > 1 ? 's' : ''}`}
          </div>
          {dossier.otherYears.length > 0 && (
            <div className="text-ink-3 text-xs" style={{ marginTop: 6 }}>
              Autres années du chantier :{' '}
              {dossier.otherYears.map((o, idx) => (
                <span key={o.number}>
                  {idx > 0 && ' · '}
                  <Link to={`/dossiers/${encodeURIComponent(o.number)}`}>
                    {o.years.length > 0 ? `${o.years.join(', ')} : ` : 'en cours : '}{o.number}
                  </Link>
                </span>
              ))}
            </div>
          )}
        </div>
        <div className="dash-acts">
          <button type="button" className="btn-sm acc" onClick={() => setDocOpen(true)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <Plus size={14} /> Ajouter un document
          </button>
          <button
            type="button"
            className="btn-sm"
            onClick={() => void handleZip()}
            disabled={!!zipLabel}
            title="Tout le dossier en un fichier : sommaire, rapports, devis, factures, documents et photos"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            <Download size={14} /> {zipLabel ?? 'Télécharger (ZIP)'}
          </button>
          <Link to="/dossiers" className="btn-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <ArrowLeft size={14} /> Dossiers
          </Link>
        </div>
      </div>

      {flash && <p className="text-grn text-sm" style={{ margin: '0 0 1rem' }}>{flash}</p>}

      {isEmpty && (
        <div className="card" style={{ marginBottom: '1rem' }}>
          <p className="text-ink-2 text-sm font-light" style={{ margin: 0 }}>
            Aucune visite ni aucun site ne porte ce numéro. Pour rattacher une visite : Planning, ouvre la visite et saisis son N° de dossier.
          </p>
        </div>
      )}

      {/* Repères : dernière visite, prochaine visite, devis et factures */}
      {!isEmpty && (
        <div className="dossier-kpis">
          <div className="dossier-kpi">
            <span>Dernière visite</span>
            <strong>{lastVisit ? formatDate(lastVisit.intervention.scheduled_date ?? lastVisit.intervention.created_at) : '—'}</strong>
          </div>
          <div className="dossier-kpi">
            <span>Prochaine visite</span>
            <strong>{nextVisit ? formatDate(nextVisit.intervention.scheduled_date) : 'À planifier'}</strong>
          </div>
          <div className="dossier-kpi">
            <span>Devis</span>
            <strong>{quotes.length}</strong>
          </div>
          <div className="dossier-kpi">
            <span>Facturé TTC</span>
            <strong>{formatAmount(invoices.filter((i) => i.status !== 'cancelled' && i.status !== 'draft').reduce((n, i) => n + Number(i.total_ttc ?? 0), 0))}</strong>
          </div>
        </div>
      )}

      {sites.length > 0 && (
        <Section icon={<MapPin size={14} strokeWidth={1.8} />} title="Sites" count={sites.length}>
          <div className="archive-list">
            {sites.map((s) => (
              <div key={s.id} className="archive-row b-acc">
                <div className="archive-icon b-acc"><MapPin size={14} strokeWidth={2} /></div>
                <div className="archive-main">
                  <div className="archive-title"><strong>{s.name}</strong></div>
                  <div className="archive-meta">
                    {[s.address, [s.postal_code, s.city].filter(Boolean).join(' ')].filter(Boolean).join(', ') || 'Adresse non renseignée'}
                    {' · '}{s.unitCount} équipement{s.unitCount > 1 ? 's' : ''}
                    {s.contact_name && ` · ${s.contact_name}`}
                    {s.contact_phone && ` · ${s.contact_phone}`}
                  </div>
                </div>
                <div className="archive-actions">
                  <Link to={`/equipements?site=${s.id}`} className="btn-sm subtle" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    Équipements
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </Section>
      )}

      <Section icon={<ClipboardCheck size={14} strokeWidth={1.8} />} title="Visites et rapports" count={visits.length}>
        {visits.length === 0 ? (
          <Empty>Aucune visite. Planifie la prochaine depuis le Planning : choisis le site et saisis ce N° de dossier.</Empty>
        ) : (
          <div className="archive-list">
            {visits.map((v) => {
              const i = v.intervention
              const result = visitResult(v)
              const status = i.status as InterventionStatus
              return (
                <div key={i.id} className={`archive-row ${i.status === 'terminee' ? 'b-grn' : 'b-acc'}`}>
                  <div className={`archive-icon ${i.status === 'terminee' ? 'b-grn' : 'b-acc'}`}><ClipboardCheck size={14} strokeWidth={2} /></div>
                  <div className="archive-main">
                    <div className="archive-title">
                      <strong>{i.reference}</strong>
                      {i.site_name && <span className="archive-light"> — {i.site_name}</span>}
                      {' '}<span className={`badge ${STATUS_BADGE_CLASSES[status] ?? 'b-gry'}`}>{INTERVENTION_STATUSES[status] ?? i.status}</span>
                    </div>
                    <div className="archive-meta">
                      {formatDate(i.scheduled_date ?? i.created_at)}
                      {' · '}{formatEquipmentTypes(i.equipment_types)}
                      {i.technician_name && ` · ${i.technician_name}`}
                      {result && <> · <span className={`badge ${result.cls}`}>{result.label}</span></>}
                    </div>
                  </div>
                  <div className="archive-actions">
                    {v.report?.pdf_url && (
                      <a href={v.report.pdf_url} target="_blank" rel="noreferrer" className="btn-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        <Download size={11} strokeWidth={2} /> PDF
                      </a>
                    )}
                    <Link to={`/rapports/${i.id}`} className="btn-sm subtle" title="Ouvrir le rapport" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      <ExternalLink size={11} strokeWidth={2} />
                    </Link>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </Section>

      <Section icon={<FileText size={14} strokeWidth={1.8} />} title="Devis" count={quotes.length}>
        {quotes.length === 0 ? (
          <Empty>Aucun devis. Un devis créé depuis une visite de ce dossier, ou portant son numéro, apparaît ici.</Empty>
        ) : (
          <div className="archive-list">
            {quotes.map((q) => {
              const st = q.status as QuoteStatus
              return (
                <div key={q.id} className="archive-row b-acc">
                  <div className="archive-icon b-acc"><FileText size={14} strokeWidth={2} /></div>
                  <div className="archive-main">
                    <div className="archive-title">
                      <strong>{q.reference}</strong>
                      {q.site_name && <span className="archive-light"> — {q.site_name}</span>}
                      {' '}<span className={`badge ${QUOTE_STATUS_BADGE[st] ?? 'b-gry'}`}>{QUOTE_STATUS_LABEL[st] ?? q.status}</span>
                    </div>
                    <div className="archive-meta">
                      {formatDate(q.issue_date)} · <strong>{formatAmount(Number(q.total_ttc ?? 0))}</strong> TTC
                    </div>
                  </div>
                  <div className="archive-actions">
                    {q.pdf_url && (
                      <a href={q.pdf_url} target="_blank" rel="noreferrer" className="btn-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        <Download size={11} strokeWidth={2} /> PDF
                      </a>
                    )}
                    <Link to={`/devis?open=${q.id}`} className="btn-sm subtle" title="Ouvrir le devis" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      <ExternalLink size={11} strokeWidth={2} />
                    </Link>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </Section>

      <Section icon={<Receipt size={14} strokeWidth={1.8} />} title="Factures" count={invoices.length}>
        {invoices.length === 0 ? (
          <Empty>Aucune facture. Les factures issues des devis ou des visites de ce dossier apparaissent ici.</Empty>
        ) : (
          <div className="archive-list">
            {invoices.map((inv) => {
              const st = inv.status as InvoiceStatus
              return (
                <div key={inv.id} className="archive-row b-org">
                  <div className="archive-icon b-org"><Receipt size={14} strokeWidth={2} /></div>
                  <div className="archive-main">
                    <div className="archive-title">
                      <strong>{inv.reference}</strong>
                      {inv.site_name && <span className="archive-light"> — {inv.site_name}</span>}
                      {' '}<span className={`badge ${INVOICE_STATUS_BADGE[st] ?? 'b-gry'}`}>{INVOICE_STATUS_LABEL[st] ?? inv.status}</span>
                    </div>
                    <div className="archive-meta">
                      {formatDate(inv.issue_date)} · <strong>{formatAmount(Number(inv.total_ttc ?? 0))}</strong> TTC
                      {Number(inv.amount_paid ?? 0) > 0 && ` · réglé ${formatAmount(Number(inv.amount_paid))}`}
                    </div>
                  </div>
                  <div className="archive-actions">
                    {inv.pdf_url && (
                      <a href={inv.pdf_url} target="_blank" rel="noreferrer" className="btn-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        <Download size={11} strokeWidth={2} /> PDF
                      </a>
                    )}
                    <Link to={`/factures?open=${inv.id}`} className="btn-sm subtle" title="Ouvrir la facture" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      <ExternalLink size={11} strokeWidth={2} />
                    </Link>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </Section>

      <Section
        icon={<Paperclip size={14} strokeWidth={1.8} />}
        title="Documents"
        count={documents.length}
        action={
          <button type="button" className="btn-sm" onClick={() => setDocOpen(true)} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <Plus size={12} /> Ajouter
          </button>
        }
      >
        {documents.length === 0 ? (
          <Empty>Bons de livraison, plans, PV, anciens rapports : ajoute ici tout ce qui concerne ce chantier.</Empty>
        ) : (
          <div className="archive-list">
            {documents.map((d) => (
              <div key={d.id} className="archive-row b-acc">
                <div className="archive-icon b-acc"><Paperclip size={14} strokeWidth={2} /></div>
                <div className="archive-main">
                  <div className="archive-title">
                    <span className="archive-kind">{DOSSIER_DOCUMENT_LABELS[d.kind] ?? 'Document'}</span>
                    <strong>{d.title}</strong>
                  </div>
                  <div className="archive-meta">
                    {formatDate(d.document_date ?? d.created_at)}
                    {d.file_name && ` · ${d.file_name}`}
                    {formatSize(d.size_bytes) && ` · ${formatSize(d.size_bytes)}`}
                    {d.created_by_name && ` · ajouté par ${d.created_by_name}`}
                  </div>
                </div>
                <div className="archive-actions">
                  <a href={d.file_url} target="_blank" rel="noreferrer" className="btn-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    <Download size={11} strokeWidth={2} /> Ouvrir
                  </a>
                  <button type="button" className="btn-sm subtle" onClick={() => void handleDelete(d)} title="Retirer du dossier" aria-label={`Retirer ${d.title}`}>
                    <Trash2 size={11} strokeWidth={2} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section icon={<Camera size={14} strokeWidth={1.8} />} title="Photos" count={photos.length}>
        {photos.length === 0 ? (
          <Empty>Les photos prises pendant les contrôles et sur les anomalies apparaîtront ici.</Empty>
        ) : (
          <>
            <div className="dossier-photos">
              {photos.slice(0, photoLimit).map((p, n) => (
                <a key={`${p.url}-${n}`} href={p.url} target="_blank" rel="noreferrer" className="dossier-photo" title={p.label}>
                  <img src={p.url} alt={p.label} loading="lazy" />
                  <span>{p.label}{p.reference ? ` · ${p.reference}` : ''} · {formatDate(p.date)}</span>
                </a>
              ))}
            </div>
            {photos.length > photoLimit && (
              <button type="button" className="btn-sm" style={{ marginTop: '.8rem' }} onClick={() => setPhotoLimit((n) => n + PHOTOS_STEP)}>
                Afficher plus ({photos.length - photoLimit})
              </button>
            )}
          </>
        )}
      </Section>

      <DossierDocumentModal
        open={docOpen}
        dossierNumber={dossier.number}
        onClose={() => setDocOpen(false)}
        onAdded={(count) => {
          setDocOpen(false)
          setFlash(`${count} document${count > 1 ? 's' : ''} ajouté${count > 1 ? 's' : ''} au dossier.`)
          setTimeout(() => setFlash(null), 3000)
          void load()
        }}
      />
    </>
  )
}

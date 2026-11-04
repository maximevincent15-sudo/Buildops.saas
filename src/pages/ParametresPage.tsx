import { Building2, CheckCircle2, Download, FileText, ListChecks, Save, Sparkles, Users } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { fetchProfile } from '../features/auth/api'
import { useAuthStore } from '../features/auth/store'
import { FixedCostsCard } from '../features/finance/components/FixedCostsCard'
import { useSubscription } from '../features/billing/hooks'
import { getInvoicingSettings, updateOrganizationName, upsertInvoicingSettings } from '../features/parametres/api'
import type { InvoicingSettings, UpsertInvoicingInput, VatMention } from '../features/parametres/api'
import { loadDemoData } from '../features/parametres/demoData'
import { LogoCard } from '../features/parametres/components/LogoCard'
import { ModulesCard } from '../features/parametres/components/ModulesCard'
import { NotificationsCard } from '../features/parametres/components/NotificationsCard'
import { ReportTemplateCard } from '../features/parametres/components/ReportTemplateCard'
import { NextNumberFields } from '../features/parametres/components/NextNumberFields'
import {
  fetchLegalIdentity,
  fillEmptyFields,
  getOrganizationSiret,
  intracomVatFromSiren,
  isLegalIdentityEmpty,
} from '../features/parametres/legalPrefill'
import { formatSiret, normalizeSiret } from '../features/auth/siret'

const EMPTY: UpsertInvoicingInput = {
  legal_form: null,
  siret: null,
  ape_code: null,
  vat_number: null,
  capital: null,
  legal_address: null,
  legal_city: null,
  legal_postal_code: null,
  legal_phone: null,
  legal_email: null,
  certification_rules: null,
  certification_number: null,
  iban: null,
  bic: null,
  bank_name: null,
  payment_terms: 'Paiement à 30 jours fin de mois',
  late_penalty_text:
    'Tout retard de paiement entraîne des pénalités au taux annuel de 3 fois le taux légal (loi LME 2008), ainsi qu\'une indemnité forfaitaire pour frais de recouvrement de 40 €.',
  no_discount_text: 'Pas d\'escompte pour paiement anticipé.',
  vat_mention: 'none',
  logo_url: null,
  quote_prefix: 'DEV',
  invoice_prefix: 'FAC',
}

/** Champs modifiables d'après les paramètres enregistrés */
function pickInvoicing(s: InvoicingSettings): UpsertInvoicingInput {
  return {
    legal_form: s.legal_form,
    siret: s.siret,
    ape_code: s.ape_code,
    vat_number: s.vat_number,
    capital: s.capital,
    legal_address: s.legal_address,
    legal_city: s.legal_city,
    legal_postal_code: s.legal_postal_code,
    legal_phone: s.legal_phone,
    legal_email: s.legal_email,
    certification_rules: s.certification_rules ?? null,
    certification_number: s.certification_number ?? null,
    iban: s.iban,
    bic: s.bic,
    bank_name: s.bank_name,
    payment_terms: s.payment_terms,
    late_penalty_text: s.late_penalty_text,
    no_discount_text: s.no_discount_text,
    vat_mention: s.vat_mention ?? 'none',
    logo_url: s.logo_url,
    quote_prefix: s.quote_prefix ?? 'DEV',
    invoice_prefix: s.invoice_prefix ?? 'FAC',
  }
}

export function ParametresPage() {
  const profile = useAuthStore((s) => s.profile)
  const setProfile = useAuthStore((s) => s.setProfile)
  const user = useAuthStore((s) => s.user)
  // Charges fixes : seulement utiles avec le pilotage (formules Pro et Entreprise)
  const { limits } = useSubscription()
  const [form, setForm] = useState<UpsertInvoicingInput>(EMPTY)
  const [orgName, setOrgName] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [flash, setFlash] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [demoLoading, setDemoLoading] = useState(false)
  const [demoStep, setDemoStep] = useState<{ label: string; current: number; total: number } | null>(null)
  const [exportStep, setExportStep] = useState<{ label: string; done: number; total: number } | null>(null)
  // Identité légale reprise de l'annuaire des entreprises (SIRET de l'inscription)
  const [prefillNotice, setPrefillNotice] = useState<string | null>(null)
  const [prefilling, setPrefilling] = useState(false)
  const isAdminUser = (profile?.user_role ?? 'admin') === 'admin'

  useEffect(() => {
    setOrgName(profile?.organizations?.name ?? '')
    if (!profile?.organization_id) return
    let alive = true
    const orgId = profile.organization_id
    void getInvoicingSettings(orgId)
      .then(async (s) => {
        if (!alive) return
        if (isAdminUser && (!s || isLegalIdentityEmpty(s))) {
          // Première ouverture : on reprend ce que l'annuaire sait du SIRET de l'inscription
          const siret = await getOrganizationSiret(orgId)
          const found = siret ? await fetchLegalIdentity(siret).catch(() => null) : null
          if (!alive) return
          if (found) {
            const base = s ? pickInvoicing(s) : EMPTY
            const { next, filled } = fillEmptyFields(base, found)
            setForm(next)
            if (filled.length > 0) {
              setPrefillNotice(`Repris de l'annuaire des entreprises (SIRET ${formatSiret(siret!)}) : vérifiez, complétez, puis cliquez sur « Enregistrer ».`)
            }
            return
          }
        }
        if (s) setForm(pickInvoicing(s))
      })
      .catch((e) => {
        if (alive) setError(e instanceof Error ? e.message : 'Erreur de chargement')
      })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [profile?.organization_id, isAdminUser])

  function setField<K extends keyof UpsertInvoicingInput>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value || null }))
  }

  async function handleLoadDemo() {
    if (!profile?.organization_id) return
    if (!window.confirm(
      'Charger les données de démo ?\n\n' +
      'Cela va créer dans votre organisation :\n' +
      '• 11 clients fictifs avec leurs sites et leur parc (~100 équipements)\n' +
      '• 4 techniciens, leurs habilitations et 2 véhicules\n' +
      '• 3 rapports signés avec PDF, dont un non conforme\n' +
      '• le planning de la semaine et des visites à planifier\n' +
      '• 3 devis, des factures sur 6 mois, notes de frais et heures sup\n\n' +
      'Les contacts ont des adresses @demo.firovia.fr : pour un envoi\n' +
      'de test, saisissez votre propre adresse dans la fenêtre d\'envoi.\n\n' +
      'Comptez 1 à 2 minutes. Continuer ?'
    )) return
    setDemoLoading(true)
    setError(null)
    setFlash(null)
    setDemoStep(null)
    try {
      await loadDemoData(profile.organization_id, profile.organizations?.name ?? '', (label, current, total) => {
        setDemoStep({ label, current, total })
      })
      setFlash('Données de démo chargées avec succès. Explorez les pages pour voir le résultat.')
      setTimeout(() => setFlash(null), 6000)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur lors du chargement de la démo')
    } finally {
      setDemoLoading(false)
      setDemoStep(null)
    }
  }

  async function handleExportAll() {
    setExportStep({ label: 'Préparation', done: 0, total: 1 })
    setError(null)
    setFlash(null)
    try {
      const [{ exportAllData }, { triggerDownload }] = await Promise.all([
        import('../features/export/fullExport'),
        import('../features/export/payrollExport'),
      ])
      const result = await exportAllData(orgName.trim() || profile?.organizations?.name || 'Firovia', (label, done, total) => {
        setExportStep({ label, done, total })
      })
      triggerDownload(result.blob, result.filename)
      setFlash(
        `Export terminé : ${result.rowCount} lignes de données et ${result.pdfCount} PDF.` +
        (result.pdfFailed > 0 ? ` ${result.pdfFailed} PDF n'ont pas pu être récupérés (liens indisponibles).` : ''),
      )
    } catch (e) {
      setError(e instanceof Error ? `Export impossible : ${e.message}` : "Erreur lors de l'export")
    } finally {
      setExportStep(null)
    }
  }

  /** Complète les champs vides de l'identité depuis l'annuaire (SIRET saisi, sinon celui de l'inscription) */
  async function handlePrefillFromSiret() {
    if (!profile?.organization_id) return
    setPrefilling(true)
    setError(null)
    try {
      const siret = normalizeSiret(form.siret ?? '').length === 14
        ? form.siret!
        : await getOrganizationSiret(profile.organization_id)
      if (!siret) {
        setError('Saisissez d\'abord le SIRET (14 chiffres).')
        return
      }
      const found = await fetchLegalIdentity(siret)
      if (!found) {
        setError('Ce SIRET est introuvable dans l\'annuaire des entreprises.')
        return
      }
      const { next, filled } = fillEmptyFields(form, found)
      setForm(next)
      setPrefillNotice(filled.length > 0
        ? `Repris de l'annuaire des entreprises (SIRET ${formatSiret(siret)}) : vérifiez, complétez, puis cliquez sur « Enregistrer ».`
        : 'Les champs étaient déjà remplis : rien n\'a été remplacé.')
    } catch {
      setError('Annuaire des entreprises injoignable, réessayez dans un instant.')
    } finally {
      setPrefilling(false)
    }
  }

  // N° de TVA calculé depuis le SIREN, proposé (jamais imposé) quand le champ est vide
  const vatSuggestion = !form.vat_number && form.vat_mention !== 'franchise'
    ? intracomVatFromSiren(form.siret ?? '')
    : null

  async function handleSave() {
    if (!profile?.organization_id) return
    if (!orgName.trim()) {
      setError('Le nom de l\'entreprise est requis.')
      return
    }
    setSaving(true)
    setError(null)
    setFlash(null)
    try {
      // 1. Update du nom de l'orga si modifié
      const previousName = profile.organizations?.name ?? ''
      if (orgName.trim() !== previousName) {
        await updateOrganizationName(profile.organization_id, orgName)
      }
      // 2. Upsert des paramètres de facturation
      await upsertInvoicingSettings(profile.organization_id, form)
      // 3. Refresh du profile pour propager le nouveau nom (sidebar, devis…)
      if (user?.id) {
        try {
          const fresh = await fetchProfile(user.id)
          setProfile(fresh)
        } catch { /* ignore */ }
      }
      setFlash('Paramètres enregistrés.')
      setTimeout(() => setFlash(null), 3000)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="card">
        <p className="text-ink-2 text-sm font-light">Chargement…</p>
      </div>
    )
  }

  return (
    <>
      <div className="dash-top">
        <div>
          <div className="dash-title">Paramètres de l'organisation</div>
          <div className="dash-sub">
            Ces informations apparaîtront automatiquement sur vos devis, factures et rapports.
            À renseigner une seule fois.
          </div>
        </div>
        <button
          type="button"
          className="mf prim"
          onClick={() => void handleSave()}
          disabled={saving}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
        >
          <Save size={14} strokeWidth={2} />
          {saving ? 'Enregistrement…' : 'Enregistrer'}
        </button>
      </div>

      {flash && (
        <p className="text-grn text-sm" style={{ marginBottom: '1rem', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <CheckCircle2 size={14} /> {flash}
        </p>
      )}
      {error && <p className="text-red text-sm" style={{ marginBottom: '1rem' }}>{error}</p>}

      {/* Bloc 0 : nom de l'entreprise */}
      <div className="card" style={{ marginBottom: '1rem' }}>
        <div className="card-top">
          <span className="card-title" style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <Building2 size={14} strokeWidth={1.8} />
            Nom de l'entreprise
          </span>
          <span className="text-ink-3 text-xs font-light">
            Apparaît dans la sidebar, sur les devis et les factures.
          </span>
        </div>
        <div className="fg">
          <label>Nom commercial / raison sociale</label>
          <input
            type="text"
            placeholder="Ex: Maintenance Incendie SARL"
            value={orgName}
            onChange={(e) => setOrgName(e.target.value)}
            maxLength={100}
          />
        </div>
      </div>

      {/* Bloc 1 : identité légale */}
      <div className="card" style={{ marginBottom: '1rem' }}>
        <div className="card-top">
          <span className="card-title" style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <Building2 size={14} strokeWidth={1.8} />
            Identité légale
          </span>
          {isAdminUser && (
            <button
              type="button"
              className="btn-sm"
              onClick={() => void handlePrefillFromSiret()}
              disabled={prefilling}
              title="Complète les champs vides avec l'annuaire public des entreprises"
            >
              {prefilling ? 'Recherche…' : 'Remplir depuis le SIRET'}
            </button>
          )}
        </div>
        {prefillNotice && (
          <p className="text-acc text-xs" style={{ margin: '0 0 .6rem', display: 'flex', alignItems: 'center', gap: 6 }}>
            <Sparkles size={12} strokeWidth={2} /> {prefillNotice}
          </p>
        )}
        <div className="mrow">
          <div className="fg">
            <label>Forme juridique</label>
            <input
              type="text"
              placeholder="SARL, SAS, EURL, EI…"
              value={form.legal_form ?? ''}
              onChange={(e) => setField('legal_form', e.target.value)}
            />
          </div>
          <div className="fg">
            <label>Capital social</label>
            <input
              type="text"
              placeholder="10 000 €"
              value={form.capital ?? ''}
              onChange={(e) => setField('capital', e.target.value)}
            />
          </div>
        </div>
        <div className="mrow">
          <div className="fg">
            <label>SIRET</label>
            <input
              type="text"
              placeholder="123 456 789 00012"
              value={form.siret ?? ''}
              onChange={(e) => setField('siret', e.target.value)}
              maxLength={20}
            />
          </div>
          <div className="fg">
            <label>Code APE / NAF</label>
            <input
              type="text"
              placeholder="4321A"
              value={form.ape_code ?? ''}
              onChange={(e) => setField('ape_code', e.target.value)}
              maxLength={10}
            />
          </div>
        </div>
        <div className="fg">
          <label>N° TVA intracommunautaire</label>
          <input
            type="text"
            placeholder="FR 12 345678901"
            value={form.vat_number ?? ''}
            onChange={(e) => setField('vat_number', e.target.value)}
            maxLength={20}
          />
          {vatSuggestion && (
            <span className="text-ink-3 text-xs font-light">
              Calculé depuis le SIREN : {vatSuggestion}{' '}
              <button type="button" className="link-btn" onClick={() => setField('vat_number', vatSuggestion)}>
                Utiliser
              </button>
              {' '}(seulement si l'entreprise est assujettie à la TVA)
            </span>
          )}
        </div>
        <div className="mrow">
          <div className="fg">
            <label>Certification <span className="text-ink-3 text-xs font-light">(si l'entreprise est certifiée)</span></label>
            <input
              type="text"
              placeholder="Ex : APSAD R4, R5"
              value={form.certification_rules ?? ''}
              onChange={(e) => setField('certification_rules', e.target.value)}
              maxLength={60}
            />
          </div>
          <div className="fg">
            <label>N° de certificat</label>
            <input
              type="text"
              placeholder="N° figurant sur votre certificat"
              value={form.certification_number ?? ''}
              onChange={(e) => setField('certification_number', e.target.value)}
              maxLength={40}
            />
          </div>
        </div>
        <span className="text-ink-3 text-xs font-light">
          Imprimés sur vos comptes rendus de vérification, tels que vous les saisissez.
        </span>
      </div>

      {/* Bloc 2 : adresse + contact */}
      <div className="card" style={{ marginBottom: '1rem' }}>
        <div className="card-top">
          <span className="card-title">Adresse du siège</span>
        </div>
        <div className="fg">
          <label>Adresse</label>
          <input
            type="text"
            placeholder="12 rue des Lilas"
            value={form.legal_address ?? ''}
            onChange={(e) => setField('legal_address', e.target.value)}
          />
        </div>
        <div className="mrow">
          <div className="fg">
            <label>Code postal</label>
            <input
              type="text"
              value={form.legal_postal_code ?? ''}
              onChange={(e) => setField('legal_postal_code', e.target.value)}
              maxLength={10}
            />
          </div>
          <div className="fg">
            <label>Ville</label>
            <input
              type="text"
              value={form.legal_city ?? ''}
              onChange={(e) => setField('legal_city', e.target.value)}
            />
          </div>
        </div>
        <div className="mrow">
          <div className="fg">
            <label>Téléphone</label>
            <input
              type="tel"
              value={form.legal_phone ?? ''}
              onChange={(e) => setField('legal_phone', e.target.value)}
            />
          </div>
          <div className="fg">
            <label>Email</label>
            <input
              type="email"
              value={form.legal_email ?? ''}
              onChange={(e) => setField('legal_email', e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* Logo imprimé sur les documents : administrateurs */}
      {(profile?.user_role ?? 'admin') === 'admin' && profile?.organization_id && (
        <LogoCard
          organizationId={profile.organization_id}
          logoUrl={form.logo_url}
          onChange={(url) => setForm((f) => ({ ...f, logo_url: url }))}
        />
      )}

      {/* Modules affichés (« mode terrain ») : administrateurs */}
      {(profile?.user_role ?? 'admin') === 'admin' && <ModulesCard />}

      {/* Notifications par mail (administrateurs) */}
      {(profile?.user_role ?? 'admin') === 'admin' && <NotificationsCard />}
      {(profile?.user_role ?? 'admin') === 'admin' && <ReportTemplateCard />}
      {(profile?.user_role ?? 'admin') === 'admin' && (
        <div className="card" style={{ marginBottom: '1rem' }}>
          <div className="card-top">
            <span className="card-title" style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <ListChecks size={14} strokeWidth={1.8} />
              Checklists de contrôle
            </span>
            <Link to="/parametres/checklists" className="btn-sm">Modifier les checklists</Link>
          </div>
          <p className="text-ink-3 text-sm font-light" style={{ margin: 0 }}>
            Adaptez les points vérifiés pendant les visites, type par type : renommez, ajoutez, retirez ou réordonnez des points,
            et créez plusieurs listes par appareil (par exemple désenfumage naturel ou mécanique).
          </p>
        </div>
      )}

      {/* Bloc 3 : coordonnées bancaires */}
      <div className="card" style={{ marginBottom: '1rem' }}>
        <div className="card-top">
          <span className="card-title">Coordonnées bancaires (pour factures)</span>
          <span className="text-ink-3 text-xs font-light">
            Apparaîtront sur les factures pour que les clients règlent par virement.
          </span>
        </div>
        <div className="mrow">
          <div className="fg">
            <label>IBAN</label>
            <input
              type="text"
              placeholder="FR76 1234 5678 9012 3456 7890 123"
              value={form.iban ?? ''}
              onChange={(e) => setField('iban', e.target.value)}
            />
          </div>
          <div className="fg">
            <label>BIC</label>
            <input
              type="text"
              placeholder="AGRIFRPPXXX"
              value={form.bic ?? ''}
              onChange={(e) => setField('bic', e.target.value)}
            />
          </div>
        </div>
        <div className="fg">
          <label>Banque</label>
          <input
            type="text"
            placeholder="Crédit Agricole"
            value={form.bank_name ?? ''}
            onChange={(e) => setField('bank_name', e.target.value)}
          />
        </div>
      </div>

      {/* Bloc préfixes */}
      <div className="card" style={{ marginBottom: '1rem' }}>
        <div className="card-top">
          <span className="card-title" style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <FileText size={14} strokeWidth={1.8} />
            Numérotation
          </span>
          <span className="text-ink-3 text-xs font-light">
            Personnalisez les préfixes de vos devis et factures.
          </span>
        </div>
        <div className="mrow">
          <div className="fg">
            <label>Préfixe Devis</label>
            <input
              type="text"
              placeholder="DEV"
              value={form.quote_prefix ?? ''}
              onChange={(e) => setField('quote_prefix', e.target.value.toUpperCase().slice(0, 6))}
              maxLength={6}
            />
            <span className="text-ink-3 text-xs font-light" style={{ marginTop: 4 }}>
              Aperçu : <strong>{(form.quote_prefix ?? 'DEV')}-2026-0001</strong>
            </span>
          </div>
          <div className="fg">
            <label>Préfixe Factures</label>
            <input
              type="text"
              placeholder="FAC"
              value={form.invoice_prefix ?? ''}
              onChange={(e) => setField('invoice_prefix', e.target.value.toUpperCase().slice(0, 6))}
              maxLength={6}
            />
            <span className="text-ink-3 text-xs font-light" style={{ marginTop: 4 }}>
              Aperçu : <strong>{(form.invoice_prefix ?? 'FAC')}-2026-0001</strong>
            </span>
          </div>
        </div>
        <p className="text-ink-3 text-xs font-light" style={{ marginTop: '.5rem' }}>
          ⚠️ Le changement s'applique aux <strong>nouveaux</strong> documents uniquement.
          Les références existantes ne sont pas renommées.
        </p>
        {(profile?.user_role ?? 'admin') === 'admin' && profile?.organization_id && (
          <NextNumberFields
            organizationId={profile.organization_id}
            quotePrefix={form.quote_prefix || 'DEV'}
            invoicePrefix={form.invoice_prefix || 'FAC'}
          />
        )}
      </div>

      {/* Bloc 4 : mentions légales devis/factures */}
      <div className="card">
        <div className="card-top">
          <span className="card-title" style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <FileText size={14} strokeWidth={1.8} />
            Mentions sur devis et factures
          </span>
        </div>
        <div className="fg">
          <label>Conditions de paiement</label>
          <input
            type="text"
            value={form.payment_terms ?? ''}
            onChange={(e) => setField('payment_terms', e.target.value)}
          />
        </div>
        <div className="fg">
          <label>Mentions de pénalités (loi LME)</label>
          <textarea
            value={form.late_penalty_text ?? ''}
            onChange={(e) => setField('late_penalty_text', e.target.value)}
            className="report-textarea"
            style={{ minHeight: 80 }}
          />
        </div>
        <div className="fg">
          <label>Mention escompte</label>
          <input
            type="text"
            value={form.no_discount_text ?? ''}
            onChange={(e) => setField('no_discount_text', e.target.value)}
          />
        </div>
        <div className="fg">
          <label>Mention TVA</label>
          <select
            value={form.vat_mention}
            onChange={(e) => setField('vat_mention', e.target.value as VatMention)}
          >
            <option value="none">Aucune mention</option>
            <option value="debits">Option pour le paiement de la taxe d'après les débits</option>
            <option value="franchise">TVA non applicable, art. 293 B du CGI (franchise en base)</option>
          </select>
          <span className="text-ink-3 text-xs font-light" style={{ marginTop: 4 }}>
            Imprimée en bas des factures, selon votre régime de TVA. En cas de doute, demandez à votre comptable.
          </span>
        </div>
      </div>

      {/* Bloc Équipe (admin uniquement) */}
      {(profile?.user_role ?? 'admin') === 'admin' && (
        <div className="card" style={{ marginTop: '1rem' }}>
          <div className="card-top">
            <span className="card-title" style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <Users size={14} strokeWidth={1.8} />
              Équipe
            </span>
          </div>
          <p className="text-ink-2 text-sm font-light" style={{ margin: '0 0 .8rem' }}>
            Invitez vos collaborateurs à rejoindre votre organisation Firovia. Chaque membre peut avoir
            son propre compte et son propre accès — utile pour que vos techniciens saisissent leurs
            notes de frais et heures sup directement.
          </p>
          <Link
            to="/equipe"
            className="mf out"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            <Users size={13} strokeWidth={2} />
            Gérer l'équipe
          </Link>
        </div>
      )}

      {/* Bloc Charges fixes (admin uniquement) : résultat estimé du tableau de bord */}
      {(profile?.user_role ?? 'admin') === 'admin' && profile?.organization_id && limits.proFeatures && (
        <FixedCostsCard organizationId={profile.organization_id} />
      )}

      {/* Export complet — réversibilité (art. 11 des CGV), admin only */}
      {(profile?.user_role ?? 'admin') === 'admin' && (
        <div className="card" style={{ marginTop: '1rem' }}>
          <div className="card-top">
            <span className="card-title" style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <Download size={14} strokeWidth={1.8} />
              Vos données vous appartiennent
            </span>
          </div>
          <p className="text-ink-2 text-sm font-light" style={{ margin: '0 0 .8rem' }}>
            Téléchargez à tout moment l'intégralité de vos données : un classeur Excel (clients, sites,
            équipements, interventions, rapports, devis, factures, frais…) et tous vos PDF, dans un seul
            fichier ZIP. Vous pouvez les réutiliser librement, dans un autre logiciel ou un tableur.
          </p>
          <button
            type="button"
            className="mf out"
            onClick={() => void handleExportAll()}
            disabled={exportStep !== null}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            <Download size={13} strokeWidth={2} />
            {exportStep ? 'Export en cours…' : 'Exporter toutes mes données'}
          </button>
          {exportStep && (
            <div style={{ marginTop: '1rem' }}>
              <div className="text-ink-2 text-xs font-light" style={{ marginBottom: 4 }}>
                {exportStep.label}{exportStep.total > 1 ? ` — ${exportStep.done} / ${exportStep.total}` : ''}
              </div>
              <div className="demo-progress">
                <div
                  className="demo-progress-fill"
                  style={{ width: `${exportStep.total ? (exportStep.done / exportStep.total) * 100 : 0}%` }}
                />
              </div>
            </div>
          )}
        </div>
      )}

      {/* Bloc Mode démo (tout en bas) */}
      <div className="card" style={{ marginTop: '1rem' }}>
        <div className="card-top">
          <span className="card-title" style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <Sparkles size={14} strokeWidth={1.8} />
            Charger des données de démo
          </span>
        </div>
        <p className="text-ink-2 text-sm font-light" style={{ margin: '0 0 .8rem' }}>
          Créez en un clic un compte complet et fictif : clients avec leurs sites et leur parc, techniciens,
          rapports signés, planning de la semaine, devis et factures. Pratique pour tester le SaaS
          rapidement ou pour une démo commerciale.
        </p>
        <p className="text-ink-3 text-xs font-light" style={{ margin: '0 0 .8rem' }}>
          Cette opération est <strong>additive</strong> (n'efface rien d'existant) et ne peut être lancée
          qu'une fois par compte.
        </p>
        <button
          type="button"
          className="mf out"
          onClick={() => void handleLoadDemo()}
          disabled={demoLoading}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
        >
          <Sparkles size={13} strokeWidth={2} />
          {demoLoading ? 'Chargement…' : 'Charger les données de démo'}
        </button>
        {demoStep && (
          <div style={{ marginTop: '1rem' }}>
            <div className="text-ink-2 text-xs font-light" style={{ marginBottom: 4 }}>
              {demoStep.current} / {demoStep.total} — {demoStep.label}
            </div>
            <div className="demo-progress">
              <div
                className="demo-progress-fill"
                style={{ width: `${(demoStep.current / demoStep.total) * 100}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Barre d'enregistrement toujours visible (la page compte une douzaine de cartes) */}
      <div
        style={{
          position: 'sticky', bottom: 12, zIndex: 5, marginTop: '1rem',
          display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '.8rem', flexWrap: 'wrap',
          padding: '.7rem 1rem', borderRadius: 14,
          background: 'var(--wht)', border: '1px solid var(--brd2)', boxShadow: '0 6px 20px rgba(28,33,48,.10)',
        }}
      >
        <span className="text-ink-3 text-xs font-light" style={{ marginRight: 'auto' }}>
          {error ? <span className="text-red">{error}</span> : flash ? <span className="text-grn">{flash}</span> : 'Nom, identité, adresse, banque, préfixes et mentions : enregistrés avec ce bouton.'}
        </span>
        <button
          type="button"
          className="mf prim"
          onClick={() => void handleSave()}
          disabled={saving}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
        >
          <Save size={14} strokeWidth={2} />
          {saving ? 'Enregistrement…' : 'Enregistrer'}
        </button>
      </div>
    </>
  )
}

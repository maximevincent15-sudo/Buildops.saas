import { Building2, CheckCircle2, FileText, Save, Sparkles, Users } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { fetchProfile } from '../features/auth/api'
import { useAuthStore } from '../features/auth/store'
import { getInvoicingSettings, updateOrganizationName, upsertInvoicingSettings } from '../features/parametres/api'
import type { UpsertInvoicingInput } from '../features/parametres/api'
import { loadDemoData } from '../features/parametres/demoData'

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
  iban: null,
  bic: null,
  bank_name: null,
  payment_terms: 'Paiement à 30 jours fin de mois',
  late_penalty_text:
    'Tout retard de paiement entraîne des pénalités au taux annuel de 3 fois le taux légal (loi LME 2008), ainsi qu\'une indemnité forfaitaire pour frais de recouvrement de 40 €.',
  no_discount_text: 'Pas d\'escompte pour paiement anticipé.',
  logo_url: null,
  quote_prefix: 'DEV',
  invoice_prefix: 'FAC',
}

export function ParametresPage() {
  const profile = useAuthStore((s) => s.profile)
  const setProfile = useAuthStore((s) => s.setProfile)
  const user = useAuthStore((s) => s.user)
  const [form, setForm] = useState<UpsertInvoicingInput>(EMPTY)
  const [orgName, setOrgName] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [flash, setFlash] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [demoLoading, setDemoLoading] = useState(false)
  const [demoStep, setDemoStep] = useState<{ label: string; current: number; total: number } | null>(null)

  useEffect(() => {
    setOrgName(profile?.organizations?.name ?? '')
    if (!profile?.organization_id) return
    let alive = true
    void getInvoicingSettings(profile.organization_id)
      .then((s) => {
        if (!alive) return
        if (s) {
          setForm({
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
            iban: s.iban,
            bic: s.bic,
            bank_name: s.bank_name,
            payment_terms: s.payment_terms,
            late_penalty_text: s.late_penalty_text,
            no_discount_text: s.no_discount_text,
            logo_url: s.logo_url,
            quote_prefix: s.quote_prefix ?? 'DEV',
            invoice_prefix: s.invoice_prefix ?? 'FAC',
          })
        }
      })
      .catch((e) => {
        if (alive) setError(e instanceof Error ? e.message : 'Erreur de chargement')
      })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [profile?.organization_id])

  function setField<K extends keyof UpsertInvoicingInput>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value || null }))
  }

  async function handleLoadDemo() {
    if (!profile?.organization_id) return
    if (!window.confirm(
      'Charger les données de démo ?\n\n' +
      'Cela va créer dans ton organisation :\n' +
      '• 6 clients fictifs\n' +
      '• 4 techniciens\n' +
      '• 2 véhicules\n' +
      '• 12 interventions (passées + à venir)\n' +
      '• 3 devis et 2 factures\n' +
      '• 3 notes de frais et 2 heures sup\n\n' +
      'Tout est marqué [DÉMO] dans les notes pour les retrouver.\n' +
      'Tu peux les supprimer manuellement après.\n\n' +
      'Continuer ?'
    )) return
    setDemoLoading(true)
    setError(null)
    setFlash(null)
    setDemoStep(null)
    try {
      await loadDemoData(profile.organization_id, (label, current, total) => {
        setDemoStep({ label, current, total })
      })
      setFlash('Données de démo chargées avec succès. Explore les pages pour voir le résultat.')
      setTimeout(() => setFlash(null), 6000)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur lors du chargement de la démo')
    } finally {
      setDemoLoading(false)
      setDemoStep(null)
    }
  }

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
            Ces informations apparaîtront automatiquement sur tes devis et factures.
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
        </div>
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
        </div>
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
            Personnalise les préfixes de tes devis et factures.
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
            Invite tes collaborateurs à rejoindre ton organisation BuildOps. Chaque membre peut avoir
            son propre compte et son propre accès — utile pour que tes techniciens saisissent leurs
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

      {/* Bloc Mode démo (tout en bas) */}
      <div className="card" style={{ marginTop: '1rem' }}>
        <div className="card-top">
          <span className="card-title" style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <Sparkles size={14} strokeWidth={1.8} />
            Charger des données de démo
          </span>
        </div>
        <p className="text-ink-2 text-sm font-light" style={{ margin: '0 0 .8rem' }}>
          Crée en un clic des clients, techniciens, véhicules, interventions, devis et factures fictifs
          dans ton organisation. Pratique pour tester le SaaS rapidement ou pour une démo commerciale.
        </p>
        <p className="text-ink-3 text-xs font-light" style={{ margin: '0 0 .8rem' }}>
          Tout est marqué <strong>[DÉMO]</strong> dans les notes — tu pourras les supprimer manuellement après.
          Cette opération est <strong>additive</strong> (n'efface rien d'existant).
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
    </>
  )
}

import { CheckCircle2, FileText } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useAuthStore } from '../../auth/store'
import { getInvoicingSettings, setReportTemplate } from '../api'
import type { ReportTemplate } from '../api'

const OPTIONS: Array<{ value: ReportTemplate; label: string; hint: string }> = [
  {
    value: 'standard',
    label: 'Rapport Firovia',
    hint: 'Tout sur la 1re page : résultat, points à traiter avec leur échéance, résumé par type d\'équipement et signatures. La liste des équipements et les photos en annexes.',
  },
  {
    value: 'classic',
    label: 'Compte rendu de vérification classique',
    hint: 'Conclusion générale à cocher, équipements secteur par secteur (en état de fonctionner ou non), annexe des observations et annexe des non-conformités.',
  },
]

/** Modèle du rapport PDF remis au client (administrateurs) */
export function ReportTemplateCard() {
  const organizationId = useAuthStore((s) => s.profile?.organization_id)
  const [template, setTemplate] = useState<ReportTemplate | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [flash, setFlash] = useState<string | null>(null)

  useEffect(() => {
    if (!organizationId) return
    let alive = true
    void getInvoicingSettings(organizationId)
      .then((s) => { if (alive) setTemplate(s?.report_template ?? 'standard') })
      .catch(() => { if (alive) setTemplate('standard') })
    return () => { alive = false }
  }, [organizationId])

  async function choose(value: ReportTemplate) {
    if (!organizationId || value === template) return
    setSaving(true)
    setError(null)
    try {
      await setReportTemplate(organizationId, value)
      setTemplate(value)
      setFlash('Modèle enregistré : il s\'applique aux prochains rapports finalisés.')
      setTimeout(() => setFlash(null), 3500)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Enregistrement impossible')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="card" style={{ marginBottom: '1rem' }}>
      <div className="card-top">
        <span className="card-title" style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          <FileText size={14} strokeWidth={1.8} />
          Modèle du rapport PDF
        </span>
        <span className="text-ink-3 text-xs font-light">Remis au client après chaque visite</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {OPTIONS.map((o) => (
          <label key={o.value} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: saving ? 'wait' : 'pointer' }}>
            <input
              type="radio"
              name="report-template"
              checked={template === o.value}
              disabled={saving || template === null}
              onChange={() => void choose(o.value)}
              style={{ marginTop: 3 }}
            />
            <span style={{ fontSize: 13.5, lineHeight: 1.4 }}>
              <strong>{o.label}</strong>
              <span className="text-ink-3" style={{ display: 'block', fontSize: 12 }}>{o.hint}</span>
            </span>
          </label>
        ))}
      </div>
      {flash && (
        <p className="text-grn text-sm" style={{ margin: '.8rem 0 0', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <CheckCircle2 size={14} /> {flash}
        </p>
      )}
      {error && <p className="text-red text-sm" style={{ margin: '.8rem 0 0' }}>{error}</p>}
    </div>
  )
}

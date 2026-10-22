import { Bell, CheckCircle2 } from 'lucide-react'
import { useState } from 'react'
import { useAuthStore } from '../../auth/store'
import { supabase } from '../../../shared/lib/supabase'

type SettingKey = 'notify_technicians' | 'notify_admins_reports' | 'auto_send_reports'

const SETTINGS: { key: SettingKey; label: string; hint: string; defaultOn: boolean }[] = [
  {
    key: 'notify_technicians',
    label: 'Prévenir le technicien de ses interventions',
    hint: 'Un mail avec la date, l\'heure, l\'adresse et les accès dès qu\'on lui attribue ou qu\'on déplace une intervention.',
    defaultOn: true,
  },
  {
    key: 'notify_admins_reports',
    label: 'Me prévenir quand un rapport est terminé',
    hint: 'Les administrateurs reçoivent un mail : résultat (conforme, anomalies), signature et lien vers le rapport.',
    defaultOn: true,
  },
  {
    key: 'auto_send_reports',
    label: 'Envoyer automatiquement le rapport au client',
    hint: 'À la finalisation, le PDF part aux destinataires « Rapports » de la fiche client, sans clic du technicien.',
    defaultOn: false,
  },
]

/** Notifications par mail de l'équipe et envoi automatique des rapports (administrateurs) */
export function NotificationsCard() {
  const profile = useAuthStore((s) => s.profile)
  const setProfile = useAuthStore((s) => s.setProfile)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [flash, setFlash] = useState<string | null>(null)

  const org = profile?.organizations
  const value = (k: SettingKey, defaultOn: boolean) => (org?.[k] ?? defaultOn) as boolean

  async function toggle(k: SettingKey, on: boolean) {
    if (!profile?.organization_id || !org) return
    setSaving(true)
    setError(null)
    try {
      const { error: err } = await supabase.from('organizations').update({ [k]: on }).eq('id', profile.organization_id)
      if (err) throw err
      setProfile({ ...profile, organizations: { ...org, [k]: on } })
      setFlash('Réglage enregistré.')
      setTimeout(() => setFlash(null), 2500)
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
          <Bell size={14} strokeWidth={1.8} />
          Notifications par mail
        </span>
        <span className="text-ink-3 text-xs font-light">Pour toute l'équipe</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {SETTINGS.map((s) => (
          <label key={s.key} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: saving ? 'wait' : 'pointer' }}>
            <input
              type="checkbox"
              checked={value(s.key, s.defaultOn)}
              disabled={saving}
              onChange={(e) => void toggle(s.key, e.target.checked)}
              style={{ marginTop: 3 }}
            />
            <span style={{ fontSize: 13.5, lineHeight: 1.4 }}>
              <strong>{s.label}</strong>
              <span className="text-ink-3" style={{ display: 'block', fontSize: 12 }}>{s.hint}</span>
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

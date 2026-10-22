import { CheckCircle2, Link2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { listOrgMemberAccounts, setTechnicianUser } from '../api'
import type { OrgMemberAccount } from '../api'
import type { Technician } from '../schemas'

type Props = {
  technician: Technician
  onLinked?: (userId: string | null) => void
}

const accountLabel = (a: OrgMemberAccount) =>
  [[a.first_name, a.last_name].filter(Boolean).join(' '), a.email].filter(Boolean).join(' — ') || 'Compte sans nom'

/**
 * Compte de connexion du technicien : relié, il voit « Ma journée » (ses
 * interventions) et reçoit les notifications de planning.
 */
export function TechnicianAccountLink({ technician, onLinked }: Props) {
  const [accounts, setAccounts] = useState<OrgMemberAccount[] | null>(null)
  const [userId, setUserId] = useState<string | null>(technician.user_id)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)

  useEffect(() => {
    let alive = true
    listOrgMemberAccounts()
      .then((list) => { if (alive) setAccounts(list) })
      .catch(() => { if (alive) setAccounts([]) })
    return () => { alive = false }
  }, [])

  async function change(next: string | null) {
    setSaving(true)
    setMessage(null)
    try {
      await setTechnicianUser(technician.id, next)
      setUserId(next)
      onLinked?.(next)
      setMessage({ ok: true, text: next ? 'Compte relié.' : 'Compte délié.' })
    } catch (e) {
      setMessage({ ok: false, text: e instanceof Error ? e.message : 'Liaison impossible.' })
    } finally {
      setSaving(false)
    }
  }

  const linked = accounts?.find((a) => a.id === userId) ?? null

  return (
    <div className="card-section">
      <div className="card-section-title" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
        <Link2 size={13} strokeWidth={2} /> Compte de connexion
      </div>
      {accounts === null ? (
        <p className="text-ink-3 text-sm font-light" style={{ margin: 0 }}>Chargement…</p>
      ) : (
        <>
          <p className="text-ink-2 text-sm font-light" style={{ margin: '0 0 .6rem', lineHeight: 1.5 }}>
            {linked
              ? <><CheckCircle2 size={13} style={{ verticalAlign: '-2px', color: 'var(--grn)' }} /> Relié à <strong>{accountLabel(linked)}</strong> : le technicien voit ses interventions dans « Ma journée ».</>
              : <>Pas encore de compte relié. Invitez le technicien depuis <Link to="/equipe">Paramètres → Équipe</Link>{technician.email ? <> avec l'adresse <strong>{technician.email}</strong> : son compte sera relié automatiquement</> : null}, ou choisissez son compte ci-dessous.</>}
          </p>
          <select value={userId ?? ''} disabled={saving} onChange={(e) => void change(e.target.value || null)}>
            <option value="">— Aucun compte —</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>{accountLabel(a)}</option>
            ))}
          </select>
          {message && (
            <span className={message.ok ? 'text-grn text-xs' : 'ferr on'} style={{ marginTop: 4, display: 'block' }}>{message.text}</span>
          )}
        </>
      )}
    </div>
  )
}

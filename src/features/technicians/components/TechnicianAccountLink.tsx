import { CheckCircle2, Copy, Link2, Mail, Send } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useAuthStore } from '../../auth/store'
import { buildInvitationMailto, buildInvitationUrl, createInvitation, listInvitations } from '../../equipe/api'
import type { Invitation } from '../../equipe/api'
import { listOrgMemberAccounts, setTechnicianEmail, setTechnicianUser } from '../api'
import type { OrgMemberAccount } from '../api'
import type { Technician } from '../schemas'

type Props = {
  technician: Technician
  onLinked?: (userId: string | null) => void
  /** Email enregistré sur la fiche à l'invitation (le formulaire ouvert doit le reprendre) */
  onEmailSaved?: (email: string) => void
}

const accountLabel = (a: OrgMemberAccount) =>
  [[a.first_name, a.last_name].filter(Boolean).join(' '), a.email].filter(Boolean).join(' — ') || 'Compte sans nom'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const frDate = (iso: string) => new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })

/**
 * Compte de connexion du technicien : relié, il voit « Ma journée » (ses
 * interventions) et reçoit les notifications de planning. L'invitation se
 * fait ici : le compte créé avec l'email de la fiche s'y relie tout seul.
 */
export function TechnicianAccountLink({ technician, onLinked, onEmailSaved }: Props) {
  const profile = useAuthStore((s) => s.profile)
  const [accounts, setAccounts] = useState<OrgMemberAccount[] | null>(null)
  const [pending, setPending] = useState<Invitation | null>(null)
  const [userId, setUserId] = useState<string | null>(technician.user_id)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)
  const [inviteEmail, setInviteEmail] = useState(technician.email ?? '')
  const [inviting, setInviting] = useState(false)

  useEffect(() => {
    let alive = true
    Promise.all([listOrgMemberAccounts(), listInvitations().catch(() => [] as Invitation[])])
      .then(([list, invitations]) => {
        if (!alive) return
        setAccounts(list)
        const mail = technician.email?.trim().toLowerCase()
        const now = Date.now()
        setPending(mail ? invitations.find((i) => i.email === mail && new Date(i.expires_at).getTime() > now) ?? null : null)
      })
      .catch(() => { if (alive) setAccounts([]) })
    return () => { alive = false }
  }, [technician.email])

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

  async function invite() {
    if (!profile?.organization_id) return
    const mail = inviteEmail.trim().toLowerCase()
    if (!EMAIL_RE.test(mail)) {
      setMessage({ ok: false, text: 'Saisissez l’email du technicien.' })
      return
    }
    setInviting(true)
    setMessage(null)
    try {
      // L'email de la fiche relie automatiquement le compte à sa première connexion
      if (mail !== technician.email?.trim().toLowerCase()) {
        await setTechnicianEmail(technician.id, mail)
        onEmailSaved?.(mail)
      }
      const inv = await createInvitation(profile.organization_id, mail, 'member')
      setPending(inv)
      onLinked?.(null)
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Invitation impossible.'
      setMessage({ ok: false, text: /duplicate|unique|already exists/i.test(msg) ? 'Cette adresse a déjà une invitation en attente (voir Paramètres → Équipe).' : msg })
    } finally {
      setInviting(false)
    }
  }

  async function copyLink(inv: Invitation) {
    try {
      await navigator.clipboard.writeText(buildInvitationUrl(inv.token))
      setMessage({ ok: true, text: 'Lien copié : collez-le dans un SMS ou un message au technicien.' })
    } catch {
      setMessage({ ok: false, text: 'Copie impossible, utilisez « Envoyer par email ».' })
    }
  }

  function sendByEmail(inv: Invitation) {
    window.location.href = buildInvitationMailto(
      inv,
      profile?.organizations?.name ?? 'notre équipe',
      `${profile?.first_name ?? ''} ${profile?.last_name ?? ''}`.trim(),
    )
  }

  const linked = accounts?.find((a) => a.id === userId) ?? null

  return (
    <div className="card-section">
      <div className="card-section-title" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
        <Link2 size={13} strokeWidth={2} /> Compte de connexion
      </div>
      {accounts === null ? (
        <p className="text-ink-3 text-sm font-light" style={{ margin: 0 }}>Chargement…</p>
      ) : linked ? (
        <p className="text-ink-2 text-sm font-light" style={{ margin: '0 0 .6rem', lineHeight: 1.5 }}>
          <CheckCircle2 size={13} style={{ verticalAlign: '-2px', color: 'var(--grn)' }} /> Relié à <strong>{accountLabel(linked)}</strong> : le technicien voit ses interventions dans « Ma journée ».
        </p>
      ) : pending ? (
        <div style={{ margin: '0 0 .8rem' }}>
          <p className="text-ink-2 text-sm font-light" style={{ margin: '0 0 .5rem', lineHeight: 1.5 }}>
            Invitation créée pour <strong>{pending.email}</strong>, valable jusqu’au {frDate(pending.expires_at)}. Dès qu’il crée son compte avec ce lien, il est relié à cette fiche et voit « Ma journée » sur son téléphone.
          </p>
          <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap' }}>
            <button type="button" className="btn-sm acc" onClick={() => sendByEmail(pending)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <Mail size={13} /> Envoyer par email
            </button>
            <button type="button" className="btn-sm" onClick={() => void copyLink(pending)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <Copy size={12} /> Copier le lien
            </button>
          </div>
        </div>
      ) : (
        <div style={{ margin: '0 0 .8rem' }}>
          <p className="text-ink-2 text-sm font-light" style={{ margin: '0 0 .5rem', lineHeight: 1.5 }}>
            Pas encore de compte. Invitez-le : il reçoit un lien pour créer son compte, relié à cette fiche, et voit « Ma journée » sur son téléphone.
          </p>
          <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
            <div className="fg" style={{ flex: '1 1 220px', margin: 0 }}>
              <input
                type="email"
                placeholder="email du technicien"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
              />
            </div>
            <button type="button" className="btn-sm acc" onClick={() => void invite()} disabled={inviting} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <Send size={13} /> {inviting ? 'Création…' : 'Inviter à se connecter'}
            </button>
          </div>
        </div>
      )}
      {accounts !== null && (
        <>
          {!linked && accounts.length > 0 && (
            <span className="text-ink-3 text-xs font-light" style={{ display: 'block', marginBottom: 4 }}>
              Il a déjà un compte ? Choisissez-le :
            </span>
          )}
          {(linked || accounts.length > 0) && (
            <div className="fg" style={{ margin: 0 }}>
              <select value={userId ?? ''} disabled={saving} onChange={(e) => void change(e.target.value || null)}>
                <option value="">— Aucun compte —</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>{accountLabel(a)}</option>
                ))}
              </select>
            </div>
          )}
        </>
      )}
      {message && (
        <span className={message.ok ? 'text-grn text-xs' : 'ferr on'} style={{ marginTop: 4, display: 'block' }}>{message.text}</span>
      )}
    </div>
  )
}

import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import {
  ArrowLeft,
  Bell,
  Check,
  Copy,
  Crown,
  Mail,
  Plus,
  Shield,
  Trash2,
  UserCircle,
  UserMinus,
  X,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import type { MouseEvent } from 'react'
import { Link } from 'react-router-dom'
import { useAuthStore } from '../features/auth/store'
import {
  buildInvitationUrl,
  cancelInvitation,
  createInvitation,
  deleteInvitation,
  listInvitations,
  listMembers,
  updateMemberRole,
} from '../features/equipe/api'
import type { Invitation, TeamMember, UserRole } from '../features/equipe/api'

function formatDate(d: string | null): string {
  if (!d) return '—'
  try {
    return format(new Date(d), 'd MMM yyyy', { locale: fr })
  } catch {
    return d
  }
}

const ROLE_ICON = { admin: Crown, member: UserCircle } as const
const ROLE_LABEL = { admin: 'Administrateur', member: 'Membre' } as const
const ROLE_DESC = {
  admin: 'Accès complet (devis, factures, paramètres, équipe…)',
  member: 'Accès standard (planning, rapports, frais — pas de facturation)',
} as const

export function EquipePage() {
  const profile = useAuthStore((s) => s.profile)
  const [members, setMembers] = useState<TeamMember[]>([])
  const [invitations, setInvitations] = useState<Invitation[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [flash, setFlash] = useState<string | null>(null)

  // Modal d'invitation
  const [inviteOpen, setInviteOpen] = useState(false)
  const [invEmail, setInvEmail] = useState('')
  const [invRole, setInvRole] = useState<UserRole>('member')
  const [invSubmitting, setInvSubmitting] = useState(false)
  const [invError, setInvError] = useState<string | null>(null)

  // Lien généré (affiché après création)
  const [generatedInvitation, setGeneratedInvitation] = useState<Invitation | null>(null)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const [m, i] = await Promise.all([listMembers(), listInvitations()])
      setMembers(m)
      setInvitations(i)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  async function handleInvite() {
    if (!profile?.organization_id) return
    if (!invEmail.trim()) {
      setInvError('Email requis.')
      return
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(invEmail.trim())) {
      setInvError('Email invalide.')
      return
    }
    setInvSubmitting(true)
    setInvError(null)
    try {
      const inv = await createInvitation(profile.organization_id, invEmail.trim(), invRole)
      setGeneratedInvitation(inv)
      setInvEmail('')
      setInvRole('member')
      void load()
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Erreur'
      // Détecte unique constraint (email déjà invité)
      if (/duplicate|unique|already exists/i.test(msg)) {
        setInvError('Cette adresse email a déjà une invitation en attente.')
      } else {
        setInvError(msg)
      }
    } finally {
      setInvSubmitting(false)
    }
  }

  function closeInviteModal() {
    setInviteOpen(false)
    setInvEmail('')
    setInvRole('member')
    setInvError(null)
    setGeneratedInvitation(null)
  }

  function handleBackdrop(e: MouseEvent<HTMLDivElement>) {
    if (e.target === e.currentTarget && !invSubmitting) closeInviteModal()
  }

  async function handleCopyLink(token: string) {
    const url = buildInvitationUrl(token)
    try {
      await navigator.clipboard.writeText(url)
      setFlash('Lien copié dans le presse-papier.')
      setTimeout(() => setFlash(null), 2500)
    } catch {
      // ignore
    }
  }

  function handleSendByEmail(invitation: Invitation) {
    const url = buildInvitationUrl(invitation.token)
    const orgName = profile?.organizations?.name ?? 'notre équipe'
    const subject = `Invitation à rejoindre ${orgName} sur BuildOps`
    const body =
      `Bonjour,\n\n` +
      `Tu es invité(e) à rejoindre l'équipe ${orgName} sur BuildOps en tant que ${ROLE_LABEL[invitation.role].toLowerCase()}.\n\n` +
      `Clique sur ce lien pour créer ton compte et rejoindre l'équipe :\n${url}\n\n` +
      `Le lien expire le ${formatDate(invitation.expires_at)}.\n\n` +
      `À bientôt,\n${profile?.first_name ?? ''} ${profile?.last_name ?? ''}`.trim()
    const params = new URLSearchParams()
    params.set('subject', subject)
    params.set('body', body)
    const qs = params.toString().replace(/\+/g, '%20')
    window.location.href = `mailto:${encodeURIComponent(invitation.email)}?${qs}`
  }

  async function handleCancel(id: string) {
    if (!window.confirm('Annuler cette invitation ?')) return
    try {
      await cancelInvitation(id)
      void load()
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Erreur')
    }
  }

  async function handleDeleteInvitation(id: string) {
    if (!window.confirm('Supprimer définitivement cette invitation ?')) return
    try {
      await deleteInvitation(id)
      void load()
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Erreur')
    }
  }

  async function handleChangeRole(memberId: string, newRole: UserRole, isCurrentUser: boolean) {
    if (isCurrentUser) {
      alert('Tu ne peux pas modifier ton propre rôle pour éviter de te bloquer.')
      return
    }
    if (!window.confirm(`Changer le rôle de ce membre en "${ROLE_LABEL[newRole]}" ?`)) return
    try {
      await updateMemberRole(memberId, newRole)
      void load()
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Erreur')
    }
  }

  const isAdmin = (profile?.user_role ?? 'admin') === 'admin'

  if (!isAdmin) {
    return (
      <div className="card" style={{ maxWidth: 560, margin: '2rem auto' }}>
        <div className="card-top">
          <span className="card-title">Accès restreint</span>
        </div>
        <p className="text-ink-2 text-sm font-light">
          Seuls les administrateurs peuvent gérer l'équipe.
        </p>
        <Link to="/dashboard" className="btn-sm" style={{ marginTop: '1rem', display: 'inline-block' }}>
          Retour au tableau de bord
        </Link>
      </div>
    )
  }

  return (
    <>
      <div className="dash-top">
        <div>
          <div className="dash-title">Équipe</div>
          <div className="dash-sub">
            Invite tes employés à rejoindre ton organisation BuildOps.
          </div>
        </div>
        <div className="dash-acts">
          <Link to="/parametres" className="btn-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <ArrowLeft size={14} /> Paramètres
          </Link>
          <button
            type="button"
            className="mf prim"
            onClick={() => setInviteOpen(true)}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            <Plus size={14} strokeWidth={2} />
            Inviter un membre
          </button>
        </div>
      </div>

      {flash && (
        <p className="text-grn text-sm" style={{ marginBottom: '1rem' }}>✅ {flash}</p>
      )}
      {error && <p className="text-red text-sm" style={{ marginBottom: '1rem' }}>Erreur : {error}</p>}

      {/* Invitations en attente */}
      {!loading && invitations.length > 0 && (
        <div className="card" style={{ marginBottom: '1rem' }}>
          <div className="card-top">
            <span className="card-title" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <Mail size={14} strokeWidth={1.8} /> Invitations en attente
            </span>
            <span className="text-ink-3 text-xs font-light">
              {invitations.length} en attente d'acceptation
            </span>
          </div>
          <div className="member-list">
            {invitations.map((inv) => (
              <div key={inv.id} className="member-row pending">
                <div className="member-icon">
                  <Mail size={14} strokeWidth={2} />
                </div>
                <div className="member-main">
                  <div className="member-name">{inv.email}</div>
                  <div className="member-meta">
                    {ROLE_LABEL[inv.role]} · invité le {formatDate(inv.created_at)} · expire le {formatDate(inv.expires_at)}
                  </div>
                </div>
                <div className="member-actions">
                  <button
                    type="button"
                    className="qa-btn"
                    onClick={() => handleSendByEmail(inv)}
                    title="Envoyer le lien par email"
                  >
                    <Bell size={13} strokeWidth={2} />
                  </button>
                  <button
                    type="button"
                    className="qa-btn"
                    onClick={() => void handleCopyLink(inv.token)}
                    title="Copier le lien d'invitation"
                  >
                    <Copy size={13} strokeWidth={2} />
                  </button>
                  <button
                    type="button"
                    className="qa-btn"
                    onClick={() => void handleCancel(inv.id)}
                    title="Annuler l'invitation"
                  >
                    <X size={13} strokeWidth={2.2} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Membres actifs */}
      <div className="card">
        <div className="card-top">
          <span className="card-title" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <Shield size={14} strokeWidth={1.8} /> Membres de l'équipe
          </span>
          <span className="text-ink-3 text-xs font-light">
            {members.length} membre{members.length > 1 ? 's' : ''}
          </span>
        </div>

        {loading && <p className="text-ink-2 text-sm font-light">Chargement…</p>}

        {!loading && members.length === 0 && (
          <p className="text-ink-3 text-sm font-light" style={{ margin: 0 }}>
            Aucun membre. Invite ton premier collaborateur ci-dessus.
          </p>
        )}

        {!loading && members.length > 0 && (
          <div className="member-list">
            {members.map((m) => {
              const Icon = ROLE_ICON[m.user_role]
              const fullName = `${m.first_name ?? ''} ${m.last_name ?? ''}`.trim() || '(Sans nom)'
              const isCurrentUser = m.id === profile?.id
              return (
                <div key={m.id} className="member-row">
                  <div className={`member-icon ${m.user_role === 'admin' ? 'admin' : 'member'}`}>
                    <Icon size={14} strokeWidth={2} />
                  </div>
                  <div className="member-main">
                    <div className="member-name">
                      {fullName}
                      {isCurrentUser && <span className="member-you"> · toi</span>}
                    </div>
                    <div className="member-meta">
                      {ROLE_LABEL[m.user_role]} · {ROLE_DESC[m.user_role]}
                    </div>
                  </div>
                  <div className="member-actions">
                    {!isCurrentUser && m.user_role === 'member' && (
                      <button
                        type="button"
                        className="btn-sm"
                        onClick={() => void handleChangeRole(m.id, 'admin', isCurrentUser)}
                        title="Promouvoir admin"
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
                      >
                        <Crown size={11} /> Admin
                      </button>
                    )}
                    {!isCurrentUser && m.user_role === 'admin' && members.filter((x) => x.user_role === 'admin').length > 1 && (
                      <button
                        type="button"
                        className="btn-sm"
                        onClick={() => void handleChangeRole(m.id, 'member', isCurrentUser)}
                        title="Rétrograder en membre"
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
                      >
                        <UserMinus size={11} /> Membre
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Modal invitation */}
      {inviteOpen && (
        <div className="overlay open" onClick={handleBackdrop}>
          <div className="modal" style={{ maxWidth: 540 }}>
            <div className="modal-head">
              <span className="modal-title">
                {generatedInvitation ? 'Invitation créée' : 'Inviter un membre'}
              </span>
              <button type="button" className="modal-x" onClick={closeInviteModal} aria-label="Fermer">×</button>
            </div>

            {!generatedInvitation ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <p className="text-ink-2 text-sm font-light" style={{ margin: 0 }}>
                  Génère un lien d'invitation à envoyer par email à ton collègue.
                  Il pourra créer son compte et rejoindre automatiquement ton organisation.
                </p>
                <div className="fg">
                  <label>Email du membre à inviter</label>
                  <input
                    type="email"
                    placeholder="thomas.moreau@entreprise.fr"
                    value={invEmail}
                    onChange={(e) => setInvEmail(e.target.value)}
                    autoFocus
                  />
                </div>
                <div className="fg">
                  <label>Rôle</label>
                  <div className="role-pills">
                    {(['member', 'admin'] as UserRole[]).map((r) => {
                      const Icon = ROLE_ICON[r]
                      return (
                        <button
                          type="button"
                          key={r}
                          className={`role-pill${invRole === r ? ' on' : ''}`}
                          onClick={() => setInvRole(r)}
                        >
                          <div className="role-pill-head">
                            <Icon size={14} strokeWidth={2} />
                            <strong>{ROLE_LABEL[r]}</strong>
                          </div>
                          <div className="role-pill-desc">{ROLE_DESC[r]}</div>
                        </button>
                      )
                    })}
                  </div>
                </div>
                {invError && <span className="ferr on">{invError}</span>}
                <div className="modal-foot">
                  <button type="button" className="mf out" onClick={closeInviteModal} disabled={invSubmitting}>
                    Annuler
                  </button>
                  <button
                    type="button"
                    className="mf prim"
                    onClick={() => void handleInvite()}
                    disabled={invSubmitting}
                  >
                    {invSubmitting ? 'Création…' : "Générer l'invitation"}
                  </button>
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <p className="text-grn text-sm" style={{ margin: 0, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <Check size={14} strokeWidth={2.5} /> Invitation pour <strong>{generatedInvitation.email}</strong> créée.
                </p>
                <div className="fg">
                  <label>Lien d'invitation</label>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <input
                      type="text"
                      value={buildInvitationUrl(generatedInvitation.token)}
                      readOnly
                      onClick={(e) => (e.target as HTMLInputElement).select()}
                    />
                    <button
                      type="button"
                      className="btn-sm"
                      onClick={() => void handleCopyLink(generatedInvitation.token)}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap' }}
                    >
                      <Copy size={12} /> Copier
                    </button>
                  </div>
                  <span className="text-ink-3 text-xs font-light" style={{ marginTop: 4 }}>
                    Le lien expire le {formatDate(generatedInvitation.expires_at)}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    className="mf prim"
                    onClick={() => handleSendByEmail(generatedInvitation)}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                  >
                    <Mail size={13} strokeWidth={2} /> Envoyer par email
                  </button>
                  <button
                    type="button"
                    className="mf out"
                    onClick={() => {
                      void handleDeleteInvitation(generatedInvitation.id)
                      closeInviteModal()
                    }}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                  >
                    <Trash2 size={13} strokeWidth={2} /> Supprimer
                  </button>
                  <button type="button" className="mf out" onClick={closeInviteModal} style={{ marginLeft: 'auto' }}>
                    Fermer
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}

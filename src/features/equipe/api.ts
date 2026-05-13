import { supabase } from '../../shared/lib/supabase'

export type UserRole = 'admin' | 'member'

export type TeamMember = {
  id: string
  first_name: string | null
  last_name: string | null
  user_role: UserRole
  email: string | null   // récupéré via auth.users (jointure)
}

export type Invitation = {
  id: string
  organization_id: string
  email: string
  role: UserRole
  token: string
  invited_by: string | null
  expires_at: string
  accepted_at: string | null
  cancelled_at: string | null
  created_at: string
}

// ─── Membres ─────────────────────────────────────────────────────────

export async function listMembers(): Promise<TeamMember[]> {
  // RLS filtre déjà par organization_id (current_user_organization_id())
  const { data, error } = await supabase
    .from('profiles')
    .select('id, first_name, last_name, user_role')
    .order('user_role', { ascending: true })
    .order('last_name', { ascending: true, nullsFirst: false })
  if (error) throw error
  // Note : on ne peut pas joindre auth.users depuis le client (sécurité Supabase).
  // L'email est rempli par le signup trigger dans profiles si besoin, sinon vide.
  return (data ?? []).map((m) => ({
    id: m.id as string,
    first_name: m.first_name as string | null,
    last_name: m.last_name as string | null,
    user_role: (m.user_role as UserRole) ?? 'admin',
    email: null,
  }))
}

export async function updateMemberRole(profileId: string, role: UserRole): Promise<void> {
  const { error } = await supabase
    .from('profiles')
    .update({ user_role: role })
    .eq('id', profileId)
  if (error) throw error
}

/**
 * Retire un membre de l'organisation (soft remove).
 *
 * Comportement :
 *  - Détache le profile de l'organisation (organization_id = NULL)
 *  - Le compte auth.users reste intact → l'utilisateur peut être ré-invité
 *  - Toutes ses données passées (interventions créées, rapports, etc.) restent
 *    liées à l'organisation (via organization_id sur ces tables) — pas de perte
 *    d'historique
 *  - L'ancien membre n'a plus accès au SaaS jusqu'à nouvelle invitation
 *
 * Utilise une RPC SECURITY DEFINER (migration 023) pour contourner les
 * politiques RLS qui empêchent l'update direct de organization_id.
 *
 * Checks de sécurité côté serveur :
 *  - L'appelant doit être admin de l'organisation
 *  - Le membre doit être dans la même organisation
 *  - Impossible de se retirer soi-même
 *  - Impossible de retirer le dernier admin
 */
export async function removeMemberFromOrganization(profileId: string): Promise<void> {
  const { data, error } = await supabase.rpc('remove_member_from_organization', {
    member_id: profileId,
  })

  // Erreur Supabase / PostgreSQL (fonction inexistante, droits, etc.)
  if (error) {
    console.error('[removeMemberFromOrganization] Supabase error:', error)
    const msg = error.message || error.details || error.hint || JSON.stringify(error)
    throw new Error(`Erreur base de données : ${msg}`)
  }

  // Erreur métier renvoyée par la fonction RPC
  if (data?.error) {
    const messages: Record<string, string> = {
      not_authenticated: 'Vous devez être connecté(e)',
      not_admin: "Seuls les administrateurs peuvent retirer un membre",
      cannot_remove_self: 'Vous ne pouvez pas vous retirer vous-même',
      member_not_found: 'Membre introuvable',
      not_same_org: "Ce membre n'appartient pas à votre organisation",
      last_admin: 'Impossible de retirer le dernier administrateur',
      caller_no_org: "Vous n'êtes rattaché à aucune organisation",
    }
    const errCode = data.error as string
    console.error('[removeMemberFromOrganization] Business error:', errCode)
    throw new Error(messages[errCode] ?? `Erreur : ${errCode}`)
  }
}

// ─── Invitations ─────────────────────────────────────────────────────

function generateToken(): string {
  // 32 caractères hex aléatoires (URL-safe)
  const arr = new Uint8Array(16)
  crypto.getRandomValues(arr)
  return Array.from(arr)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

export async function listInvitations(): Promise<Invitation[]> {
  const { data, error } = await supabase
    .from('organization_invitations')
    .select('*')
    .is('accepted_at', null)
    .is('cancelled_at', null)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as Invitation[]
}

export async function listAllInvitations(): Promise<Invitation[]> {
  const { data, error } = await supabase
    .from('organization_invitations')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(50)
  if (error) throw error
  return (data ?? []) as Invitation[]
}

export async function createInvitation(
  organizationId: string,
  email: string,
  role: UserRole,
): Promise<Invitation> {
  const token = generateToken()
  const { data: userData } = await supabase.auth.getUser()
  const { data, error } = await supabase
    .from('organization_invitations')
    .insert({
      organization_id: organizationId,
      email: email.trim().toLowerCase(),
      role,
      token,
      invited_by: userData.user?.id ?? null,
    })
    .select()
    .single()
  if (error) throw error
  return data as Invitation
}

export async function cancelInvitation(id: string): Promise<void> {
  const { error } = await supabase
    .from('organization_invitations')
    .update({ cancelled_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
}

export async function deleteInvitation(id: string): Promise<void> {
  const { error } = await supabase
    .from('organization_invitations')
    .delete()
    .eq('id', id)
  if (error) throw error
}

/**
 * Construit l'URL d'invitation à envoyer au destinataire.
 * Le format : <baseUrl>/auth?invite=<token>
 */
export function buildInvitationUrl(token: string): string {
  const base = window.location.origin
  return `${base}/auth?invite=${token}`
}

// ─── Acceptation / preview ───────────────────────────────────────────

export type InvitationPreview = {
  organization_name: string
  role: UserRole
  email: string
  expires_at: string
}

export async function getInvitationPreview(
  token: string,
): Promise<InvitationPreview | { error: string }> {
  const { data, error } = await supabase.rpc('get_invitation_preview', {
    invite_token: token,
  })
  if (error) throw error
  if (data?.error) return { error: data.error as string }
  return {
    organization_name: data.organization_name as string,
    role: data.role as UserRole,
    email: data.email as string,
    expires_at: data.expires_at as string,
  }
}

export async function acceptInvitation(
  token: string,
): Promise<{ success: true; organization_id: string; role: UserRole } | { error: string }> {
  const { data, error } = await supabase.rpc('accept_organization_invitation', {
    invite_token: token,
  })
  if (error) throw error
  if (data?.error) return { error: data.error as string }
  return {
    success: true,
    organization_id: data.organization_id as string,
    role: data.role as UserRole,
  }
}

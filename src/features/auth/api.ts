import { supabase } from '../../shared/lib/supabase'
import type { LoginInput, RegisterInput } from './schemas'

export type Profile = {
  id: string
  first_name: string
  last_name: string
  organization_id: string
  user_role?: 'admin' | 'member' | null
  organizations: { id: string; name: string } | null
}

export async function signIn({ email, password }: LoginInput) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) throw error
  return data
}

export async function signUp({ firstName, lastName, companyName, email, password }: RegisterInput) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        first_name: firstName,
        last_name: lastName,
        company_name: companyName,
      },
    },
  })
  if (error) throw error
  return data
}

export async function signOut() {
  const { error } = await supabase.auth.signOut()
  if (error) throw error
}

export async function fetchProfile(userId: string): Promise<Profile> {
  // On tente avec user_role (migration 021). Fallback si pas encore appliquée.
  let data: unknown = null
  let err: { message: string } | null = null
  const r1 = await supabase
    .from('profiles')
    .select('id, first_name, last_name, organization_id, user_role, organizations(id, name)')
    .eq('id', userId)
    .single()
  data = r1.data
  err = r1.error as { message: string } | null
  if (err && /user_role/i.test(err.message)) {
    const r2 = await supabase
      .from('profiles')
      .select('id, first_name, last_name, organization_id, organizations(id, name)')
      .eq('id', userId)
      .single()
    data = r2.data
    err = r2.error as { message: string } | null
  }
  if (err) throw err
  return data as Profile
}

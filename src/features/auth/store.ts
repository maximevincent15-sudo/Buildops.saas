import type { Session, User } from '@supabase/supabase-js'
import { create } from 'zustand'
import type { Profile } from './api'

type AuthState = {
  session: Session | null
  user: User | null
  profile: Profile | null
  loading: boolean
  setSession: (session: Session | null) => void
  setProfile: (profile: Profile | null) => void
}

export const useAuthStore = create<AuthState>((set) => ({
  session: null,
  user: null,
  profile: null,
  loading: true,
  setSession: (session) => set({ session, user: session?.user ?? null, loading: false }),
  setProfile: (profile) => set({ profile }),
}))

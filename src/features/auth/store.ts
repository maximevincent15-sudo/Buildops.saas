import type { Session, User } from '@supabase/supabase-js'
import { create } from 'zustand'

type AuthState = {
  session: Session | null
  user: User | null
  loading: boolean
  setSession: (session: Session | null) => void
}

export const useAuthStore = create<AuthState>((set) => ({
  session: null,
  user: null,
  loading: true,
  setSession: (session) => set({ session, user: session?.user ?? null, loading: false }),
}))

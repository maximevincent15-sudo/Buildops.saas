import { useEffect } from 'react'
import type { ReactNode } from 'react'
import { useAuthStore } from '../features/auth/store'
import { supabase } from '../shared/lib/supabase'

export function AuthProvider({ children }: { children: ReactNode }) {
  const setSession = useAuthStore((s) => s.setSession)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
    })

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
    })

    return () => subscription.subscription.unsubscribe()
  }, [setSession])

  return <>{children}</>
}

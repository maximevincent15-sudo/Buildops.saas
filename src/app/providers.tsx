import { useEffect } from 'react'
import type { ReactNode } from 'react'
import { fetchProfile } from '../features/auth/api'
import { useAuthStore } from '../features/auth/store'
import { setMonitoringUser } from '../shared/lib/monitoring'
import { supabase } from '../shared/lib/supabase'

export function AuthProvider({ children }: { children: ReactNode }) {
  const setSession = useAuthStore((s) => s.setSession)
  const setProfile = useAuthStore((s) => s.setProfile)

  useEffect(() => {
    async function loadProfileFor(userId: string) {
      try {
        const profile = await fetchProfile(userId)
        setProfile(profile)
        setMonitoringUser({ id: userId, organizationId: profile?.organization_id ?? null })
      } catch (err) {
        console.error('Erreur chargement du profil', err)
        setProfile(null)
      }
    }

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      if (data.session?.user) {
        void loadProfileFor(data.session.user.id)
      }
    })

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      if (session?.user) {
        void loadProfileFor(session.user.id)
      } else {
        setProfile(null)
        setMonitoringUser(null)
      }
    })

    return () => subscription.subscription.unsubscribe()
  }, [setSession, setProfile])

  return <>{children}</>
}

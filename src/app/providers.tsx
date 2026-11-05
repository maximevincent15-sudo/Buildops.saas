import { useEffect } from 'react'
import type { ReactNode } from 'react'
import { fetchProfile } from '../features/auth/api'
import { useAuthStore } from '../features/auth/store'
import { setMonitoringUser } from '../shared/lib/monitoring'
import { readStoredSession, supabase } from '../shared/lib/supabase'
import { clearUserCache, pruneResponses } from '../shared/lib/offline/db'
import { getOfflineUser, setOfflineUser } from '../shared/lib/offline/state'
import { refreshQueueCounts, scheduleSync } from '../shared/lib/offline/sync'

export function AuthProvider({ children }: { children: ReactNode }) {
  const setSession = useAuthStore((s) => s.setSession)
  const setProfile = useAuthStore((s) => s.setProfile)
  const setMyTechnicianId = useAuthStore((s) => s.setMyTechnicianId)

  useEffect(() => {
    async function loadProfileFor(userId: string) {
      try {
        const profile = await fetchProfile(userId)
        setProfile(profile)
        setMonitoringUser({ id: userId, organizationId: profile?.organization_id ?? null })
        // Fiche technicien du compte (reliée automatiquement si l'email correspond)
        const { data: techId } = await supabase.rpc('link_my_technician')
        setMyTechnicianId(typeof techId === 'string' ? techId : null)
      } catch (err) {
        console.error('Erreur chargement du profil', err)
        setProfile(null)
      }
    }

    /** Compte de la couche hors ligne (données gardées, file d'attente) */
    function attachOfflineAccount(userId: string) {
      if (getOfflineUser() === userId) return
      setOfflineUser(userId)
      void refreshQueueCounts()
      scheduleSync(2000)
    }

    // Ménage : données gardées depuis plus de 30 jours
    void pruneResponses(30 * 86_400_000).catch(() => {})

    supabase.auth.getSession().then(({ data, error }) => {
      // Sans réseau, une session expirée ne se rafraîchit pas : on garde la session de l'appareil
      const session = data.session ?? (error ? readStoredSession() : null)
      setSession(session)
      if (session?.user) {
        attachOfflineAccount(session.user.id)
        void loadProfileFor(session.user.id)
      }
    })

    const { data: subscription } = supabase.auth.onAuthStateChange((event, session) => {
      if (!session && event !== 'SIGNED_OUT') {
        // Session non rafraîchie faute de réseau : elle reste valable sur l'appareil
        const stored = readStoredSession()
        if (stored) return
      }
      setSession(session)
      if (session?.user) {
        attachOfflineAccount(session.user.id)
        void loadProfileFor(session.user.id)
      } else {
        // Déconnexion : les données gardées sur l'appareil sont effacées
        const previous = getOfflineUser()
        if (previous) void clearUserCache(previous).catch(() => {})
        setOfflineUser(null)
        setProfile(null)
        setMyTechnicianId(null)
        setMonitoringUser(null)
      }
    })

    return () => subscription.subscription.unsubscribe()
  }, [setSession, setProfile, setMyTechnicianId])

  return <>{children}</>
}

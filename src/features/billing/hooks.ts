import { useCallback, useEffect, useState } from 'react'
import { useAuthStore } from '../auth/store'
import { fetchSubscription } from './api'
import type { Subscription } from './schemas'
import { computeTrialDaysLeft, trialUrgency } from './constants'

export interface SubscriptionState {
  subscription: Subscription | null
  loading: boolean
  error: string | null
  reload: () => Promise<void>
  /** Nombre de jours de trial restants (null si pas en trial). */
  trialDaysLeft: number | null
  /** Statut d'urgence du bandeau. */
  urgency: 'safe' | 'warning' | 'urgent' | 'expired'
  /** True si l'user a un abonnement payant actif. */
  isActive: boolean
  /** True si l'user est en trial local (aucun paiement encore). */
  isTrialing: boolean
  /** True si l'accès doit être bloqué (trial expiré + rien de payant). */
  isBlocked: boolean
}

export function useSubscription(): SubscriptionState {
  const profile = useAuthStore((s) => s.profile)
  const [subscription, setSubscription] = useState<Subscription | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!profile?.organization_id) {
      setSubscription(null)
      return
    }
    setLoading(true)
    try {
      const sub = await fetchSubscription()
      setSubscription(sub)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur inconnue')
    } finally {
      setLoading(false)
    }
  }, [profile?.organization_id])

  useEffect(() => {
    void load()
  }, [load])

  const trialDaysLeft = computeTrialDaysLeft(subscription?.trial_ends_at ?? null)
  const status = subscription?.status
  const isTrialing = status === 'trialing'
  const isActive = status === 'active'
  const isBlocked = (isTrialing && (trialDaysLeft ?? 0) <= 0) ||
    status === 'canceled' ||
    status === 'unpaid' ||
    status === 'incomplete_expired'
  const urgency = isTrialing ? trialUrgency(trialDaysLeft) : 'safe'

  return {
    subscription,
    loading,
    error,
    reload: load,
    trialDaysLeft,
    urgency,
    isActive,
    isTrialing,
    isBlocked,
  }
}

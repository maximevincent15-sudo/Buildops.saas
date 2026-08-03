import { useCallback, useEffect, useRef, useState } from 'react'
import { signOut } from '../api'
import { useAuthStore } from '../store'

// Timeout d'inactivité en millisecondes (30 min).
const IDLE_TIMEOUT_MS = 30 * 60 * 1000

// On alerte l'utilisateur 60 s avant la déconnexion pour lui laisser
// une chance de rester connecté s'il est toujours devant l'écran.
const WARNING_BEFORE_MS = 60 * 1000

const ACTIVITY_EVENTS = ['mousedown', 'keydown', 'touchstart', 'scroll'] as const

/**
 * Déconnecte automatiquement l'utilisateur après 30 min d'inactivité.
 * Un compte à rebours de 60 s s'affiche avant la déconnexion, avec
 * un bouton "Rester connecté" pour éviter la coupure si l'utilisateur
 * est encore là.
 *
 * Pourquoi : défense en profondeur contre les sessions oubliées sur
 * un poste partagé ou un ordi non verrouillé.
 */
export function IdleLogout() {
  const session = useAuthStore((s) => s.session)
  const [warningVisible, setWarningVisible] = useState(false)
  const [secondsLeft, setSecondsLeft] = useState(60)
  const lastActivityRef = useRef<number>(Date.now())
  const idleTimerRef = useRef<number | null>(null)
  const warningTimerRef = useRef<number | null>(null)
  const countdownRef = useRef<number | null>(null)

  const clearTimers = useCallback(() => {
    if (idleTimerRef.current) window.clearTimeout(idleTimerRef.current)
    if (warningTimerRef.current) window.clearTimeout(warningTimerRef.current)
    if (countdownRef.current) window.clearInterval(countdownRef.current)
    idleTimerRef.current = null
    warningTimerRef.current = null
    countdownRef.current = null
  }, [])

  const doLogout = useCallback(async () => {
    clearTimers()
    setWarningVisible(false)
    try {
      await signOut()
    } catch (e) {
      console.warn('[idle-logout] signOut failed', e)
    }
    // La redirection est gérée par onAuthStateChange du provider + RequireAuth
  }, [clearTimers])

  const scheduleNext = useCallback(() => {
    clearTimers()
    // Étape 1 : programme l'affichage de la warning
    warningTimerRef.current = window.setTimeout(() => {
      setWarningVisible(true)
      setSecondsLeft(Math.floor(WARNING_BEFORE_MS / 1000))
      // Décompte visuel chaque seconde
      countdownRef.current = window.setInterval(() => {
        setSecondsLeft((s) => Math.max(0, s - 1))
      }, 1000)
    }, IDLE_TIMEOUT_MS - WARNING_BEFORE_MS)

    // Étape 2 : logout à la fin
    idleTimerRef.current = window.setTimeout(() => {
      void doLogout()
    }, IDLE_TIMEOUT_MS)
  }, [clearTimers, doLogout])

  const handleActivity = useCallback(() => {
    // Si la warning est visible, on ne "reset" pas via mouvement clavier/souris.
    // L'utilisateur DOIT cliquer explicitement "Rester connecté" pour rester.
    // Ça évite un mouvement de souris accidentel qui prolongerait la session.
    if (warningVisible) return
    lastActivityRef.current = Date.now()
    scheduleNext()
  }, [scheduleNext, warningVisible])

  const stayConnected = useCallback(() => {
    setWarningVisible(false)
    lastActivityRef.current = Date.now()
    scheduleNext()
  }, [scheduleNext])

  useEffect(() => {
    // Ne surveille que si l'utilisateur est connecté.
    if (!session) {
      clearTimers()
      setWarningVisible(false)
      return
    }

    scheduleNext()
    for (const evt of ACTIVITY_EVENTS) {
      window.addEventListener(evt, handleActivity, { passive: true })
    }

    return () => {
      clearTimers()
      for (const evt of ACTIVITY_EVENTS) {
        window.removeEventListener(evt, handleActivity)
      }
    }
  }, [session, handleActivity, scheduleNext, clearTimers])

  if (!warningVisible) return null

  return (
    <div
      role="alertdialog"
      aria-labelledby="idle-warning-title"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(28, 33, 48, 0.55)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
        padding: 16,
      }}
    >
      <div
        style={{
          background: '#fff',
          borderRadius: 12,
          padding: '1.8rem 2rem',
          maxWidth: 420,
          width: '100%',
          boxShadow: '0 24px 48px rgba(0,0,0,.25)',
        }}
      >
        <h2
          id="idle-warning-title"
          style={{
            margin: 0,
            fontSize: '1.2rem',
            fontWeight: 700,
            color: 'var(--ink, #1C2130)',
          }}
        >
          Vous êtes toujours là ?
        </h2>
        <p
          style={{
            margin: '.7rem 0 1.3rem',
            fontSize: '.9rem',
            color: 'var(--ink2, #5A6070)',
            lineHeight: 1.5,
          }}
        >
          Par sécurité, vous serez déconnecté dans{' '}
          <strong style={{ color: '#C0392B' }}>{secondsLeft} s</strong>{' '}
          suite à une période d'inactivité.
        </p>
        <div style={{ display: 'flex', gap: '.6rem', justifyContent: 'flex-end' }}>
          <button
            type="button"
            className="btn-sm"
            onClick={() => void doLogout()}
          >
            Se déconnecter
          </button>
          <button
            type="button"
            className="btn-sm acc"
            onClick={stayConnected}
            autoFocus
          >
            Rester connecté
          </button>
        </div>
      </div>
    </div>
  )
}

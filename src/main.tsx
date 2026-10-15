import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { AuthProvider } from './app/providers'
import App from './App.tsx'
import './index.css'
import { initMonitoring } from './shared/lib/monitoring'

// Suivi des erreurs en production (inactif sans VITE_SENTRY_DSN)
void initMonitoring()

// Après une mise en ligne, un onglet resté ouvert réclame d'anciens fichiers
// (ex. le PDF du contrat) qui n'existent plus : on recharge la page une fois
// pour récupérer la nouvelle version, au lieu d'afficher une erreur.
window.addEventListener('vite:preloadError', (event) => {
  const key = 'firovia-reload-after-deploy'
  let last = 0
  try { last = Number(sessionStorage.getItem(key) ?? 0) } catch { /* stockage indisponible */ }
  if (Date.now() - last < 15_000) return // déjà rechargé : on laisse l'erreur s'afficher
  try { sessionStorage.setItem(key, String(Date.now())) } catch { /* stockage indisponible */ }
  event.preventDefault()
  window.location.reload()
})

// Note : les polyfills Node.js (Buffer, process, etc.) requis par
// @react-pdf/renderer sont fournis par vite-plugin-node-polyfills
// (configuré dans vite.config.ts).

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
)

// Enregistrement du Service Worker pour la PWA (production uniquement)
// Pourquoi pas en dev : le SW interfère avec le HMR Vite et peut servir
// d'anciennes versions cachées.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((err) => {
      console.warn('Service Worker registration failed:', err)
    })
  })
}

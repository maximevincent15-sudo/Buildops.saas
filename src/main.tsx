import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { Buffer } from 'buffer'
import { AuthProvider } from './app/providers'
import App from './App.tsx'
import './index.css'

// Polyfill Buffer pour le navigateur — requis par @react-pdf/renderer
// qui dépend de cette API Node.js pour générer les PDF. Sans ce polyfill,
// "Buffer is not defined" plante la génération de tous les PDF (rapports,
// devis, factures).
if (typeof window !== 'undefined' && !window.Buffer) {
  // @ts-expect-error - Window n'a pas Buffer par défaut
  window.Buffer = Buffer
}
if (typeof globalThis !== 'undefined' && !globalThis.Buffer) {
  // @ts-expect-error - globalThis n'a pas Buffer par défaut
  globalThis.Buffer = Buffer
}

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

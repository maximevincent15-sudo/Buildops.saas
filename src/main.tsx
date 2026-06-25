import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { AuthProvider } from './app/providers'
import App from './App.tsx'
import './index.css'

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

import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useModuleEnabled } from '../modules'
import type { OptionalModule } from '../modules'

/** Page d'un module masqué (lien direct, favori) : retour au tableau de bord */
export function ModuleGate({ module, children }: { module: OptionalModule; children: ReactNode }) {
  const enabled = useModuleEnabled()
  return enabled(module) ? <>{children}</> : <Navigate to="/dashboard" replace />
}

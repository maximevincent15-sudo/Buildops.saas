import { createPortal } from 'react-dom'
import type { ReactNode } from 'react'

/**
 * Affiche une fenêtre directement dans la page (document.body), hors des
 * blocs qui la contiennent. Sur iPhone, une fenêtre restée dans un bloc
 * défilant (.card sur mobile) passait sous le bandeau et sous les blocs
 * suivants, et la page défilait derrière.
 */
export function ModalPortal({ children }: { children: ReactNode }) {
  if (typeof document === 'undefined') return <>{children}</>
  return createPortal(children, document.body)
}

import { Outlet } from 'react-router-dom'

// La page Auth a son propre layout plein écran (2 colonnes).
// PublicLayout reste un simple pass-through pour accueillir de
// futures pages publiques (forgot-password, confirm-email...).
export function PublicLayout() {
  return <Outlet />
}

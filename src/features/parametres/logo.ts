import { supabase } from '../../shared/lib/supabase'

/**
 * Logo de l'entreprise : fichier dans l'espace « org-logos » (dossier de
 * l'organisation, écriture réservée aux administrateurs) et adresse publique
 * rangée dans organization_invoicing_settings.logo_url.
 */
const BUCKET = 'org-logos'
export const LOGO_MAX_BYTES = 1024 * 1024
/** Formats lisibles par le générateur de PDF */
export const LOGO_TYPES = ['image/png', 'image/jpeg']

/** Chemin du fichier à partir de son adresse publique (null si ce n'est pas un logo Firovia) */
function pathFromUrl(url: string): string | null {
  const marker = `/storage/v1/object/public/${BUCKET}/`
  const i = url.indexOf(marker)
  return i >= 0 ? decodeURIComponent(url.slice(i + marker.length).split('?')[0]) : null
}

async function saveLogoUrl(organizationId: string, url: string | null): Promise<void> {
  const { error } = await supabase
    .from('organization_invoicing_settings')
    .upsert(
      { organization_id: organizationId, logo_url: url, updated_at: new Date().toISOString() },
      { onConflict: 'organization_id' },
    )
  if (error) throw error
}

/** L'ancien fichier est supprimé au mieux : un échec ne bloque pas le changement de logo */
async function removeLogoFile(url: string): Promise<void> {
  const path = pathFromUrl(url)
  if (path) await supabase.storage.from(BUCKET).remove([path])
}

export async function uploadOrganizationLogo(
  organizationId: string,
  file: File,
  previousUrl: string | null,
): Promise<string> {
  if (!LOGO_TYPES.includes(file.type)) throw new Error('Format accepté : PNG ou JPG.')
  if (file.size > LOGO_MAX_BYTES) throw new Error('Le logo doit faire 1 Mo maximum.')
  const ext = file.type === 'image/png' ? 'png' : 'jpg'
  // Nom unique à chaque envoi : pas de cache à vider, et l'ancien logo reste valable jusqu'au bout
  const path = `${organizationId}/logo-${Date.now()}.${ext}`
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    contentType: file.type,
    cacheControl: '31536000',
    upsert: false,
  })
  if (error) {
    throw new Error(/row-level security|unauthorized/i.test(error.message)
      ? 'Seul un administrateur peut changer le logo.'
      : error.message)
  }
  const url = supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl
  await saveLogoUrl(organizationId, url)
  if (previousUrl) await removeLogoFile(previousUrl).catch(() => undefined)
  return url
}

export async function removeOrganizationLogo(organizationId: string, currentUrl: string | null): Promise<void> {
  await saveLogoUrl(organizationId, null)
  if (currentUrl) await removeLogoFile(currentUrl).catch(() => undefined)
}

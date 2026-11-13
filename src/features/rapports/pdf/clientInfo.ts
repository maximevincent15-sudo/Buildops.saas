/** Coordonnées du client imprimées sur le rapport (fiche client relue à la création du PDF) */
export type ReportClientInfo = {
  name: string
  address: string | null
  phone: string | null
  email: string | null
  /** « SIRET 983 752 346 00012 » ou « SIREN 983 752 346 » */
  companyId: string | null
}

/** Lignes sous le nom du client : adresse (rue, puis code postal et ville), téléphone et mail, SIRET */
export function clientInfoLines(info: ReportClientInfo): string[] {
  return [
    ...(info.address ? info.address.split(/,\s*(?=\d{5}\b)/) : []),
    [info.phone, info.email].filter(Boolean).join(' · ') || null,
    info.companyId,
  ].filter((l): l is string => !!l)
}

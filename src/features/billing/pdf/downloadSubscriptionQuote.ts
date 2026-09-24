import { pdf } from '@react-pdf/renderer'
import { createElement } from 'react'
import type { DocumentProps } from '@react-pdf/renderer'
import type { ReactElement } from 'react'
import { supabase } from '../../../shared/lib/supabase'
import { getInvoicingSettings } from '../../parametres/api'
import type { BillingPeriod, PlanOffer } from '../schemas'
import { SubscriptionQuotePdf } from './SubscriptionQuotePdf'

/**
 * Génère et télécharge le devis d'abonnement pour l'organisation connectée.
 * Chargé à la demande (import dynamique) pour ne pas alourdir /abonnement.
 */
export async function downloadSubscriptionQuote(params: {
  offer: PlanOffer
  period: BillingPeriod
  organizationId: string
  organizationName: string
  contactName: string | null
  contactEmail: string | null
}): Promise<void> {
  const [{ data: org }, settings] = await Promise.all([
    supabase.from('organizations').select('siret').eq('id', params.organizationId).maybeSingle(),
    getInvoicingSettings(params.organizationId).catch(() => null),
  ])

  const address = [
    settings?.legal_address,
    [settings?.legal_postal_code, settings?.legal_city].filter(Boolean).join(' '),
  ].filter((x) => x && x.trim()).join(', ') || null

  const issuedAt = new Date()
  const validUntil = new Date(issuedAt.getTime() + 30 * 86400_000)
  const ymd = issuedAt.toISOString().slice(0, 10).replace(/-/g, '')
  const reference = `DEV-FIR-${ymd}-${params.organizationId.slice(0, 6).toUpperCase()}-${params.offer.plan === 'pro' ? 'P' : 'S'}${params.period === 'yearly' ? 'A' : 'M'}`

  const doc = createElement(SubscriptionQuotePdf, {
    data: {
      reference,
      issuedAt,
      validUntil,
      offer: params.offer,
      period: params.period,
      client: {
        name: params.organizationName,
        siret: (org as { siret?: string | null } | null)?.siret ?? settings?.siret ?? null,
        address,
        contactName: params.contactName,
        contactEmail: params.contactEmail,
      },
    },
  }) as unknown as ReactElement<DocumentProps>

  const blob = await pdf(doc).toBlob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `Devis-Firovia-${params.offer.label}-${params.period === 'yearly' ? 'annuel' : 'mensuel'}.pdf`
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

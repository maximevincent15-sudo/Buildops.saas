import { format } from 'date-fns'
import { fr } from 'date-fns/locale'

export type RelanceType = 'intervention' | 'devis' | 'facture' | 'general'

export const RELANCE_LABELS: Record<RelanceType, string> = {
  intervention: 'Confirmer un RDV',
  devis: 'Relancer un devis',
  facture: 'Relancer une facture',
  general: 'Message personnalisé',
}

export const RELANCE_ICONS: Record<RelanceType, string> = {
  intervention: '📅',
  devis: '📝',
  facture: '💶',
  general: '✉️',
}

/** Contexte commun à toutes les relances. */
export type RelanceContext = {
  clientName: string
  contactName?: string | null
  organizationName: string
  /** Date du RDV (intervention) au format ISO */
  scheduledDate?: string | null
  /** Heure du RDV (HH:mm) optionnelle */
  scheduledTime?: string | null
  /** Référence intervention / devis / facture */
  reference?: string | null
  /** Site / lieu d'intervention */
  siteName?: string | null
  address?: string | null
  /** Montant TTC (devis ou facture) en € */
  amount?: number | null
  /** Date d'émission devis ou facture (ISO) */
  issueDate?: string | null
  /** Échéance facture (ISO) */
  dueDate?: string | null
}

function greeting(ctx: RelanceContext): string {
  if (ctx.contactName) {
    // Bonjour M. Dupont → on garde ce qui est avant la virgule
    return `Bonjour ${ctx.contactName.trim()},`
  }
  return 'Bonjour,'
}

function signature(ctx: RelanceContext): string {
  return `Cordialement,\n${ctx.organizationName}`
}

function formatDateLong(iso: string | null | undefined): string {
  if (!iso) return ''
  try {
    return format(new Date(iso), 'd MMMM yyyy', { locale: fr })
  } catch {
    return iso
  }
}

function formatAmount(amount: number | null | undefined): string {
  if (amount === null || amount === undefined) return ''
  return amount.toLocaleString('fr-FR', {
    style: 'currency',
    currency: 'EUR',
  })
}

// ─── Templates ────────────────────────────────────────────────────────

export function buildInterventionConfirmation(ctx: RelanceContext): {
  subject: string
  body: string
} {
  const ref = ctx.reference ? ` ${ctx.reference}` : ''
  const dateLabel = ctx.scheduledDate ? formatDateLong(ctx.scheduledDate) : 'prochainement'
  const timeLabel = ctx.scheduledTime ? ` à ${ctx.scheduledTime}` : ''
  const lieu =
    ctx.siteName && ctx.address
      ? `${ctx.siteName} (${ctx.address})`
      : ctx.siteName || ctx.address || 'votre site'

  const subject = `Confirmation de RDV intervention${ref} — ${dateLabel}`
  const body =
    `${greeting(ctx)}\n\n` +
    `Je me permets de confirmer notre intervention prévue le ${dateLabel}${timeLabel} sur ${lieu}.\n\n` +
    `Merci de me prévenir si un changement intervient ou si l'accès au site nécessite une coordination particulière (gardien, badge, etc.).\n\n` +
    `Je reste à votre disposition pour toute question.\n\n` +
    `${signature(ctx)}`
  return { subject, body }
}

export function buildDevisRelance(ctx: RelanceContext): {
  subject: string
  body: string
} {
  const ref = ctx.reference ? ` ${ctx.reference}` : ''
  const issued = ctx.issueDate ? `émis le ${formatDateLong(ctx.issueDate)}` : 'que je vous ai transmis récemment'
  const amountLine = ctx.amount
    ? `\n\nMontant : ${formatAmount(ctx.amount)} TTC.`
    : ''

  const subject = `Devis${ref} — votre retour`
  const body =
    `${greeting(ctx)}\n\n` +
    `Je reviens vers vous concernant le devis${ref} ${issued}.${amountLine}\n\n` +
    `Avez-vous pu en prendre connaissance ? Je reste disponible pour échanger sur les points qui méritent éclaircissement, ` +
    `ou pour ajuster certaines lignes si besoin.\n\n` +
    `N'hésite pas à me revenir pour qu'on planifie ensemble.\n\n` +
    `${signature(ctx)}`
  return { subject, body }
}

export function buildFactureRelance(ctx: RelanceContext): {
  subject: string
  body: string
} {
  const ref = ctx.reference ? ` ${ctx.reference}` : ''
  const issued = ctx.issueDate ? formatDateLong(ctx.issueDate) : ''
  const due = ctx.dueDate ? formatDateLong(ctx.dueDate) : ''
  const amountLine = ctx.amount
    ? `\n\nMontant dû : ${formatAmount(ctx.amount)} TTC.`
    : ''

  const subject = `Relance facture${ref}${issued ? ` du ${issued}` : ''}`
  const body =
    `${greeting(ctx)}\n\n` +
    `Sauf erreur de notre part, la facture${ref}${issued ? ` émise le ${issued}` : ''}${due ? `, à échéance du ${due},` : ''} ` +
    `n'apparaît pas comme réglée dans nos comptes.${amountLine}\n\n` +
    `Pourriez-vous m'indiquer où en est ce règlement ? Si le paiement a été effectué récemment, ` +
    `merci de me transmettre le justificatif pour rapprochement.\n\n` +
    `Je reste à ta disposition pour tout échange.\n\n` +
    `${signature(ctx)}`
  return { subject, body }
}

export function buildGeneralMessage(ctx: RelanceContext): {
  subject: string
  body: string
} {
  const subject = `Message — ${ctx.organizationName}`
  const body =
    `${greeting(ctx)}\n\n` +
    `[Saisis ton message ici]\n\n` +
    `${signature(ctx)}`
  return { subject, body }
}

export function buildRelance(
  type: RelanceType,
  ctx: RelanceContext,
): { subject: string; body: string } {
  switch (type) {
    case 'intervention': return buildInterventionConfirmation(ctx)
    case 'devis': return buildDevisRelance(ctx)
    case 'facture': return buildFactureRelance(ctx)
    case 'general': return buildGeneralMessage(ctx)
  }
}

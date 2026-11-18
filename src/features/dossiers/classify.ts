import type { DossierDocumentKind } from './api'

/**
 * Classement automatique des documents importés : n° de dossier, type et
 * date, d'après le chemin (nom du ZIP ou du dossier), le nom du fichier et,
 * pour un PDF, le texte de ses premières pages.
 */

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

/** Tirets typographiques et espaces insécables ramenés à « - » et « » */
const clean = (s: string) => s.replace(/[\u2010-\u2015\u2212]/g, '-').replace(/[\u00a0\u202f]/g, ' ')

/** N° de dossier type « 26-10-035-M » (aussi « 26-10035-M ») : noms de fichiers, de ZIP, de dossiers */
const DOSSIER_STRICT_RE = /(?<!\d)(\d{2})-(\d{2})-?(\d{3})-([A-Z]{1,3})(?![A-Za-z0-9])/
/** Même format avec des espaces autour des tirets (texte des PDF : « 26 - 10 - 034 - M ») */
const DOSSIER_LOOSE_RE = /(?<!\d)(\d{2})\s*-\s*(\d{2})\s*-?\s*(\d{3})\s*-\s*([A-Z]{1,3})(?![A-Za-z0-9])/
/** Début de n° sans la lettre finale (« 26-10-034- COLLEGE… ») */
const DOSSIER_PARTIAL_RE = /(?<!\d)(\d{2})\s*-\s*(\d{2})\s*-?\s*(\d{3})(?!\d)/

/**
 * N° de dossier trouvé dans un texte : d'abord un numéro qui existe déjà dans
 * l'entreprise (quel que soit son format), sinon le format habituel.
 * `loose` : espaces tolérés autour des tirets (texte extrait d'un PDF).
 */
export function findDossierNumber(text: string, known: string[], loose = false): string | null {
  if (!text) return null
  const t = clean(text)
  const compact = t.replace(/\s*-\s*/g, '-')
  const byLength = [...known].sort((a, b) => b.length - a.length)
  for (const k of byLength) {
    if (k.length >= 5 && (t.includes(k) || (loose && compact.includes(k)))) return k
  }
  const m = (loose ? DOSSIER_LOOSE_RE : DOSSIER_STRICT_RE).exec(t)
  return m ? `${m[1]}-${m[2]}-${m[3]}-${m[4]}` : null
}

/** Début de n° de dossier (« 26-10-034 ») quand la lettre finale manque */
export function findPartialNumber(text: string): string | null {
  const m = DOSSIER_PARTIAL_RE.exec(clean(text))
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null
}

/**
 * N° du devis auquel se rattache un document : « Devis DE260905 », « AR CDE
 * 260905 », « BL 260905 », ou dans le texte « Selon devis n° DE260905 »,
 * « Bon de livraison : DE260905.00 ».
 */
export function findQuoteRef(name: string, text = ''): string | null {
  const m = /\bDE\s?(\d{6})/i.exec(name)
    ?? /\b(?:AR\s*CDE|BL)\s*(\d{6})(?!\d)/i.exec(name)
    ?? /devis\s*n\s*[°o]?\s*:?\s*DE\s?(\d{6})/i.exec(text)
    ?? /Bon de livraison\s*:\s*DE\s?(\d{6})/i.exec(text)
  return m ? m[1]! : null
}

/** D'où vient le n° de dossier proposé (affiché dans le tableau de vérification) */
export type DossierVia = 'dossier' | 'fichier' | 'pdf' | 'meme-zip' | 'meme-devis' | 'dossier-connu'

export const DOSSIER_VIA_LABELS: Record<DossierVia, string> = {
  dossier: 'n° lu dans le nom du ZIP ou du dossier',
  fichier: 'n° lu dans le nom du fichier',
  pdf: 'n° lu dans le PDF',
  'meme-zip': 'même ZIP que les autres documents du dossier',
  'meme-devis': 'même n° de devis qu\'un document du dossier',
  'dossier-connu': 'n° incomplet complété avec un dossier existant',
}

export type BatchEntry = { name: string; folder: string; text: string }
export type BatchResult = { dossier: string; via: DossierVia | null; suggestion: string | null }

/**
 * Classement d'un lot : chaque fichier reçoit son n° de dossier par la
 * méthode la plus sûre, puis les méthodes de groupe complètent les autres :
 * 1. nom du ZIP ou du dossier, nom du fichier, texte du PDF ;
 * 2. les fichiers d'un même ZIP ou dossier vont ensemble ;
 * 3. un AR, un BL… se rattache au dossier de son devis (même n° de devis) ;
 * 4. un n° incomplet (« 26-10-034- ») se complète s'il ne correspond qu'à un dossier.
 */
export function classifyBatch(entries: BatchEntry[], known: string[]): BatchResult[] {
  const res: BatchResult[] = entries.map((e) => {
    const f = findDossierNumber(e.folder, known)
    if (f) return { dossier: f, via: 'dossier', suggestion: null }
    const n = findDossierNumber(e.name, known)
    if (n) return { dossier: n, via: 'fichier', suggestion: null }
    const t = findDossierNumber(e.text, known, true)
    if (t) return { dossier: t, via: 'pdf', suggestion: null }
    return { dossier: '', via: null, suggestion: null }
  })

  // 2. Même ZIP / même dossier : le n° le plus fréquent du groupe, compatible
  //    avec le début de n° éventuellement lu dans le nom du dossier
  const groups = new Map<string, number[]>()
  entries.forEach((e, i) => { if (e.folder) groups.set(e.folder, [...(groups.get(e.folder) ?? []), i]) })
  for (const [folder, idx] of groups) {
    const partial = findPartialNumber(folder)
    const counts = new Map<string, number>()
    for (const i of idx) {
      const d = res[i]!.dossier
      if (d && (!partial || d.replace(/-?[A-Z]+$/, '').replace(/-/g, '') === partial.replace(/-/g, ''))) counts.set(d, (counts.get(d) ?? 0) + 1)
    }
    const best = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0]
    if (!best) continue
    for (const i of idx) if (!res[i]!.dossier) res[i] = { dossier: best, via: 'meme-zip', suggestion: null }
  }

  // 3. Même n° de devis qu'un document déjà classé
  const byQuote = new Map<string, string>()
  entries.forEach((e, i) => {
    const ref = findQuoteRef(e.name, e.text)
    if (ref && res[i]!.dossier && !byQuote.has(ref)) byQuote.set(ref, res[i]!.dossier)
  })
  entries.forEach((e, i) => {
    if (res[i]!.dossier) return
    const ref = findQuoteRef(e.name, e.text)
    const d = ref ? byQuote.get(ref) : undefined
    if (d) res[i] = { dossier: d, via: 'meme-devis', suggestion: null }
  })

  // 4. N° incomplet : complété s'il ne correspond qu'à un seul dossier connu ou du lot
  const all = Array.from(new Set([...known, ...res.map((r) => r.dossier).filter(Boolean)]))
  entries.forEach((e, i) => {
    if (res[i]!.dossier) return
    const partial = findPartialNumber(e.folder) ?? findPartialNumber(e.name)
    if (!partial) return
    const matches = all.filter((k) => k.startsWith(`${partial}-`))
    res[i] = matches.length === 1
      ? { dossier: matches[0]!, via: 'dossier-connu', suggestion: null }
      : { dossier: '', via: null, suggestion: `${partial}-` }
  })
  return res
}

/** Type proposé d'après le nom du fichier, puis le début du texte du document */
export function guessDocumentKind(name: string, text = ''): DossierDocumentKind {
  const n = norm(name)
  if (/conditions generales|\bcgv\b/.test(n)) return 'terms'
  if (/\bar\b.{0,4}\bcde\b|accuse de reception|\bar (de )?commande/.test(n)) return 'order_ack'
  if (/\bbl\b|bon de livraison|livraison|enlevement/.test(n)) return 'delivery_note'
  if (/\bcommande\b|bon de commande|\bbdc\b/.test(n)) return 'purchase_order'
  if (/\bdevis\b|^de\d{4,}/.test(n)) return 'quote'
  if (/\bfacture\b|\bfac-\d|\bavoir\b/.test(n)) return 'invoice'
  if (/\bpv\b|proces|attestation|certificat/.test(n)) return 'certificate'
  if (/rapport|compte rendu/.test(n)) return 'report'
  if (/\bplans?\b/.test(n)) return 'plan'
  if (/\.(jpe?g|png|webp|heic|heif)$/.test(n)) return 'photo'
  const t = norm(text.slice(0, 600))
  if (/conditions generales de vente/.test(t)) return 'terms'
  if (/accuse de reception/.test(t)) return 'order_ack'
  if (/bon de livraison|bon pour enlevement/.test(t)) return 'delivery_note'
  if (/bon de commande/.test(t)) return 'purchase_order'
  if (/\bdevis\b/.test(t)) return 'quote'
  if (/\bfacture\b/.test(t)) return 'invoice'
  if (/proces-verbal|\bpv-\d/.test(t)) return 'certificate'
  if (/rapport/.test(t)) return 'report'
  return 'other'
}

/** Titre lisible : sans extension, sans numéro technique final (« _127454 ») ni « (1) » */
export function titleFromFileName(name: string): string {
  return name
    .replace(/\.[^.]+$/, '')
    .replace(/\s*\(\d+\)\s*$/, '')
    .replace(/_\d{3,}$/, '')
    .replace(/_+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

const toIso = (d: string, mo: string, y: string): string | null => {
  const day = Number(d)
  const month = Number(mo)
  return day >= 1 && day <= 31 && month >= 1 && month <= 12
    ? `${y}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    : null
}

/**
 * Date du document : celle qui suit le mot « Date » (« Date : 22/10/2026 »,
 * ou en tête de tableau : « Date  Votre contact  Page(s)  23/10/2026 ») ;
 * sinon la plus récente du début du texte (une date plus ancienne est souvent
 * une référence, ex. « devis accepté le 13/06/2024 »).
 */
export function dateFromText(text: string): string | null {
  const flat = text.replace(/\s+/g, ' ')
  // Espaces tolérés autour des « / » : certains PDF découpent la date (« 04 / 11 /2026 »)
  const m = /\bDate\b[^\d]{0,60}?(\d{1,2})\s*\/\s*(\d{1,2})\s*\/\s*(\d{4})/.exec(flat)
  if (m) return toIso(m[1]!, m[2]!, m[3]!)
  const all = [...flat.slice(0, 2500).matchAll(/\b(\d{1,2})\s*\/\s*(\d{1,2})\s*\/\s*(20\d{2})\b/g)]
    .map((x) => toIso(x[1]!, x[2]!, x[3]!))
    .filter((x): x is string => !!x)
    .sort()
  return all.length > 0 ? all[all.length - 1]! : null
}

// ─── Lecture du texte d'un PDF (chargée à la demande) ────

type PdfLib = typeof import('pdfjs-dist')
let pdfLib: Promise<PdfLib> | null = null

function loadPdfLib(): Promise<PdfLib> {
  if (!pdfLib) {
    pdfLib = (async () => {
      const [lib, worker] = await Promise.all([import('pdfjs-dist'), import('pdfjs-dist/build/pdf.worker.min.mjs?url')])
      lib.GlobalWorkerOptions.workerSrc = worker.default
      return lib
    })()
    pdfLib.catch(() => { pdfLib = null })
  }
  return pdfLib
}

/** Texte des premières pages d'un PDF ; chaîne vide s'il ne se lit pas (scan, fichier protégé) */
export async function readPdfText(file: Blob, maxPages = 2): Promise<string> {
  try {
    const lib = await loadPdfLib()
    const doc = await lib.getDocument({ data: new Uint8Array(await file.arrayBuffer()), isEvalSupported: false }).promise
    let out = ''
    for (let p = 1; p <= Math.min(doc.numPages, maxPages); p++) {
      const page = await doc.getPage(p)
      const content = await page.getTextContent()
      out += content.items.map((it) => ('str' in it ? it.str : '')).join(' ') + '\n'
    }
    await doc.destroy()
    return out
  } catch {
    return ''
  }
}

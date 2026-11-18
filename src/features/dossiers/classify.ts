import type { DossierDocumentKind } from './api'

/**
 * Classement automatique des documents importés : n° de dossier, type et
 * date, d'après le chemin (nom du ZIP ou du dossier), le nom du fichier et,
 * pour un PDF, le texte de ses premières pages.
 */

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

/** N° de dossier type « 26-10-035-M » (aussi « 26-10035-M ») */
const DOSSIER_RE = /\b(\d{2})-(\d{2})-?(\d{3})-([A-Z]{1,3})\b/

/**
 * N° de dossier trouvé dans un texte : d'abord un numéro qui existe déjà dans
 * l'entreprise (quel que soit son format), sinon le format habituel.
 */
export function findDossierNumber(text: string, known: string[]): string | null {
  if (!text) return null
  const byLength = [...known].sort((a, b) => b.length - a.length)
  for (const k of byLength) {
    if (k.length >= 5 && text.includes(k)) return k
  }
  const m = DOSSIER_RE.exec(text)
  return m ? `${m[1]}-${m[2]}-${m[3]}-${m[4]}` : null
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

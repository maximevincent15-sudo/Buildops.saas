/**
 * Repère une observation qui décrit un défaut (« cassé », « fuite »,
 * « HS »…), pour prévenir le technicien quand il note quand même
 * l'appareil « Conforme ». Simple indice, jamais bloquant : une négation
 * juste avant (« pas de fuite », « aucun défaut ») annule le mot.
 */

const KEYWORDS = [
  'casse', 'cassee', 'casses', 'cassees', 'fuite', 'fuit', 'hs', 'hors service', 'hors d usage',
  'absent', 'absente', 'absents', 'absentes', 'manque', 'manquant', 'manquante', 'manquants',
  'a remplacer', 'remplacer', 'a changer', 'a reparer', 'reparer',
  'defaut', 'defauts', 'defectueux', 'defectueuse', 'defaillant', 'defaillante',
  'ne fonctionne pas', 'ne marche pas', 'ne s ouvre pas', 'ne se ferme pas', 'ne s allume pas',
  'non fonctionnel', 'non fonctionnelle', 'non conforme', 'ko',
  'bloque', 'bloquee', 'grippe', 'grippee', 'endommage', 'endommagee', 'abime', 'abimee',
  'perce', 'percee', 'corrode', 'corrodee', 'corrosion', 'rouille', 'rouillee', 'oxyde', 'oxydee',
  'perime', 'perimee', 'fissure', 'fissuree', 'dechire', 'dechiree', 'deplombe', 'deplombee',
  'sans plomb', 'sans goupille', 'decharge', 'dechargee', 'inaccessible', 'encombre', 'encombree',
  'pression insuffisante', 'pression basse', 'anomalie', 'probleme',
]

const NEGATIONS = new Set(['pas', 'aucun', 'aucune', 'sans', 'ni', 'rien', 'zero'])

function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/** Vrai si l'observation semble décrire un défaut */
export function describesDefect(observation: string | null | undefined): boolean {
  const text = normalize(observation ?? '')
  if (!text) return false
  const padded = ` ${text} `
  for (const kw of KEYWORDS) {
    let from = 0
    for (;;) {
      const at = padded.indexOf(` ${kw} `, from)
      if (at < 0) break
      const before = padded.slice(0, at).trim().split(' ').slice(-3)
      if (!before.some((w) => NEGATIONS.has(w))) return true
      from = at + 1
    }
  }
  return false
}

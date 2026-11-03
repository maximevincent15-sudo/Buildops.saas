// Déplace les anciens documents vers le stockage privé « documents ».
//
// Les PDF des rapports, devis et factures, les documents des dossiers et les
// archives importées ont été rangés dans le bucket public « report-photos ».
// Ce script les copie dans le bucket privé « documents » (même chemin) et
// remplace leur adresse en base. Les copies publiques restent en place
// jusqu'à --delete-old, à lancer une fois l'app vérifiée.
//
// Usage (clé « service_role » : Supabase → Project Settings → API ; ne jamais
// l'enregistrer dans un fichier du dépôt) :
//   SUPABASE_URL=https://xxx.supabase.co SUPABASE_SERVICE_ROLE_KEY=... node scripts/migrate-private-documents.mjs
//     → simulation : liste ce qui serait déplacé, ne change rien
//   … node scripts/migrate-private-documents.mjs --apply
//     → copie les fichiers et met à jour la base
//   … node scripts/migrate-private-documents.mjs --delete-old
//     → supprime les anciennes copies publiques déjà déplacées

import { createClient } from '@supabase/supabase-js'

const URL_ = process.env.SUPABASE_URL?.replace(/\/+$/, '')
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const APPLY = process.argv.includes('--apply')
const DELETE_OLD = process.argv.includes('--delete-old')
if (!URL_ || !KEY) {
  console.error('SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY sont requis.')
  process.exit(1)
}

const OLD_BUCKET = 'report-photos'
const NEW_BUCKET = 'documents'
const admin = createClient(URL_, KEY, { auth: { persistSession: false } })

// Table, identifiant, colonne de l'adresse, colonne du chemin (si elle existe)
const SOURCES = [
  { table: 'reports', urlCol: 'pdf_url' },
  { table: 'quotes', urlCol: 'pdf_url' },
  { table: 'invoices', urlCol: 'pdf_url' },
  { table: 'dossier_documents', urlCol: 'file_url', pathCol: 'file_path' },
  { table: 'legacy_documents', urlCol: 'pdf_url' },
]

const OLD_PREFIX = `${URL_}/storage/v1/object/public/${OLD_BUCKET}/`
const newUrl = (path) => `${URL_}/storage/v1/object/authenticated/${NEW_BUCKET}/${path}`

/** Chemin dans l'ancien bucket public, sans le paramètre anti-cache (?t=…) */
function oldPath(url) {
  if (typeof url !== 'string' || !url.startsWith(OLD_PREFIX)) return null
  return decodeURIComponent(url.slice(OLD_PREFIX.length).split(/[?#]/)[0])
}

async function rowsOf(table, urlCol, pathCol) {
  const cols = ['id', urlCol, pathCol].filter(Boolean).join(', ')
  const out = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await admin.from(table).select(cols).not(urlCol, 'is', null).range(from, from + 999)
    if (error) throw new Error(`${table} : ${error.message}`)
    out.push(...data)
    if (data.length < 1000) break
  }
  return out
}

let moved = 0
let skipped = 0
let failed = 0
const toDelete = []

for (const { table, urlCol, pathCol } of SOURCES) {
  const rows = await rowsOf(table, urlCol, pathCol)
  const todo = rows.filter((r) => oldPath(r[urlCol]))
  console.log(`${table} : ${todo.length} document(s) à déplacer sur ${rows.length}`)
  for (const r of todo) {
    const path = oldPath(r[urlCol])
    if (!APPLY) { skipped++; continue }
    // Copie dans le bucket privé (déjà présente : on garde la copie existante)
    const { error: cpErr } = await admin.storage.from(OLD_BUCKET).copy(path, path, { destinationBucket: NEW_BUCKET })
    if (cpErr && !/exists|duplicate/i.test(cpErr.message)) {
      console.error(`  ✗ ${table} ${r.id} : ${cpErr.message}`)
      failed++
      continue
    }
    const patch = { [urlCol]: newUrl(path) }
    if (pathCol) patch[pathCol] = path
    const { error: upErr } = await admin.from(table).update(patch).eq('id', r.id)
    if (upErr) {
      console.error(`  ✗ ${table} ${r.id} (base) : ${upErr.message}`)
      failed++
      continue
    }
    moved++
  }
}

if (DELETE_OLD) {
  // Anciennes copies publiques dont l'adresse en base pointe déjà vers « documents »
  for (const { table, urlCol, pathCol } of SOURCES) {
    const rows = await rowsOf(table, urlCol, pathCol)
    for (const r of rows) {
      const m = typeof r[urlCol] === 'string' && r[urlCol].startsWith(`${URL_}/storage/v1/object/authenticated/${NEW_BUCKET}/`)
      if (m) toDelete.push(decodeURIComponent(r[urlCol].split(`/${NEW_BUCKET}/`)[1].split(/[?#]/)[0]))
    }
  }
  let removed = 0
  for (let i = 0; i < toDelete.length; i += 100) {
    const { data, error } = await admin.storage.from(OLD_BUCKET).remove(toDelete.slice(i, i + 100))
    if (error) console.error(`  ✗ suppression : ${error.message}`)
    else removed += data.length
  }
  console.log(`Anciennes copies publiques supprimées : ${removed}`)
}

console.log(APPLY
  ? `Terminé : ${moved} déplacé(s), ${failed} en erreur.`
  : `Simulation : ${skipped} document(s) seraient déplacés. Relancer avec --apply pour le faire.`)
process.exit(failed > 0 ? 1 : 0)

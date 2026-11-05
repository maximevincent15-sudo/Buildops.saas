import { defineConfig } from 'vite'
import type { Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { nodePolyfills } from 'vite-plugin-node-polyfills'
import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Hors ligne : à la fin du build, le service worker (dist/sw.js) reçoit la
 * liste des fichiers de l'app à garder sur l'appareil et un numéro de version
 * propre à ce build (une nouvelle version remplace l'ancienne d'elle-même).
 */
function offlinePrecache(): Plugin {
  return {
    name: 'firovia-offline-precache',
    apply: 'build',
    closeBundle() {
      const dist = join(process.cwd(), 'dist')
      const swPath = join(dist, 'sw.js')
      if (!existsSync(swPath)) return
      const list = (dir: string, prefix: string) => existsSync(join(dist, dir))
        ? readdirSync(join(dist, dir)).map((f) => `${prefix}${f}`)
        : []
      // Tout sauf l'Excel (exports et imports, inutiles sur le terrain)
      const assets = [...list('assets', '/assets/'), ...list('fonts', '/fonts/')]
        .filter((f) => !f.includes('vendor-excel') && !f.endsWith('.map'))
        .sort()
      const version = createHash('sha1').update(assets.join('|')).update(readFileSync(join(dist, 'index.html'))).digest('hex').slice(0, 10)
      const sw = readFileSync(swPath, 'utf8')
        .replace("'__BUILD_VERSION__'", JSON.stringify(version))
        .replace('[] /* __PRECACHE_ASSETS__ */', JSON.stringify(assets))
      writeFileSync(swPath, sw)
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    offlinePrecache(),
    // Polyfills Node.js (Buffer, process, etc.) requis par
    // @react-pdf/renderer pour la génération de PDF côté navigateur.
    // Sans ces polyfills, "Buffer is not defined" plante tout PDF.
    nodePolyfills({
      include: ['buffer', 'process', 'stream', 'util'],
      globals: {
        Buffer: true,
        global: true,
        process: true,
      },
    }),
  ],
  build: {
    // Sépare les libs lourdes en chunks dédiés. Le navigateur les charge en
    // parallèle, les met en cache, et le bundle initial est plus léger.
    rollupOptions: {
      output: {
        manualChunks: (id: string) => {
          if (id.includes('node_modules')) {
            // PDF (lourd : ~600KB) — chargé uniquement sur la page rapport/devis/facture
            if (id.includes('@react-pdf')) return 'vendor-pdf'
            // Excel (lourd : ~1MB) — chargé uniquement pour exports & imports
            if (id.includes('exceljs')) return 'vendor-excel'
            // Date-fns
            if (id.includes('date-fns')) return 'vendor-date'
            // Supabase
            if (id.includes('@supabase')) return 'vendor-supabase'
            // React
            if (id.includes('react') || id.includes('scheduler')) return 'vendor-react'
          }
          return undefined
        },
      },
    },
    // Augmente le seuil pour ne plus afficher le warning chunk-size
    chunkSizeWarningLimit: 1500,
  },
})

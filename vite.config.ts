import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
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

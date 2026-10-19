/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string
  readonly VITE_SUPABASE_PUBLISHABLE_KEY: string
  /** "true" pour afficher la lecture de plaque par l'IA (clé Anthropic requise) */
  readonly VITE_LABEL_SCAN_ENABLED?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

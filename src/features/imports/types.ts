/**
 * Architecture générique d'import de données.
 *
 * Un import est défini par :
 *  - une liste de champs (schema de colonnes attendues)
 *  - une fonction de validation ligne par ligne
 *  - une fonction de dédup (existe déjà en base ?)
 *  - une fonction d'insertion en base
 *
 * Le wizard UI (ImportWizard) est réutilisable pour n'importe quelle entité :
 * clients, techniciens, véhicules, interventions, etc.
 */

/** Définit une colonne attendue dans le fichier importé. */
export type ImportField = {
  /** Clé interne (utilisée pour construire l'objet final). */
  key: string
  /** Nom affiché à l'utilisateur dans le template + preview. */
  label: string
  /** Champ obligatoire ? Une ligne sans valeur est rejetée. */
  required?: boolean
  /** Exemple de valeur pour le template téléchargeable. */
  example?: string
  /** Aide affichée en dessous dans le template (ligne 2). */
  hint?: string
}

/** Statut d'une ligne après validation. */
export type RowStatus = 'valid' | 'duplicate' | 'invalid'

/** Résultat de validation / analyse d'une ligne. */
export type RowAnalysis = {
  /** Index de ligne (pour clé React). */
  index: number
  /** Valeurs nettoyées (trim, null si vide). */
  values: Record<string, string | null>
  /** Statut calculé. */
  status: RowStatus
  /** Messages d'erreur (lignes invalides) ou warning (lignes valides). */
  messages: string[]
  /** Pour les doublons : id existant + action à faire. */
  existingId?: string | null
  /** Pour les doublons : 'skip' ou 'update' (choix utilisateur). */
  duplicateAction?: 'skip' | 'update'
}

/** Résultat de l'insertion en base (affiché au rapport final). */
export type ImportResult = {
  created: number
  updated: number
  skipped: number
  errors: Array<{ rowIndex: number; message: string }>
}

/**
 * Définition complète d'un type d'import (clients, techniciens, etc.)
 */
export type ImportDefinition = {
  /** Nom de l'entité au singulier, ex: "client", "technicien". */
  entityLabel: string
  /** Nom au pluriel, ex: "clients". */
  entityLabelPlural: string
  /** Nom du template, ex: "clients-buildops.xlsx". */
  templateFilename: string
  /** Liste des champs attendus. */
  fields: ImportField[]
  /**
   * Explication longue affichée en haut de la page d'import.
   * Peut inclure des recommandations (format de date, séparateurs…).
   */
  description: string
  /**
   * Valide une ligne brute (après mapping header→key).
   * Retourne l'analyse (status + messages + éventuellement existingId pour dédup).
   */
  validateRow: (row: Record<string, string | null>, context: ImportContext) => Promise<RowAnalysis> | RowAnalysis
  /**
   * Insère ou met à jour une ligne en base.
   * Retourne 'created', 'updated' ou 'skipped'.
   */
  importRow: (
    row: Record<string, string | null>,
    analysis: RowAnalysis,
    context: ImportContext,
  ) => Promise<'created' | 'updated' | 'skipped'>
}

/** Contexte commun passé à chaque fonction (ex: organization_id). */
export type ImportContext = {
  organizationId: string
  /** Cache éventuel (ex: map des clients existants par nom pour dédup rapide). */
  cache?: Record<string, unknown>
}

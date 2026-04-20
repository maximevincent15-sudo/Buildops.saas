import { useState } from 'react'
import type { MouseEvent } from 'react'
import { setInterventionStatus } from '../api'
import type { Intervention } from '../schemas'

type Props = {
  intervention: Intervention
  onChanged: () => void
}

export function InterventionRowActions({ intervention, onChanged }: Props) {
  const [loading, setLoading] = useState(false)

  async function change(status: string) {
    setLoading(true)
    try {
      await setInterventionStatus(intervention.id, status)
      onChanged()
    } catch (err) {
      console.error('Erreur changement statut', err)
      alert('Impossible de changer le statut. Réessaye dans quelques secondes.')
    } finally {
      setLoading(false)
    }
  }

  function handleClick(e: MouseEvent<HTMLButtonElement>, status: string) {
    e.stopPropagation()
    void change(status)
  }

  const { status } = intervention

  if (status === 'planifiee') {
    return (
      <button
        type="button"
        className="act-btn"
        onClick={(e) => handleClick(e, 'en_cours')}
        disabled={loading}
      >
        Démarrer
      </button>
    )
  }

  if (status === 'en_cours') {
    return (
      <button
        type="button"
        className="act-btn done"
        onClick={(e) => handleClick(e, 'terminee')}
        disabled={loading}
      >
        Terminer
      </button>
    )
  }

  if (status === 'terminee') {
    return (
      <button
        type="button"
        className="act-btn subtle"
        onClick={(e) => handleClick(e, 'en_cours')}
        disabled={loading}
      >
        Rouvrir
      </button>
    )
  }

  if (status === 'a_planifier') {
    return <span className="text-ink-3 text-xs font-light">Ajouter une date</span>
  }

  return null
}

import { useState } from 'react'
import type { MouseEvent } from 'react'
import { Link } from 'react-router-dom'
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

  function stopPropagation(e: MouseEvent<HTMLAnchorElement>) {
    e.stopPropagation()
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
      <Link
        to={`/rapports/${intervention.id}`}
        className="act-btn done"
        onClick={stopPropagation}
      >
        Rapport
      </Link>
    )
  }

  if (status === 'terminee') {
    return (
      <Link
        to={`/rapports/${intervention.id}`}
        className="act-btn subtle"
        onClick={stopPropagation}
      >
        Voir rapport
      </Link>
    )
  }

  if (status === 'a_planifier') {
    return <span className="text-ink-3 text-xs font-light">Ajouter une date</span>
  }

  return null
}

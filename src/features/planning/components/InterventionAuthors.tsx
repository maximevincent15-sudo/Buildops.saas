import { useEffect, useState } from 'react'
import { supabase } from '../../../shared/lib/supabase'
import type { Intervention } from '../schemas'

type Props = { intervention: Pick<Intervention, 'created_at' | 'created_by' | 'updated_by' | 'updated_at'> }

function when(iso: string): string {
  const d = new Date(iso)
  return `${d.toLocaleDateString('fr-FR')} à ${d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`
}

/** « Créée le … par …, modifiée le … par … » (noms des comptes de l'entreprise) */
export function InterventionAuthors({ intervention }: Props) {
  const { created_at, created_by, updated_by, updated_at } = intervention
  const [names, setNames] = useState<Record<string, string>>({})

  useEffect(() => {
    const ids = [created_by, updated_by].filter((x): x is string => !!x)
    if (ids.length === 0) return
    let alive = true
    void supabase
      .from('profiles')
      .select('id, first_name, last_name')
      .in('id', [...new Set(ids)])
      .then(({ data }) => {
        if (!alive || !data) return
        const map: Record<string, string> = {}
        for (const p of data as Array<{ id: string; first_name: string | null; last_name: string | null }>) {
          map[p.id] = [p.first_name, p.last_name].filter(Boolean).join(' ') || 'un utilisateur'
        }
        setNames(map)
      })
    return () => { alive = false }
  }, [created_by, updated_by])

  const by = (id: string | null | undefined) => (id ? ` par ${names[id] ?? '…'}` : '')
  return (
    <p className="text-ink-3 text-xs font-light" style={{ margin: '.2rem 0 0', lineHeight: 1.5 }}>
      Créée le {when(created_at)}{by(created_by)}
      {updated_at && <> · modifiée le {when(updated_at)}{by(updated_by)}</>}
    </p>
  )
}

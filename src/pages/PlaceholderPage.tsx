type Props = {
  title: string
  description?: string
}

export function PlaceholderPage({ title, description }: Props) {
  return (
    <>
      <div className="dash-top">
        <div>
          <div className="dash-title">{title}</div>
          <div className="dash-sub">
            {description ?? 'Module à construire — sera branché sur Supabase dans une prochaine étape.'}
          </div>
        </div>
      </div>
      <div className="card">
        <p className="text-ink-2 text-sm font-light">
          Cette section fait partie de la roadmap. Le design système et le routing sont déjà en place —
          il reste à implémenter les formulaires, listes et interactions propres à ce module.
        </p>
      </div>
    </>
  )
}

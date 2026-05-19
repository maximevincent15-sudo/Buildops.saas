type Activity = {
  time: string
  txt: React.ReactNode
}

/**
 * Activités de démo (statiques pour le moment).
 *
 * TODO (Session ultérieure) : remplacer par un vrai flux récupéré depuis
 * une table audit_log ou via Supabase Realtime. Le composant est déjà
 * structuré pour accueillir des données dynamiques.
 */
const activities: Activity[] = [
  {
    time: "Aujourd'hui · 14:32",
    txt: <><strong>Julien Pariseau</strong> a démarré l'intervention <strong>SSI Vincent &amp; Associés</strong></>,
  },
  {
    time: "Aujourd'hui · 11:08",
    txt: <><strong>Thomas Moreau</strong> a clôturé <strong>Extincteurs Crozet BTP</strong> avec signature client</>,
  },
  {
    time: "Aujourd'hui · 09:14",
    txt: <>Devis <strong>DEV-2026-018</strong> accepté par <strong>Démo Firovia</strong> · 1 850 €</>,
  },
  {
    time: 'Hier · 16:42',
    txt: <>Facture <strong>F-2026-042</strong> payée par <strong>Vincent &amp; Associés</strong></>,
  },
]

/**
 * ActivityFeed v2 — Direction B (Mercury-vibe).
 *
 * Timeline verticale avec dots et ligne de fil. Plus élégante que la grille
 * d'items du précédent design — raconte une histoire chronologique claire.
 */
export function ActivityFeed() {
  return (
    <div className="b-card">
      <div className="b-section-head" style={{ marginBottom: 14 }}>
        <div>
          <div className="b-section-h" style={{ fontSize: 15 }}>Activité récente</div>
          <div className="b-section-s" style={{ fontSize: 12 }}>Derniers événements</div>
        </div>
      </div>
      <div className="b-tl">
        {activities.map((a, i) => (
          <div key={i} className="b-tl-item">
            <div className="b-tl-time">{a.time}</div>
            <div className="b-tl-txt">{a.txt}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

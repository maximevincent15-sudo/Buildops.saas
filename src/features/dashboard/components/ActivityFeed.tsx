type Dot = 'grn' | 'org' | 'blu' | 'red'

type Activity = {
  dot: Dot
  icon: string
  txt: string
  time: string
}

const activities: Activity[] = [
  { dot: 'grn', icon: '✓', txt: 'Rapport INT-042 signé et envoyé — Résidence Les Lilas', time: "Aujourd'hui, 09h52" },
  { dot: 'red', icon: '🔔', txt: 'Alerte — SSI Mairie de Creil (8 jours)', time: "Aujourd'hui, 08h00" },
  { dot: 'blu', icon: '🗓️', txt: 'Intervention planifiée — Lycée Victor Hugo · R. Bernard', time: 'Hier, 17h14' },
  { dot: 'grn', icon: '✓', txt: 'Facture payée — Résidence Les Lilas', time: 'Hier, 11h30' },
  { dot: 'blu', icon: '🏢', txt: 'Nouveau site ajouté — Clinique du Parc (42 équipements)', time: '13 avr., 14h20' },
  { dot: 'grn', icon: '📄', txt: 'Rapport PDF — Clinique du Parc · Conforme', time: '12 avr., 16h05' },
]

export function ActivityFeed() {
  return (
    <div className="card" style={{ marginBottom: '2rem' }}>
      <div className="card-top">
        <span className="card-title">Activité récente</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 2rem' }}>
        {activities.map((a, i) => (
          <div key={i} className="act-item">
            <div className={`act-dot ad-${a.dot}`}>{a.icon}</div>
            <div>
              <div className="act-txt">{a.txt}</div>
              <div className="act-time">{a.time}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

type Alert = {
  dot: 'r' | 'o' | 'g'
  main: string
  sub: string
  crit?: boolean
}

const alerts: Alert[] = [
  { dot: 'r', main: 'Mairie de Creil — SSI', sub: 'Vérif. annuelle obligatoire · 8 jours', crit: true },
  { dot: 'r', main: 'Lycée Victor Hugo — Extincteurs', sub: 'Contrôle annuel · 12 jours', crit: true },
  { dot: 'o', main: 'Résidence Les Lilas — RIA', sub: 'Vérif. semestrielle · 21 jours' },
  { dot: 'o', main: "Grand'Place — Désenfumage", sub: 'Contrôle annuel · 28 jours' },
]

export function AlertsList() {
  return (
    <div className="card">
      <div className="card-top">
        <span className="card-title">Alertes réglementaires</span>
        <span className="badge b-red">4 urgentes</span>
      </div>
      {alerts.map((a, i) => (
        <div key={i} className={`al-item${a.crit ? ' crit' : ''}`}>
          <div className={`al-dot dot-${a.dot}`} />
          <div>
            <div className="al-main">{a.main}</div>
            <div className="al-sub">{a.sub}</div>
          </div>
        </div>
      ))}
    </div>
  )
}

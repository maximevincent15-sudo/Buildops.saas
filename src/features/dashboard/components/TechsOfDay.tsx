type Tech = {
  name: string
  done: number
  total: number
  meta: string
}

const techs: Tech[] = [
  { name: 'T. Moreau', done: 2, total: 3, meta: 'Les Lilas ✓ · Grand\u2019Place → · Hugo 14h' },
  { name: 'S. Laurent', done: 1, total: 2, meta: 'Grand\u2019Place en cours · Clinique 16h' },
  { name: 'R. Bernard', done: 0, total: 1, meta: 'Lycée Victor Hugo 14h00' },
]

export function TechsOfDay() {
  return (
    <div className="card">
      <div className="card-top">
        <span className="card-title">Techniciens du jour</span>
        <span className="card-lnk">Voir tout</span>
      </div>
      {techs.map((t) => {
        const pct = t.total > 0 ? Math.max(10, (t.done / t.total) * 100) : 10
        return (
          <div key={t.name} className="ch-item">
            <div className="ch-top">
              <span className="ch-name">{t.name}</span>
              <span className="ch-pct">{t.done}/{t.total}</span>
            </div>
            <div className="prog">
              <div className="prog-fill" style={{ width: `${pct}%` }} />
            </div>
            <div className="ch-meta">{t.meta}</div>
          </div>
        )
      })}
    </div>
  )
}

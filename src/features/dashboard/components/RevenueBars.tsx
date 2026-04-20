type Bar = { m: string; v: number; hi?: boolean }

const data: Bar[] = [
  { m: 'Oct', v: 22 },
  { m: 'Nov', v: 27 },
  { m: 'Déc', v: 19 },
  { m: 'Jan', v: 26 },
  { m: 'Fév', v: 29 },
  { m: 'Mar', v: 34 },
  { m: 'Avr', v: 31, hi: true },
]

export function RevenueBars() {
  const max = Math.max(...data.map((d) => d.v))
  return (
    <div className="card">
      <div className="card-top">
        <span className="card-title">CA mensuel 2026</span>
        <span className="card-lnk">Voir le rapport</span>
      </div>
      <div className="bars-wrap">
        {data.map((d) => (
          <div key={d.m} className="bw">
            <div className="bar-track">
              <div
                className={`bar${d.hi ? ' hi' : ''}`}
                style={{ height: `${Math.round((d.v / max) * 100)}%` }}
                title={`${d.v}k €`}
              />
            </div>
            <div className="bar-l">{d.m}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

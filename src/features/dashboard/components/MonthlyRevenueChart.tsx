import { formatAmount } from '../../devis/constants'

type Item = { key: string; label: string; amount: number }

type Props = {
  title: string
  data: Item[]
}

export function MonthlyRevenueChart({ title, data }: Props) {
  const max = data.reduce((m, i) => Math.max(m, i.amount), 0)
  const total = data.reduce((s, i) => s + i.amount, 0)
  const average = data.length > 0 ? total / data.length : 0

  return (
    <div className="card">
      <div className="card-top">
        <span className="card-title">{title}</span>
        <span className="text-ink-3 text-xs font-light">
          12 derniers mois · Total {formatAmount(total)} · Moy {formatAmount(average)}/mois
        </span>
      </div>

      {max === 0 ? (
        <p className="text-ink-3 text-xs font-light" style={{ marginTop: '.5rem', margin: 0 }}>
          Aucun encaissement enregistré sur les 12 derniers mois.
        </p>
      ) : (
        <div className="monthly-chart">
          {data.map((d) => {
            const pctHeight = max > 0 ? (d.amount / max) * 100 : 0
            return (
              <div key={d.key} className="monthly-col" title={`${d.label} : ${formatAmount(d.amount)}`}>
                <div className="monthly-col-fill-wrap">
                  <div
                    className={`monthly-col-fill ${d.amount > 0 ? 'has-data' : ''}`}
                    style={{ height: d.amount > 0 ? `${Math.max(2, pctHeight)}%` : '2%' }}
                  >
                    {d.amount > 0 && (
                      <span className="monthly-col-amount">
                        {Math.round(d.amount).toLocaleString('fr-FR')}€
                      </span>
                    )}
                  </div>
                </div>
                <div className="monthly-col-label">{d.label}</div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

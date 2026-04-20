type Props = {
  label: string
  value: string
  sub: string
  subVariant?: 'up' | 'dn' | 'nu'
  barPct: number
  barColor: 'acc' | 'red' | 'grn' | 'brn'
}

export function KpiCard({ label, value, sub, subVariant = 'nu', barPct, barColor }: Props) {
  return (
    <div className="kpi">
      <div className="kpi-lbl">{label}</div>
      <div className="kpi-val">{value}</div>
      <div className={`kpi-sub ${subVariant}`}>{sub}</div>
      <div className="kpi-bar">
        <div
          className="kpi-fill"
          style={{ width: `${barPct}%`, background: `var(--${barColor})` }}
        />
      </div>
    </div>
  )
}

type Status = 'terminee' | 'en-cours' | 'planifiee' | 'a-planifier'

type Row = {
  ref: string
  client: string
  equipement: string
  status: Status
  date: string
}

const rows: Row[] = [
  { ref: 'INT-042', client: 'Résidence Les Lilas', equipement: 'Extincteurs', status: 'terminee', date: 'Auj. 08h30' },
  { ref: 'INT-041', client: "Grand'Place", equipement: 'Désenfumage', status: 'en-cours', date: 'Auj. 11h00' },
  { ref: 'INT-040', client: 'Lycée Victor Hugo', equipement: 'SSI + RIA', status: 'planifiee', date: 'Auj. 14h00' },
  { ref: 'INT-039', client: 'Mairie de Creil', equipement: 'SSI', status: 'a-planifier', date: '—' },
  { ref: 'INT-038', client: 'Clinique du Parc', equipement: 'Extincteurs', status: 'terminee', date: '12 avr.' },
]

const statusStyles: Record<Status, { cls: string; label: string }> = {
  'terminee': { cls: 'b-grn', label: 'Terminée' },
  'en-cours': { cls: 'b-org', label: 'En cours' },
  'planifiee': { cls: 'b-org', label: 'Planifiée' },
  'a-planifier': { cls: 'b-red', label: 'À planifier' },
}

export function RecentInterventions() {
  return (
    <div className="card">
      <div className="card-top">
        <span className="card-title">Interventions récentes</span>
        <span className="card-lnk">+ Nouvelle</span>
      </div>
      <table className="dtbl">
        <thead>
          <tr>
            <th>Réf.</th>
            <th>Client / Site</th>
            <th>Équipement</th>
            <th>Statut</th>
            <th>Date</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const s = statusStyles[r.status]
            return (
              <tr key={r.ref}>
                <td>{r.ref}</td>
                <td>{r.client}</td>
                <td>{r.equipement}</td>
                <td><span className={`badge ${s.cls}`}>{s.label}</span></td>
                <td>{r.date}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

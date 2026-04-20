export function DashboardPage() {
  return (
    <div className="p-8 max-w-6xl mx-auto">
      <div className="flex items-center gap-2 mb-8">
        <div className="w-8 h-8 rounded-lg bg-acc flex items-center justify-center">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="white"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="w-4 h-4"
          >
            <path d="M12 2L2 7l10 5 10-5-10-5z" />
            <path d="M2 17l10 5 10-5" />
            <path d="M2 12l10 5 10-5" />
          </svg>
        </div>
        <span className="font-display text-xl font-extrabold text-ink">
          Build<span className="text-acc">Ops</span>
        </span>
      </div>
      <h1 className="font-display text-3xl font-extrabold text-ink mb-2">
        Dashboard
      </h1>
      <p className="text-ink-2 text-sm font-light">
        Module à construire : KPIs, planning des interventions, alertes réglementaires, activité récente.
      </p>
    </div>
  )
}

export function AuthPage() {
  return (
    <div className="bg-wht border border-brd-2 rounded-lg p-8 max-w-md w-full">
      <div className="flex items-center gap-2 mb-6">
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
      <h1 className="font-display text-2xl font-extrabold text-ink mb-2">
        Authentification
      </h1>
      <p className="text-ink-2 text-sm mb-4 font-light">
        Module à construire : connexion et inscription via Supabase Auth.
      </p>
      <p className="text-ink-3 text-xs font-light">
        Prochaines étapes : formulaires login + register avec react-hook-form + zod, RLS multi-tenant par organisation.
      </p>
    </div>
  )
}

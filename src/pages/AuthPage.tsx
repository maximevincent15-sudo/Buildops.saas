import { useState } from 'react'
import { LoginForm } from '../features/auth/components/LoginForm'
import { RegisterForm } from '../features/auth/components/RegisterForm'

type Tab = 'login' | 'register'

export function AuthPage() {
  const [tab, setTab] = useState<Tab>('login')

  return (
    <div className="auth-layout">
      <aside className="auth-left">
        <div className="auth-bg" />
        <div className="auth-grid" />
        <div className="auth-body">
          <h2>
            Maintenance incendie
            <br />
            sous <em>contrôle total</em>
          </h2>
          <p>Conçu pour les entreprises de maintenance incendie de 3 à 20 techniciens.</p>
          <div className="af-list">
            <div className="af-item">
              <div className="af-dot" style={{ background: 'rgba(58,92,168,.3)' }}>🗓️</div>
              <span>Planning des interventions — extincteurs, RIA, SSI, désenfumage</span>
            </div>
            <div className="af-item">
              <div className="af-dot" style={{ background: 'rgba(58,92,168,.25)' }}>📱</div>
              <span>Rapports PDF depuis le téléphone du technicien</span>
            </div>
            <div className="af-item">
              <div className="af-dot" style={{ background: 'rgba(58,92,168,.2)' }}>🔔</div>
              <span>Alertes avant chaque échéance réglementaire</span>
            </div>
            <div className="af-item">
              <div className="af-dot" style={{ background: 'rgba(46,125,94,.25)' }}>📋</div>
              <span>Traçabilité complète pour les contrôles</span>
            </div>
          </div>
        </div>
        <div className="auth-foot">
          <div className="tmini">
            <div className="tmini-av">RB</div>
            <p>
              "Ce qui m'a convaincu, c'est les alertes réglementaires. J'avais déjà eu un problème avec un contrôle SSI oublié." —{' '}
              <strong>Romain B., 4 techniciens</strong>
            </p>
          </div>
        </div>
      </aside>

      <section className="auth-right">
        <div className="auth-card">
          <div className="atabs">
            <button
              type="button"
              className={`atab${tab === 'login' ? ' on' : ''}`}
              onClick={() => setTab('login')}
            >
              Connexion
            </button>
            <button
              type="button"
              className={`atab${tab === 'register' ? ' on' : ''}`}
              onClick={() => setTab('register')}
            >
              Créer un compte
            </button>
          </div>

          {tab === 'login' ? <LoginForm /> : <RegisterForm />}
        </div>
      </section>
    </div>
  )
}

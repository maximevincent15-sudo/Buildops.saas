import { Link } from 'react-router-dom'
import { useAuthStore } from '../features/auth/store'

export function NotFoundPage() {
  const session = useAuthStore((s) => s.session)
  const isAuthenticated = !!session

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        background: 'var(--bg, #F2F3F5)',
        color: 'var(--ink, #1C2130)',
        fontFamily: "'Inter', sans-serif",
      }}
    >
      <div style={{ maxWidth: 580, textAlign: 'center' }}>
        <Link
          to="/"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 9,
            marginBottom: 48,
            textDecoration: 'none',
          }}
        >
          <div
            style={{
              fontFamily: "'Syne', sans-serif",
              fontSize: '1.3rem',
              fontWeight: 800,
              color: 'var(--ink, #1C2130)',
              letterSpacing: '-0.5px',
            }}
          >
            <span style={{ color: 'var(--acc, #3A5CA8)' }}>Fir</span>ovia
          </div>
        </Link>

        <div
          style={{
            fontFamily: "'Syne', sans-serif",
            fontWeight: 800,
            fontSize: 'clamp(5rem, 15vw, 8rem)',
            background: 'linear-gradient(135deg, #3A5CA8 0%, #5578C8 100%)',
            WebkitBackgroundClip: 'text',
            backgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            lineHeight: 1,
            letterSpacing: '-4px',
          }}
        >
          404
        </div>

        <h1
          style={{
            fontFamily: "'Syne', sans-serif",
            letterSpacing: '-0.5px',
            fontSize: 'clamp(1.5rem, 4vw, 2.2rem)',
            fontWeight: 800,
            marginTop: 16,
            marginBottom: 14,
          }}
        >
          Cette page s'est volatilisée.
        </h1>
        <p
          style={{
            color: 'var(--ink2, #5A6070)',
            fontSize: '1rem',
            lineHeight: 1.6,
            marginBottom: 32,
          }}
        >
          Le lien que vous suivez ne mène nulle part. La page a peut-être été déplacée,
          supprimée, ou l'URL contient une coquille. Pas d'inquiétude — il y a toujours
          moyen de retomber sur ses pattes.
        </p>

        <div
          style={{
            display: 'flex',
            gap: 12,
            justifyContent: 'center',
            flexWrap: 'wrap',
          }}
        >
          {isAuthenticated ? (
            <Link
              to="/dashboard"
              style={{
                padding: '.7rem 1.4rem',
                borderRadius: 100,
                fontSize: '.92rem',
                fontWeight: 500,
                background: 'var(--acc, #3A5CA8)',
                color: 'white',
                border: '1px solid var(--acc, #3A5CA8)',
                textDecoration: 'none',
              }}
            >
              ← Retour au tableau de bord
            </Link>
          ) : (
            <Link
              to="/auth"
              style={{
                padding: '.7rem 1.4rem',
                borderRadius: 100,
                fontSize: '.92rem',
                fontWeight: 500,
                background: 'var(--acc, #3A5CA8)',
                color: 'white',
                border: '1px solid var(--acc, #3A5CA8)',
                textDecoration: 'none',
              }}
            >
              ← Page de connexion
            </Link>
          )}
          <a
            href="https://firovia.fr"
            style={{
              padding: '.7rem 1.4rem',
              borderRadius: 100,
              fontSize: '.92rem',
              fontWeight: 500,
              background: 'white',
              color: 'var(--ink, #1C2130)',
              border: '1px solid var(--brd, rgba(28,33,48,.10))',
              textDecoration: 'none',
            }}
          >
            Site Firovia
          </a>
          <a
            href="mailto:contact@firovia.fr"
            style={{
              padding: '.7rem 1.4rem',
              borderRadius: 100,
              fontSize: '.92rem',
              fontWeight: 500,
              background: 'white',
              color: 'var(--ink, #1C2130)',
              border: '1px solid var(--brd, rgba(28,33,48,.10))',
              textDecoration: 'none',
            }}
          >
            Support
          </a>
        </div>

        <div
          style={{
            marginTop: 48,
            paddingTop: 32,
            borderTop: '1px solid var(--brd, rgba(28,33,48,.10))',
            fontSize: '.85rem',
            color: 'var(--ink2, #5A6070)',
          }}
        >
          Vous pensez que cette page devrait exister ?<br />
          Envoyez-nous le lien à{' '}
          <a
            href="mailto:contact@firovia.fr"
            style={{ color: 'var(--acc, #3A5CA8)', fontWeight: 500 }}
          >
            contact@firovia.fr
          </a>
          , on regarde.
        </div>
      </div>
    </div>
  )
}

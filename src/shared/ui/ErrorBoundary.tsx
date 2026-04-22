import { Component } from 'react'
import type { ErrorInfo, ReactNode } from 'react'

type Props = {
  children: ReactNode
  fallback?: ReactNode
}

type State = {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[ErrorBoundary] caught:', error, info)
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null })
  }

  render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback
      return (
        <div className="card" style={{ maxWidth: 720, margin: '2rem auto' }}>
          <div className="card-top">
            <span className="card-title">Oups — une erreur est survenue</span>
          </div>
          <p className="text-ink-2 text-sm font-light" style={{ marginBottom: '.5rem' }}>
            La page n'a pas pu s'afficher correctement.
          </p>
          {this.state.error && (
            <pre
              style={{
                background: 'var(--bg)',
                padding: '.8rem',
                borderRadius: 6,
                fontSize: '.75rem',
                color: 'var(--red)',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                marginBottom: '1rem',
              }}
            >
              {this.state.error.name}: {this.state.error.message}
            </pre>
          )}
          <div style={{ display: 'flex', gap: '.6rem', flexWrap: 'wrap' }}>
            <button type="button" className="btn-sm acc" onClick={() => window.location.reload()}>
              Recharger la page
            </button>
            <button type="button" className="btn-sm" onClick={this.handleReset}>
              Réessayer
            </button>
            <a href="/dashboard" className="btn-sm">
              Retour au tableau de bord
            </a>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

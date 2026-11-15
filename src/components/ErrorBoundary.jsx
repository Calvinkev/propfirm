import { Component } from 'react'

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    console.error('ErrorBoundary caught:', error, info?.componentStack)
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{
          minHeight: '100vh', display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          background: '#0B0F14', color: '#fff', padding: '32px', textAlign: 'center'
        }}>
          <div style={{ fontSize: '36px', marginBottom: '16px' }}>⚠️</div>
          <h2 style={{ marginBottom: '8px' }}>Something went wrong</h2>
          <p style={{ color: '#94A3B8', marginBottom: '24px', maxWidth: '480px' }}>
            {this.state.error?.message || 'An unexpected error occurred.'}
          </p>
          <button
            onClick={() => { this.setState({ error: null }); window.location.href = '/portfolio'; }}
            style={{
              background: '#D4AE55', color: '#000', border: 'none',
              padding: '10px 24px', borderRadius: '8px',
              fontWeight: '700', cursor: 'pointer', fontSize: '14px'
            }}
          >
            Go to Portfolio
          </button>
          <details style={{ marginTop: '20px', color: '#475569', fontSize: '11px', maxWidth: '600px', textAlign: 'left' }}>
            <summary style={{ cursor: 'pointer' }}>Technical details</summary>
            <pre style={{ marginTop: '8px', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
              {this.state.error?.stack}
            </pre>
          </details>
        </div>
      )
    }
    return this.props.children
  }
}

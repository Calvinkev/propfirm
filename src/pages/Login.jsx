import { useState } from 'react'
import { Link, useNavigate, useLocation, Navigate } from 'react-router-dom'
import Button from '../components/Button'
import { api } from '../services/api'
import { useAuth } from '../context/AuthContext'
import Logo from '../components/Logo'
import './Auth.css'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [rememberMe, setRememberMe] = useState(true)
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const navigate = useNavigate()
  const location = useLocation()
  const { login, isAuthenticated, user } = useAuth()

  // Already logged in → redirect to role-appropriate home
  if (isAuthenticated) {
    const defaultTarget = user?.role === 'admin' ? '/admin/dashboard' : '/dashboard'
    const from = location.state?.from?.pathname || defaultTarget
    return <Navigate to={from} replace />
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const response = await api.login({ email, password })

      if (response.token) {
        login(response.user, response.token)
        const defaultTarget = response.user?.role === 'admin' ? '/admin/dashboard' : '/dashboard'
        const from = location.state?.from?.pathname || defaultTarget
        navigate(from, { replace: true })
      } else {
        setError(response.error || 'Invalid credentials. Please verify your email and password.')
      }
    } catch {
      setError('Connection error. Please check your network and try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-page">
      {/* Background Lighting Glows */}
      <div className="auth-bg-glows">
        <div className="auth-glow-1" />
        <div className="auth-glow-2" />
      </div>

      {/* Left Brand Panel */}
      <div className="auth-brand-panel">
        <div className="auth-brand-header">
          <Link to="/" style={{ textDecoration: 'none' }}>
            <Logo size="large" />
          </Link>
          <Link to="/" className="auth-back-link">
            <span>←</span> Back to STAKEUP
          </Link>
        </div>

        <div className="auth-brand-content">
          <div className="auth-brand-title">
            Trade capital up to <em>$100,000.</em> Keep up to 90% profits.
          </div>
          <p className="auth-brand-desc">
            Sign in to access your real-time risk desk, monitor your profit targets, and submit instant payout requests.
          </p>

          <div className="auth-highlight-card">
            <div className="auth-highlight-quote">
              "The rules were transparent, execution was instantaneous, and my first $10K payout hit my account in under 24 hours."
            </div>
            <div className="auth-highlight-author">
              <div className="auth-author-avatar">KM</div>
              <div className="auth-author-info">
                <b>Kwame M.</b>
                <span>Funded Trader · $100,000 Tier</span>
              </div>
            </div>
          </div>
        </div>

        <div className="auth-brand-stats">
          <div className="auth-brand-stat">
            <b>$1M+</b>
            <span>Paid to Traders</span>
          </div>
          <div className="auth-brand-stat">
            <b>1000+</b>
            <span>Funded Accounts</span>
          </div>
          <div className="auth-brand-stat">
            <b>90%</b>
            <span>Max Profit Split</span>
          </div>
        </div>
      </div>

      {/* Right Form Panel */}
      <div className="auth-form-panel">
        <div className="auth-form-card">
          <div className="auth-form-header">
            <h2>Welcome back</h2>
            <p>Enter your details to sign in to your trader portal</p>
          </div>

          <div className="auth-social-btns">
            <button className="auth-social-btn" type="button" onClick={() => setEmail('trader@stakeup.com')}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12.545,10.239v3.821h5.445c-0.712,2.315-2.647,3.972-5.445,3.972c-3.332,0-6.033-2.701-6.033-6.032s2.701-6.032,6.033-6.032c1.498,0,2.866,0.549,3.921,1.453l2.814-2.814C17.503,2.988,15.139,2,12.545,2C7.021,2,2.543,6.477,2.543,12s4.478,10,10.002,10c8.396,0,10.249-7.85,9.426-11.761H12.545z" />
              </svg>
              Google
            </button>
            <button className="auth-social-btn" type="button" onClick={() => setError('Demo mode: Please use email login below.')}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M15.97 6.32c.67-.82 1.13-1.96.99-3.11-1 .04-2.22.67-2.92 1.49-.63.73-1.18 1.9-1.03 3.03 1.12.09 2.27-.58 2.96-1.41z" />
              </svg>
              Apple
            </button>
          </div>

          <div className="auth-divider">
            <span>or sign in with email</span>
          </div>

          {error && (
            <div className="auth-error-alert">
              <span>⚠️</span>
              <div>{error}</div>
            </div>
          )}

          <form onSubmit={handleSubmit}>
            <div className="auth-input-group">
              <label className="auth-label">Email Address</label>
              <div className="auth-input-wrapper">
                <span className="auth-input-icon">✉</span>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@company.com"
                  required
                  autoComplete="email"
                  className="auth-input"
                />
              </div>
            </div>

            <div className="auth-input-group">
              <div className="auth-label-row">
                <label className="auth-label">Password</label>
                <a href="#forgot" className="auth-forgot-link" onClick={(e) => { e.preventDefault(); setError('Password reset instructions sent if email is registered.'); }}>
                  Forgot password?
                </a>
              </div>
              <div className="auth-input-wrapper">
                <span className="auth-input-icon">🔒</span>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  required
                  autoComplete="current-password"
                  className="auth-input"
                />
                <button
                  type="button"
                  className="auth-password-toggle"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label="Toggle password visibility"
                >
                  {showPassword ? '🙈' : '👁'}
                </button>
              </div>
            </div>

            <div className="auth-checkbox-group">
              <input
                type="checkbox"
                id="rememberMe"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className="auth-checkbox"
              />
              <label htmlFor="rememberMe" className="auth-checkbox-label">
                Keep me signed in for 30 days
              </label>
            </div>

            <Button type="submit" disabled={loading} className="auth-submit-btn">
              {loading ? 'Authenticating…' : 'Sign in to Dashboard →'}
            </Button>
          </form>

          <div className="auth-footer-text">
            Don't have a challenge account?{' '}
            <Link to="/register">
              Sign up now
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}

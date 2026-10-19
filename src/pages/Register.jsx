import { useState } from 'react'
import { Link, useNavigate, Navigate } from 'react-router-dom'
import Button from '../components/Button'
import { api } from '../services/api'
import { useAuth } from '../context/AuthContext'
import Logo from '../components/Logo'
import './Auth.css'

export default function Register() {
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    firstName: '',
    lastName: '',
  })
  const [agreeTerms, setAgreeTerms] = useState(true)
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const navigate = useNavigate()
  const { login, isAuthenticated } = useAuth()

  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />
  }

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value })
  }

  // Calculate password strength
  const getPasswordStrength = (pass) => {
    if (!pass) return { score: 0, label: '', color: 'var(--border)' }
    let score = 0
    if (pass.length >= 6) score += 1
    if (pass.length >= 10) score += 1
    if (/[A-Z]/.test(pass) && /[0-9]/.test(pass)) score += 1
    if (/[^A-Za-z0-9]/.test(pass)) score += 1

    if (score <= 1) return { score: 25, label: 'Weak', color: 'var(--red)' }
    if (score === 2) return { score: 50, label: 'Fair', color: '#E4C24A' }
    if (score === 3) return { score: 75, label: 'Good', color: 'var(--brass)' }
    return { score: 100, label: 'Strong', color: 'var(--green)' }
  }

  const strength = getPasswordStrength(formData.password)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!agreeTerms) {
      setError('You must agree to the Terms of Service & Risk Disclosure.')
      return
    }
    setError('')
    setLoading(true)

    try {
      const response = await api.register(formData)

      if (response.token) {
        login(response.user, response.token)
        navigate('/dashboard', { replace: true })
      } else {
        setError(response.error || 'Registration failed. Email may already be registered.')
      }
    } catch {
      setError('Connection error. Please try again.')
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
            Start your evaluation. <em>Funded capital</em> awaits.
          </div>
          <p className="auth-brand-desc">
            Join thousands of active traders scaling capital with zero risk to personal savings. Pure execution, direct payouts.
          </p>

          <div className="auth-highlight-card">
            <div className="auth-highlight-quote">
              "STAKEUP's risk parameters are clear and fair. Passed the $100K challenge on day 14 and scaling up my account size now."
            </div>
            <div className="auth-highlight-author">
              <div className="auth-author-avatar">AT</div>
              <div className="auth-author-info">
                <b>Amara T.</b>
                <span>Funded Trader · $10,000 Tier</span>
              </div>
            </div>
          </div>
        </div>

        <div className="auth-brand-stats">
          <div className="auth-brand-stat">
            <b>Instant</b>
            <span>Account Setup</span>
          </div>
          <div className="auth-brand-stat">
            <b>30 Days</b>
            <span>Challenge Window</span>
          </div>
          <div className="auth-brand-stat">
            <b>0%</b>
            <span>Profit Recapture</span>
          </div>
        </div>
      </div>

      {/* Right Form Panel */}
      <div className="auth-form-panel">
        <div className="auth-form-card">
          <div className="auth-form-header">
            <h2>Create your account</h2>
            <p>Get started with your STAKEUP trader evaluation</p>
          </div>

          <div className="auth-social-btns">
            <button className="auth-social-btn" type="button" onClick={() => setError('Demo mode: Please fill out the registration form below.')}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12.545,10.239v3.821h5.445c-0.712,2.315-2.647,3.972-5.445,3.972c-3.332,0-6.033-2.701-6.033-6.032s2.701-6.032,6.033-6.032c1.498,0,2.866,0.549,3.921,1.453l2.814-2.814C17.503,2.988,15.139,2,12.545,2C7.021,2,2.543,6.477,2.543,12s4.478,10,10.002,10c8.396,0,10.249-7.85,9.426-11.761H12.545z"/>
              </svg>
              Google
            </button>
            <button className="auth-social-btn" type="button" onClick={() => setError('Demo mode: Please fill out the registration form below.')}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M15.97 6.32c.67-.82 1.13-1.96.99-3.11-1 .04-2.22.67-2.92 1.49-.63.73-1.18 1.9-1.03 3.03 1.12.09 2.27-.58 2.96-1.41z"/>
              </svg>
              Apple
            </button>
          </div>

          <div className="auth-divider">
            <span>or register with email</span>
          </div>

          {error && (
            <div className="auth-error-alert">
              <span>⚠️</span>
              <div>{error}</div>
            </div>
          )}

          <form onSubmit={handleSubmit}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
              <div className="auth-input-group">
                <label className="auth-label">First Name</label>
                <div className="auth-input-wrapper">
                  <span className="auth-input-icon">👤</span>
                  <input
                    type="text"
                    name="firstName"
                    value={formData.firstName}
                    onChange={handleChange}
                    placeholder="Alex"
                    required
                    autoComplete="given-name"
                    className="auth-input"
                  />
                </div>
              </div>

              <div className="auth-input-group">
                <label className="auth-label">Last Name</label>
                <div className="auth-input-wrapper">
                  <span className="auth-input-icon">👤</span>
                  <input
                    type="text"
                    name="lastName"
                    value={formData.lastName}
                    onChange={handleChange}
                    placeholder="Rivera"
                    required
                    autoComplete="family-name"
                    className="auth-input"
                  />
                </div>
              </div>
            </div>

            <div className="auth-input-group">
              <label className="auth-label">Email Address</label>
              <div className="auth-input-wrapper">
                <span className="auth-input-icon">✉</span>
                <input
                  type="email"
                  name="email"
                  value={formData.email}
                  onChange={handleChange}
                  placeholder="alex@example.com"
                  required
                  autoComplete="email"
                  className="auth-input"
                />
              </div>
            </div>

            <div className="auth-input-group">
              <label className="auth-label">Password</label>
              <div className="auth-input-wrapper">
                <span className="auth-input-icon">🔒</span>
                <input
                  type={showPassword ? 'text' : 'password'}
                  name="password"
                  value={formData.password}
                  onChange={handleChange}
                  placeholder="Min. 6 characters"
                  required
                  minLength="6"
                  autoComplete="new-password"
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

              {formData.password && (
                <div className="auth-strength-meter">
                  <div className="auth-strength-bar-bg">
                    <div 
                      className="auth-strength-bar-fill" 
                      style={{ width: `${strength.score}%`, backgroundColor: strength.color }}
                    />
                  </div>
                  <div className="auth-strength-text" style={{ color: strength.color }}>
                    Password Strength: {strength.label}
                  </div>
                </div>
              )}
            </div>

            <div className="auth-checkbox-group">
              <input
                type="checkbox"
                id="agreeTerms"
                checked={agreeTerms}
                onChange={(e) => setAgreeTerms(e.target.checked)}
                className="auth-checkbox"
                required
              />
              <label htmlFor="agreeTerms" className="auth-checkbox-label">
                I agree to the <a href="#terms" onClick={(e) => e.preventDefault()}>Terms of Service</a> & <a href="#risk" onClick={(e) => e.preventDefault()}>Risk Disclosure</a>
              </label>
            </div>

            <Button type="submit" disabled={loading} className="auth-submit-btn">
              {loading ? 'Creating Account…' : 'Create Trader Account →'}
            </Button>
          </form>

          <div className="auth-footer-text">
            Already have an account?{' '}
            <Link to="/login">
              Sign in
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}

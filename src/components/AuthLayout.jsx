import { Outlet, Link, useLocation, Navigate } from 'react-router-dom'
import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import Logo from './Logo'
import './AuthLayout.css'

export default function AuthLayout() {
  const location = useLocation()
  const { isAuthenticated, loading, user, logout } = useAuth()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  if (loading) return null  // safety net

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  const navItems = [
    { path: '/dashboard', icon: '◆', label: 'Dashboard' },
    { path: '/trade',     icon: '📈', label: 'Trading Desk' },
    { path: '/checkout',  icon: '⚡', label: 'Challenges' },
    { path: '/rules',     icon: '⚙', label: 'Rules' },
    { path: '/payouts',   icon: '$', label: 'Payouts' },
  ]

  const initials = user
    ? `${(user.firstName || '')[0] || ''}${(user.lastName || '')[0] || ''}`.toUpperCase()
    : 'TR'

  const close = () => setMobileMenuOpen(false)

  return (
    <div className="app">
      {/* Backdrop — tapping it closes the menu */}
      {mobileMenuOpen && (
        <div className="mobile-backdrop" onClick={close} />
      )}

      <aside className={`sidebar ${mobileMenuOpen ? 'mobile-open' : ''}`}>
        <Link to="/dashboard" onClick={close} style={{ textDecoration: 'none', padding: '0 10px 26px', display: 'block' }}>
          <Logo size="small" />
        </Link>

        <nav className="sb-nav">
          {navItems.map((item) => (
            <Link
              key={item.path}
              to={item.path}
              className={`sb-link ${location.pathname === item.path ? 'active' : ''}`}
              onClick={close}
            >
              <span className="ic">{item.icon}</span>
              {item.label}
            </Link>
          ))}
          {user?.role === 'admin' && (
            <Link
              to="/admin/dashboard"
              className="sb-link"
              onClick={close}
              style={{ marginTop: '12px', border: '1px solid rgba(201,162,39,0.3)', background: 'rgba(201,162,39,0.08)', color: 'var(--brass)' }}
            >
              <span className="ic">👑</span>
              Admin Console
            </Link>
          )}
        </nav>

        <div className="sb-foot">
          <div className="av">{initials}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <b>{user ? `${user.firstName} ${user.lastName}` : 'Trader'}</b>
            <span>{user?.email}</span>
          </div>
          <button
            onClick={() => { logout(); close() }}
            title="Log out"
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--text-faint)',
              fontSize: '18px',
              padding: '4px 6px',
              lineHeight: 1,
              flexShrink: 0,
            }}
          >
            ⏻
          </button>
        </div>
      </aside>

      <main className="main">
        <Outlet />
      </main>

      {/* Floating hamburger button — mobile only */}
      <button
        className={`mobile-toggle ${mobileMenuOpen ? 'is-open' : ''}`}
        onClick={() => setMobileMenuOpen(v => !v)}
        aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}
      >
        <span></span>
        <span></span>
        <span></span>
      </button>
    </div>
  )
}

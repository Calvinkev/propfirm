import { Outlet, Link, useLocation, Navigate } from 'react-router-dom'
import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import Logo from './Logo'
import './AdminLayout.css'

export default function AdminLayout() {
  const location = useLocation()
  const { isAuthenticated, isAdmin, loading, user, logout } = useAuth()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  if (loading) return null   // safety net

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  if (!isAdmin) {
    return <Navigate to="/dashboard" replace />
  }

  const navItems = [
    { path: '/admin/dashboard', icon: '◆', label: 'Dashboard' },
    { path: '/admin/users', icon: '👤', label: 'Users' },
    { path: '/admin/challenges', icon: '⚡', label: 'Challenges' },
    { path: '/admin/payouts', icon: '$', label: 'Payouts' },
    { path: '/admin/trades', icon: '📊', label: 'Trades' },
    { path: '/admin/settings', icon: '⚙', label: 'Settings' },
  ]

  const initials = user
    ? `${(user.firstName || '')[0] || ''}${(user.lastName || '')[0] || ''}`.toUpperCase()
    : 'AD'

  return (
    <div className="admin-app">
      <aside className={`admin-sidebar ${mobileMenuOpen ? 'mobile-open' : ''}`}>
        <Link to="/admin/dashboard" onClick={() => setMobileMenuOpen(false)} style={{ textDecoration: 'none', padding: '0 10px 26px', display: 'block' }}>
          <Logo size="small" admin />
        </Link>
        <nav className="admin-nav">
          {navItems.map((item) => (
            <Link
              key={item.path}
              to={item.path}
              className={`admin-link ${location.pathname === item.path ? 'active' : ''}`}
              onClick={() => setMobileMenuOpen(false)}
            >
              <span className="ic">{item.icon}</span>
              {item.label}
            </Link>
          ))}
          <Link
            to="/dashboard"
            className="admin-link"
            onClick={() => setMobileMenuOpen(false)}
            style={{ marginTop: '16px', color: 'var(--text-muted)', borderTop: '1px solid var(--border-soft)', paddingTop: '12px' }}
          >
            <span className="ic">←</span>
            Trader View
          </Link>
        </nav>
        <div className="admin-foot">
          <div className="av">{initials}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <b>{user ? `${user.firstName} ${user.lastName}` : 'Admin'}</b>
            <span>Super Admin</span>
          </div>
          <button
            onClick={logout}
            title="Log out"
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--text-faint)',
              fontSize: '16px',
              padding: '4px',
              display: 'flex',
              alignItems: 'center',
            }}
          >
            ⏻
          </button>
        </div>
        <button
          className="mobile-toggle"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          aria-label="Toggle menu"
        >
          <span></span>
        </button>
      </aside>
      <main className="admin-main">
        <Outlet />
      </main>
    </div>
  )
}

import { Outlet, Link, useLocation, Navigate } from 'react-router-dom'
import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import Logo from './Logo'
import Icon from './Icon'
import './AdminLayout.css'

const NAV_ITEMS = [
  { path: '/admin/dashboard', iconName: 'home',         label: 'Dashboard' },
  { path: '/admin/users',     iconName: 'users',        label: 'Users' },
  { path: '/admin/payouts',   iconName: 'currency',     label: 'Payouts' },
  { path: '/admin/trades',    iconName: 'chartBar',     label: 'Trades' },
  { path: '/admin/settings',  iconName: 'settings',     label: 'Settings' },
]

export default function AdminLayout() {
  const location = useLocation()
  const { isAuthenticated, isAdmin, loading, user, logout } = useAuth()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  if (loading) return null
  if (!isAuthenticated) return <Navigate to="/login" state={{ from: location }} replace />
  if (!isAdmin) return <Navigate to="/portfolio" replace />

  const initials = user
    ? `${(user.firstName || '')[0] || ''}${(user.lastName || '')[0] || ''}`.toUpperCase()
    : 'AD'

  return (
    <div className="admin-app">
      <aside className={`admin-sidebar ${mobileMenuOpen ? 'mobile-open' : ''}`}>
        <Link to="/admin/dashboard" onClick={() => setMobileMenuOpen(false)}
          style={{ textDecoration: 'none', padding: '0 10px 26px', display: 'block' }}>
          <Logo size="small" admin />
        </Link>

        <nav className="admin-nav">
          {NAV_ITEMS.map(item => (
            <Link key={item.path} to={item.path}
              className={`admin-link ${location.pathname === item.path ? 'active' : ''}`}
              onClick={() => setMobileMenuOpen(false)}>
              <span className="ic"><Icon name={item.iconName} size={16} /></span>
              {item.label}
            </Link>
          ))}
          <Link to="/portfolio" className="admin-link" onClick={() => setMobileMenuOpen(false)}
            style={{ marginTop: '16px', color: 'var(--text-muted)', borderTop: '1px solid var(--border-soft)', paddingTop: '12px' }}>
            <span className="ic"><Icon name="arrowRight" size={16} /></span>
            Trader View
          </Link>
        </nav>

        <div className="admin-foot">
          <div className="av">{initials}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <b>{user ? `${user.firstName} ${user.lastName}` : 'Admin'}</b>
            <span>Super Admin</span>
          </div>
          <button onClick={logout} title="Log out"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-faint)', padding: '4px', display: 'flex', alignItems: 'center' }}>
            <Icon name="powerOff" size={16} />
          </button>
        </div>

        <button className="mobile-toggle" onClick={() => setMobileMenuOpen(!mobileMenuOpen)} aria-label="Toggle menu">
          <span></span>
        </button>
      </aside>

      <main className="admin-main">
        <Outlet />
      </main>
    </div>
  )
}

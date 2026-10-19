import { Outlet, Link, useLocation, Navigate } from 'react-router-dom'
import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import Logo from './Logo'
import './AuthLayout.css'

export default function AuthLayout() {
  const location = useLocation()
  const { isAuthenticated, loading, user, logout } = useAuth()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  if (loading) return null

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  const navItems = [
    { path: '/markets', label: 'Markets' },
    { path: '/trade', label: 'Spot Trade' },
    { path: '/wallet', label: 'Wallet & Assets' },
  ]

  const close = () => setMobileMenuOpen(false)

  return (
    <div className="binance-app">
      <header className="binance-navbar">
        <div className="nav-left">
          <Link to="/trade" className="brand-link" onClick={close}>
            <Logo size="small" />
            <span className="brand-title">STAKEUP <span className="spot-tag">SPOT</span></span>
          </Link>
          <nav className="nav-links desktop-only">
            {navItems.map((item) => (
              <Link
                key={item.path}
                to={item.path}
                className={`nav-link ${location.pathname === item.path ? 'active' : ''}`}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>

        <div className="nav-right desktop-only">
          <Link to="/wallet" className="deposit-btn">
            Deposit
          </Link>
          <div className="user-profile-menu">
            <span className="user-name">{user?.firstName} {user?.lastName}</span>
            <span className="user-email">{user?.email}</span>
          </div>

          {user?.role === 'admin' && (
            <Link to="/admin/dashboard" className="admin-badge">
              👑 Admin
            </Link>
          )}

          <button onClick={logout} className="logout-btn" title="Log out">
            ⏻ Exit
          </button>
        </div>

        <button
          className="mobile-hamburger"
          onClick={() => setMobileMenuOpen(v => !v)}
          aria-label="Toggle Navigation"
        >
          ☰
        </button>
      </header>

      {mobileMenuOpen && (
        <div className="mobile-dropdown">
          {navItems.map((item) => (
            <Link
              key={item.path}
              to={item.path}
              className={`mobile-nav-link ${location.pathname === item.path ? 'active' : ''}`}
              onClick={close}
            >
              {item.label}
            </Link>
          ))}
          <Link to="/wallet" className="mobile-nav-link deposit" onClick={close}>
            ⚡ Deposit Crypto
          </Link>
          {user?.role === 'admin' && (
            <Link to="/admin/dashboard" className="mobile-nav-link admin" onClick={close}>
              👑 Admin Console
            </Link>
          )}
          <button onClick={() => { logout(); close() }} className="mobile-logout">
            Log Out
          </button>
        </div>
      )}

      <main className="binance-main">
        <Outlet />
      </main>
    </div>
  )
}

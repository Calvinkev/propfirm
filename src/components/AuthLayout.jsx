import { Outlet, Link, useLocation, Navigate } from 'react-router-dom'
import { useState, useRef, useCallback } from 'react'
import { useAuth } from '../context/AuthContext'
import Logo from './Logo'
import './AuthLayout.css'

const NAV_GROUPS = [
  {
    label: 'Markets',
    path: '/markets',
    single: true,
  },
  {
    label: 'Trade',
    children: [
      { path: '/trade',   label: 'Spot Trade',    icon: '📊', desc: 'Buy & sell crypto instantly' },
      { path: '/futures', label: 'Futures',        icon: '📈', desc: 'Trade with leverage up to 125x' },
      { path: '/convert', label: 'Convert',        icon: '🔄', desc: 'Instant crypto swaps' },
    ],
  },
  {
    label: 'Earn',
    path: '/earn',
    single: true,
  },
  {
    label: 'Orders',
    path: '/orders',
    single: true,
  },
]

export default function AuthLayout() {
  const location = useLocation()
  const { isAuthenticated, loading, user, logout } = useAuth()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [openDropdown, setOpenDropdown] = useState(null)
  const closeTimer = useRef(null)

  const handleMouseEnter = useCallback((key) => {
    if (closeTimer.current) clearTimeout(closeTimer.current)
    setOpenDropdown(key)
  }, [])

  const handleMouseLeave = useCallback(() => {
    closeTimer.current = setTimeout(() => setOpenDropdown(null), 120)
  }, [])

  if (loading) return null
  if (!isAuthenticated) return <Navigate to="/login" state={{ from: location }} replace />

  const close = () => { setMobileOpen(false); setOpenDropdown(null) }
  const isActive = (path) => location.pathname === path
  const isGroupActive = (group) => group.children?.some(c => isActive(c.path))

  return (
    <div className="binance-app">
      <header className="binance-navbar">
        <div className="nav-left">
          <Link to="/portfolio" className="brand-link" onClick={close}>
            <Logo size="small" />
            <span className="brand-title">STAKEUP <span className="spot-tag">PRO</span></span>
          </Link>

          <nav className="nav-links desktop-only">
            {NAV_GROUPS.map(group => (
              group.single ? (
                <Link
                  key={group.path}
                  to={group.path}
                  className={`nav-link ${isActive(group.path) ? 'active' : ''}`}
                >
                  {group.label}
                </Link>
              ) : (
                <div
                  key={group.label}
                  className="nav-dropdown-wrap"
                  onMouseEnter={() => handleMouseEnter(group.label)}
                  onMouseLeave={handleMouseLeave}
                >
                  <button className={`nav-link nav-dropdown-trigger ${isGroupActive(group) ? 'active' : ''}`}>
                    {group.label} <span className="nav-caret">▾</span>
                  </button>
                  {openDropdown === group.label && (
                    <div className="nav-dropdown-menu">
                      {group.children.map(item => (
                        <Link
                          key={item.path}
                          to={item.path}
                          className={`nav-dropdown-item ${isActive(item.path) ? 'active' : ''}`}
                          onClick={() => setOpenDropdown(null)}
                        >
                          <span className="ndi-icon">{item.icon}</span>
                          <div className="ndi-text">
                            <b>{item.label}</b>
                            <span>{item.desc}</span>
                          </div>
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              )
            ))}
          </nav>
        </div>

        <div className="nav-right desktop-only">
          <Link to="/wallet" className="deposit-btn">Deposit</Link>

          {/* Notification Bell */}
          <Link to="/notifications" className="notif-bell" title="Notifications">
            🔔
          </Link>

          {/* User dropdown */}
          <div
            className="nav-dropdown-wrap"
            onMouseEnter={() => handleMouseEnter('user')}
            onMouseLeave={handleMouseLeave}
          >
            <div className="user-profile-menu" style={{ cursor: 'pointer' }}>
              <span className="user-name">{user?.firstName} {user?.lastName}</span>
              <span className="user-email">{user?.email}</span>
            </div>
            {openDropdown === 'user' && (
              <div className="nav-dropdown-menu nav-dropdown-right">
                <Link to="/portfolio"   className="nav-dropdown-item" onClick={() => { if(closeTimer.current) clearTimeout(closeTimer.current); setOpenDropdown(null) }}><span className="ndi-icon">📊</span><div className="ndi-text"><b>Portfolio</b><span>Total balance overview</span></div></Link>
                <Link to="/wallet"      className="nav-dropdown-item" onClick={() => { if(closeTimer.current) clearTimeout(closeTimer.current); setOpenDropdown(null) }}><span className="ndi-icon">💼</span><div className="ndi-text"><b>Wallet</b><span>Deposit & withdraw</span></div></Link>
                <Link to="/orders"      className="nav-dropdown-item" onClick={() => { if(closeTimer.current) clearTimeout(closeTimer.current); setOpenDropdown(null) }}><span className="ndi-icon">📋</span><div className="ndi-text"><b>Order History</b><span>All your trades & orders</span></div></Link>
                <Link to="/earn"        className="nav-dropdown-item" onClick={() => { if(closeTimer.current) clearTimeout(closeTimer.current); setOpenDropdown(null) }}><span className="ndi-icon">💰</span><div className="ndi-text"><b>Earn</b><span>Simple earn & staking</span></div></Link>
                <Link to="/referral"    className="nav-dropdown-item" onClick={() => { if(closeTimer.current) clearTimeout(closeTimer.current); setOpenDropdown(null) }}><span className="ndi-icon">🎁</span><div className="ndi-text"><b>Referral</b><span>Invite friends, earn fees</span></div></Link>
                <Link to="/profile"     className="nav-dropdown-item" onClick={() => { if(closeTimer.current) clearTimeout(closeTimer.current); setOpenDropdown(null) }}><span className="ndi-icon">👤</span><div className="ndi-text"><b>Profile & Security</b><span>Account settings</span></div></Link>
                {user?.role === 'admin' && (
                  <Link to="/admin/dashboard" className="nav-dropdown-item" onClick={() => { if(closeTimer.current) clearTimeout(closeTimer.current); setOpenDropdown(null) }}><span className="ndi-icon">👑</span><div className="ndi-text"><b>Admin Console</b><span>Manage platform</span></div></Link>
                )}
                <div className="nav-dropdown-divider" />
                <button className="nav-dropdown-logout" onClick={() => { logout(); setOpenDropdown(null) }}>⏻ Log Out</button>
              </div>
            )}
          </div>
        </div>

        <button
          className="mobile-hamburger"
          onClick={() => setMobileOpen(v => !v)}
          aria-label="Toggle Navigation"
        >
          {mobileOpen ? '✕' : '☰'}
        </button>
      </header>

      {/* Mobile Menu */}
      {mobileOpen && (
        <div className="mobile-dropdown">
          <div className="mobile-section-label">Markets & Trade</div>
          <Link to="/markets"  className={`mobile-nav-link ${isActive('/markets') ? 'active' : ''}`} onClick={close}>📉 Markets</Link>
          <Link to="/trade"    className={`mobile-nav-link ${isActive('/trade') ? 'active' : ''}`} onClick={close}>📊 Spot Trade</Link>
          <Link to="/futures"  className={`mobile-nav-link ${isActive('/futures') ? 'active' : ''}`} onClick={close}>📈 Futures</Link>
          <Link to="/convert"  className={`mobile-nav-link ${isActive('/convert') ? 'active' : ''}`} onClick={close}>🔄 Convert</Link>

          <div className="mobile-section-label">My Account</div>
          <Link to="/portfolio"     className={`mobile-nav-link ${isActive('/portfolio') ? 'active' : ''}`} onClick={close}>📊 Portfolio</Link>
          <Link to="/wallet"        className={`mobile-nav-link ${isActive('/wallet') ? 'active' : ''}`} onClick={close}>💼 Wallet</Link>
          <Link to="/earn"          className={`mobile-nav-link ${isActive('/earn') ? 'active' : ''}`} onClick={close}>💰 Earn</Link>
          <Link to="/orders"        className={`mobile-nav-link ${isActive('/orders') ? 'active' : ''}`} onClick={close}>📋 Order History</Link>
          <Link to="/notifications" className={`mobile-nav-link ${isActive('/notifications') ? 'active' : ''}`} onClick={close}>🔔 Notifications</Link>
          <Link to="/referral"      className={`mobile-nav-link ${isActive('/referral') ? 'active' : ''}`} onClick={close}>🎁 Referral</Link>
          <Link to="/profile"       className={`mobile-nav-link ${isActive('/profile') ? 'active' : ''}`} onClick={close}>👤 Profile</Link>

          <Link to="/wallet" className="mobile-nav-link deposit" onClick={close}>⚡ Deposit Crypto</Link>

          {user?.role === 'admin' && (
            <Link to="/admin/dashboard" className="mobile-nav-link admin" onClick={close}>👑 Admin Console</Link>
          )}
          <button onClick={() => { logout(); close() }} className="mobile-logout">Log Out</button>
        </div>
      )}

      <main className="binance-main">
        <Outlet />
      </main>
    </div>
  )
}

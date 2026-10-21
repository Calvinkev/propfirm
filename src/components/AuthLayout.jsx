import { Outlet, Link, useLocation, Navigate } from 'react-router-dom'
import { useState, useRef, useCallback } from 'react'
import { useAuth } from '../context/AuthContext'
import Logo from './Logo'
import Icon from './Icon'
import './AuthLayout.css'

const NAV_GROUPS = [
  { label: 'Markets', path: '/markets', single: true },
  {
    label: 'Trade',
    children: [
      { path: '/trade',   label: 'Spot Trade', iconName: 'chartBar',    desc: 'Buy & sell crypto instantly' },
      { path: '/futures', label: 'Futures',    iconName: 'trendingUp',  desc: 'Trade with leverage up to 125x' },
      { path: '/convert', label: 'Convert',    iconName: 'arrowsSwap',  desc: 'Instant crypto swaps' },
    ],
  },
  { label: 'Earn',   path: '/earn',   single: true },
  { label: 'Orders', path: '/orders', single: true },
]

const USER_MENU = [
  { to: '/portfolio', iconName: 'chartBar',     label: 'Portfolio',        desc: 'Total balance overview' },
  { to: '/wallet',    iconName: 'wallet',        label: 'Wallet',           desc: 'Deposit & withdraw' },
  { to: '/orders',    iconName: 'clipboardList', label: 'Order History',    desc: 'All your trades & orders' },
  { to: '/earn',      iconName: 'sparkles',      label: 'Earn',             desc: 'Simple earn & staking' },
  { to: '/referral',  iconName: 'gift',          label: 'Referral',         desc: 'Invite friends, earn fees' },
  { to: '/profile',   iconName: 'user',          label: 'Profile & Security', desc: 'Account settings' },
]

const MOBILE_TRADE = [
  { to: '/markets',  iconName: 'trendingDown', label: 'Markets' },
  { to: '/trade',    iconName: 'chartBar',     label: 'Spot Trade' },
  { to: '/futures',  iconName: 'trendingUp',   label: 'Futures' },
  { to: '/convert',  iconName: 'arrowsSwap',   label: 'Convert' },
]

const MOBILE_ACCOUNT = [
  { to: '/portfolio',     iconName: 'chartBar',     label: 'Portfolio' },
  { to: '/wallet',        iconName: 'wallet',        label: 'Wallet' },
  { to: '/earn',          iconName: 'sparkles',      label: 'Earn' },
  { to: '/orders',        iconName: 'clipboardList', label: 'Order History' },
  { to: '/notifications', iconName: 'bell',          label: 'Notifications' },
  { to: '/referral',      iconName: 'gift',          label: 'Referral' },
  { to: '/profile',       iconName: 'user',          label: 'Profile' },
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
  const clearAndClose = () => { if (closeTimer.current) clearTimeout(closeTimer.current); setOpenDropdown(null) }

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
                <Link key={group.path} to={group.path}
                  className={`nav-link ${isActive(group.path) ? 'active' : ''}`}>
                  {group.label}
                </Link>
              ) : (
                <div key={group.label} className="nav-dropdown-wrap"
                  onMouseEnter={() => handleMouseEnter(group.label)}
                  onMouseLeave={handleMouseLeave}>
                  <button className={`nav-link nav-dropdown-trigger ${isGroupActive(group) ? 'active' : ''}`}>
                    {group.label}
                    <Icon name="chevronDown" size={12} className="nav-caret-icon" />
                  </button>
                  {openDropdown === group.label && (
                    <div className="nav-dropdown-menu">
                      {group.children.map(item => (
                        <Link key={item.path} to={item.path}
                          className={`nav-dropdown-item ${isActive(item.path) ? 'active' : ''}`}
                          onClick={clearAndClose}>
                          <span className="ndi-icon"><Icon name={item.iconName} size={18} /></span>
                          <div className="ndi-text"><b>{item.label}</b><span>{item.desc}</span></div>
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

          <Link to="/notifications" className="notif-bell" title="Notifications">
            <Icon name="bell" size={18} />
          </Link>

          <div className="nav-dropdown-wrap"
            onMouseEnter={() => handleMouseEnter('user')}
            onMouseLeave={handleMouseLeave}>
            <div className="user-profile-menu" style={{ cursor: 'pointer' }}>
              <span className="user-name">{user?.firstName} {user?.lastName}</span>
              <span className="user-email">{user?.email}</span>
            </div>
            {openDropdown === 'user' && (
              <div className="nav-dropdown-menu nav-dropdown-right">
                {USER_MENU.map(item => (
                  <Link key={item.to} to={item.to} className="nav-dropdown-item" onClick={clearAndClose}>
                    <span className="ndi-icon"><Icon name={item.iconName} size={18} /></span>
                    <div className="ndi-text"><b>{item.label}</b><span>{item.desc}</span></div>
                  </Link>
                ))}
                {user?.role === 'admin' && (
                  <Link to="/admin/dashboard" className="nav-dropdown-item" onClick={clearAndClose}>
                    <span className="ndi-icon"><Icon name="crown" size={18} /></span>
                    <div className="ndi-text"><b>Admin Console</b><span>Manage platform</span></div>
                  </Link>
                )}
                <div className="nav-dropdown-divider" />
                <button className="nav-dropdown-logout" onClick={() => { logout(); clearAndClose() }}>
                  <Icon name="powerOff" size={15} />
                  Log Out
                </button>
              </div>
            )}
          </div>
        </div>

        <button className="mobile-hamburger" onClick={() => setMobileOpen(v => !v)} aria-label="Toggle Navigation">
          <Icon name={mobileOpen ? 'close' : 'menu'} size={22} />
        </button>
      </header>

      {mobileOpen && (
        <div className="mobile-dropdown">
          <div className="mobile-section-label">Markets & Trade</div>
          {MOBILE_TRADE.map(item => (
            <Link key={item.to} to={item.to}
              className={`mobile-nav-link ${isActive(item.to) ? 'active' : ''}`}
              onClick={close}>
              <Icon name={item.iconName} size={16} className="mobile-nav-icon" />
              {item.label}
            </Link>
          ))}

          <div className="mobile-section-label">My Account</div>
          {MOBILE_ACCOUNT.map(item => (
            <Link key={item.to} to={item.to}
              className={`mobile-nav-link ${isActive(item.to) ? 'active' : ''}`}
              onClick={close}>
              <Icon name={item.iconName} size={16} className="mobile-nav-icon" />
              {item.label}
            </Link>
          ))}

          <Link to="/wallet" className="mobile-nav-link deposit" onClick={close}>
            <Icon name="deposit" size={16} className="mobile-nav-icon" />
            Deposit Crypto
          </Link>

          {user?.role === 'admin' && (
            <Link to="/admin/dashboard" className="mobile-nav-link admin" onClick={close}>
              <Icon name="crown" size={16} className="mobile-nav-icon" />
              Admin Console
            </Link>
          )}
          <button onClick={() => { logout(); close() }} className="mobile-logout">
            <Icon name="powerOff" size={15} className="mobile-nav-icon" />
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

import { Link, useLocation } from 'react-router-dom'
import './MobileBottomNav.css'

const NAV_ITEMS = [
  { to: '/portfolio', label: 'Home', icon: 'home' },
  { to: '/markets', label: 'Markets', icon: 'chart' },
  { to: '/trade', label: 'Trade', icon: 'swap' },
  { to: '/wallet', label: 'Finance', icon: 'wallet' },
  { to: '/portfolio', label: 'Assets', icon: 'pie' },
]

const ICONS = {
  home: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <polyline points="9 22 9 12 15 12 15 22" />
    </svg>
  ),
  chart: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
    </svg>
  ),
  swap: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <polyline points="17 1 21 5 17 9" />
      <path d="M3 11V9a4 4 0 0 1 4-4h14" />
      <polyline points="7 23 3 19 7 15" />
      <path d="M21 13v2a4 4 0 0 1-4 4H3" />
    </svg>
  ),
  wallet: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="1" y="4" width="22" height="16" rx="2" ry="2" />
      <line x1="1" y1="10" x2="23" y2="10" />
    </svg>
  ),
  pie: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M21.21 15.89A10 10 0 1 1 8 2.83" />
      <path d="M22 12A10 10 0 0 0 12 2v10z" />
    </svg>
  ),
}

export default function MobileBottomNav() {
  const location = useLocation()

  return (
    <nav className="mobile-bottom-nav">
      {NAV_ITEMS.map(item => {
        const isActive = location.pathname === item.to
        return (
          <Link
            key={item.to}
            to={item.to}
            className={`mobile-nav-item ${isActive ? 'active' : ''}`}
          >
            <span className="mobile-nav-icon">{ICONS[item.icon]}</span>
            <span className="mobile-nav-label">{item.label}</span>
          </Link>
        )
      })}
    </nav>
  )
}

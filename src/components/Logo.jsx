import logoImg from '../assets/stakeup-logo.png'
import './Logo.css'

export default function Logo({ size = 'medium', showText = true, className = '', style = {}, admin = false }) {
  return (
    <div className={`brand-logo logo-${size} ${className}`} style={style}>
      <img src={logoImg} alt="STAKEUP" className="brand-logo-img" />
      {showText && (
        <span className="brand-logo-text">
          STAKE<em className="brand-logo-em">UP</em>
        </span>
      )}
      {admin && <span className="admin-badge">ADMIN</span>}
    </div>
  )
}

import './Eyebrow.css'

export default function Eyebrow({ children, className = '' }) {
  return (
    <div className={`eyebrow ${className}`}>
      {children}
    </div>
  )
}

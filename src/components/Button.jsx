import './Button.css'

export default function Button({ children, variant = 'brass', className = '', ...props }) {
  return (
    <button className={`btn btn-${variant} ${className}`} {...props}>
      {children}
    </button>
  )
}

import { Link } from 'react-router-dom';
import Logo from '../components/Logo';

export default function NotFound() {
  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--base)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '24px',
      padding: '24px',
      textAlign: 'center',
      color: 'var(--text)',
    }}>
      <Logo size="medium" />
      <div style={{ fontFamily: 'var(--mono)', fontSize: '64px', fontWeight: 700, color: 'var(--border)', lineHeight: 1 }}>
        404
      </div>
      <h1 style={{ fontSize: '22px', fontWeight: 700 }}>Page Not Found</h1>
      <p style={{ color: 'var(--text-muted)', maxWidth: '360px', lineHeight: 1.6 }}>
        The page you're looking for doesn't exist or has been moved.
      </p>
      <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', justifyContent: 'center' }}>
        <Link to="/" style={{
          background: 'var(--brass)',
          color: '#000',
          fontWeight: 700,
          padding: '10px 24px',
          borderRadius: 'var(--r-md)',
          fontSize: '14px',
        }}>
          Go Home
        </Link>
        <Link to="/markets" style={{
          background: 'var(--surface-raised)',
          border: '1px solid var(--border)',
          color: 'var(--text)',
          fontWeight: 600,
          padding: '10px 24px',
          borderRadius: 'var(--r-md)',
          fontSize: '14px',
        }}>
          View Markets
        </Link>
      </div>
    </div>
  );
}

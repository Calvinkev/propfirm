import { useState, useEffect } from 'react'
import Card from '../../components/Card'
import Button from '../../components/Button'
import Icon from '../../components/Icon'
import { api } from '../../services/api'
import { useAuth } from '../../context/AuthContext'
import './AdminDashboard.css'

export default function AdminDashboard() {
  const { token } = useAuth()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [processingId, setProcessingId] = useState(null)

  const loadData = async () => {
    try {
      setLoading(true)
      const res = await api.getAdminOverview(token)
      if (res.overview) {
        setData(res)
      }
    } catch (err) {
      console.error('Failed to load admin overview:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [token])

  const handleApprovePayout = async (payoutId) => {
    try {
      setProcessingId(payoutId)
      await api.approveAdminPayout(token, payoutId, `TX-${Date.now()}`)
      await loadData()
    } catch (err) {
      console.error('Failed to approve payout:', err)
    } finally {
      setProcessingId(null)
    }
  }

  const overview = data?.overview ?? null;
  const recentActivity = data?.recentActivity || [];

  if (loading) {
    return (
      <div className="admin-dashboard">
        <div style={{ padding: '80px', textAlign: 'center', color: 'var(--text-muted)' }}>
          Loading platform overview…
        </div>
      </div>
    );
  }

  if (!overview) {
    return (
      <div className="admin-dashboard">
        <div className="admin-topbar">
          <div><h1>Admin Dashboard</h1><div className="sub">Platform overview</div></div>
          <Button variant="outline" onClick={loadData} style={{ fontSize: '12px', display:'flex', alignItems:'center', gap:6 }}>
            <Icon name="refresh" size={14} /> Retry
          </Button>
        </div>
        <div style={{ padding: '48px', textAlign: 'center', color: 'var(--text-muted)', background: 'var(--surface)', borderRadius: 'var(--r-lg)', border: '1px solid var(--border)' }}>
          <Icon name="warning" size={24} color="var(--text-faint)" />
          <p style={{ marginTop: '12px' }}>Could not load platform statistics. The backend may be unavailable.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-dashboard">
      <div className="admin-topbar">
        <div>
          <h1>Admin Dashboard</h1>
          <div className="sub">Platform overview — users, trades, payouts, and deposits</div>
        </div>
        <div className="date-filter">
          <Button variant="outline" onClick={loadData} style={{ fontSize: '12px', display:'flex', alignItems:'center', gap:6 }}>
            <Icon name="refresh" size={14} /> Refresh
          </Button>
        </div>
      </div>

      <div className="admin-grid-4">
        <Card className="admin-kpi">
          <label>Total Users</label>
          <div className="val">{(overview.totalUsers ?? 0).toLocaleString()}</div>
          <div className="delta up">Registered accounts</div>
        </Card>
        <Card className="admin-kpi">
          <label>Total Accounts</label>
          <div className="val">{(overview.totalAccounts ?? 0).toLocaleString()}</div>
          <div className="delta up">All trading accounts</div>
        </Card>
        <Card className="admin-kpi">
          <label>Pending Payouts</label>
          <div className="val">{(overview.payouts?.pendingCount ?? 0).toLocaleString()}</div>
          <div className="delta" style={{ color: 'var(--brass)' }}>Awaiting approval</div>
        </Card>
        <Card className="admin-kpi">
          <label>Total Paid Out</label>
          <div className="val">${(overview.payouts?.totalPaid ?? 0).toLocaleString()}</div>
          <div className="delta up">All time</div>
        </Card>
      </div>

      <div className="admin-grid-2">
        <Card className="admin-panel">
          <div className="panel-head">
            <h3>Payout Summary</h3>
          </div>
          <div className="revenue-meta">
            <div>
              <span>Pending Amount</span>
              <b style={{ color: 'var(--brass)' }}>${(overview.payouts?.pendingAmount ?? 0).toLocaleString()}</b>
            </div>
            <div>
              <span>Total Paid</span>
              <b style={{ color: 'var(--green)' }}>${(overview.payouts?.totalPaid ?? 0).toLocaleString()}</b>
            </div>
            <div>
              <span>Pending Requests</span>
              <b>{overview.payouts?.pendingCount ?? 0}</b>
            </div>
          </div>
        </Card>

        <Card className="admin-panel">
          <div className="panel-head">
            <h3>Quick Links</h3>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '8px' }}>
            {[
              { to: '/admin/users', label: 'Manage Users', icon: 'users' },
              { to: '/admin/payouts', label: 'Review Payouts', icon: 'currency' },
              { to: '/admin/trades', label: 'Inspect Trades', icon: 'chartBar' },
              { to: '/admin/settings', label: 'Platform Settings', icon: 'settings' },
            ].map(item => (
              <a key={item.to} href={item.to} style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 12px', borderRadius:'var(--r-md)', background:'var(--surface-raised)', border:'1px solid var(--border-soft)', color:'var(--text-muted)', fontSize:'13px', textDecoration:'none' }}>
                <Icon name={item.icon} size={15} />
                {item.label}
              </a>
            ))}
          </div>
        </Card>
      </div>

      <Card className="admin-panel">
        <div className="panel-head">
          <h3>Recent Activity</h3>
        </div>
        {recentActivity.length === 0 ? (
          <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--text-faint)' }}>
            No recent activity recorded yet.
          </div>
        ) : (
          <table className="admin-table">
            <thead>
              <tr>
                <th>User</th>
                <th>Action</th>
                <th>Account</th>
                <th>Amount</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {recentActivity.map((item) => (
                <tr key={item.id}>
                  <td>
                    <div className="user-cell">
                      <div className="user-avatar">{(item.first_name || 'U')[0]}</div>
                      <div>
                        <b>{item.first_name} {item.last_name}</b>
                        <span>{item.email}</span>
                      </div>
                    </div>
                  </td>
                  <td>{item.action}</td>
                  <td className="mono">{item.account_id}</td>
                  <td className="mono">${parseFloat(item.amount).toFixed(2)}</td>
                  <td><span className={`status-badge ${item.status.toLowerCase()}`}>{item.status}</span></td>
                  <td>
                    {item.status === 'Pending' && (
                      <Button
                        onClick={() => handleApprovePayout(item.id)}
                        disabled={processingId === item.id}
                        style={{ padding: '6px 12px', fontSize: '11px' }}
                      >
                        {processingId === item.id ? 'Approving...' : 'Approve'}
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  )
}

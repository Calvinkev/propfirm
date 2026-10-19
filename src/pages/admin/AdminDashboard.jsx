import { useState, useEffect } from 'react'
import Card from '../../components/Card'
import Button from '../../components/Button'
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

  const overview = data?.overview || {
    totalUsers: 1248,
    totalAccounts: 3426,
    activeChallenges: 2329,
    fundedAccounts: 754,
    totalRevenue: 482450,
    payouts: { pendingCount: 3, pendingAmount: 7464, totalPaid: 124500 }
  }

  const recentActivity = data?.recentActivity || []

  return (
    <div className="admin-dashboard">
      <div className="admin-topbar">
        <div>
          <h1>Admin Command Center</h1>
          <div className="sub">Platform overview, revenue analytics, and trader account controls</div>
        </div>
        <div className="date-filter">
          <Button variant="outline" onClick={loadData} style={{ fontSize: '12px' }}>
            🔄 Refresh Live Stats
          </Button>
        </div>
      </div>

      <div className="admin-grid-4">
        <Card className="admin-kpi">
          <label>Total Registered Users</label>
          <div className="val">{overview.totalUsers.toLocaleString()}</div>
          <div className="delta up">▲ Active Platform Traders</div>
        </Card>
        <Card className="admin-kpi">
          <label>Active Challenges</label>
          <div className="val">{overview.activeChallenges.toLocaleString()}</div>
          <div className="delta up">▲ Phase 1 & Phase 2 Evaluation</div>
        </Card>
        <Card className="admin-kpi">
          <label>Funded Accounts</label>
          <div className="val">{overview.fundedAccounts.toLocaleString()}</div>
          <div className="delta up">▲ 90% Profit Split Accounts</div>
        </Card>
        <Card className="admin-kpi">
          <label>Estimated Revenue</label>
          <div className="val">${overview.totalRevenue.toLocaleString()}</div>
          <div className="delta up">▲ Evaluation Fee Revenue</div>
        </Card>
      </div>

      <div className="admin-grid-2">
        <Card className="admin-panel">
          <div className="panel-head">
            <h3>Revenue Growth</h3>
            <span style={{ fontSize: '12px', color: 'var(--brass)' }}>Live Projections</span>
          </div>
          <div className="revenue-chart">
            <svg viewBox="0 0 600 200" width="100%" height="200" preserveAspectRatio="none">
              <defs>
                <linearGradient id="adminFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#C9A227" stopOpacity="0.25"/>
                  <stop offset="100%" stopColor="#C9A227" stopOpacity="0"/>
                </linearGradient>
              </defs>
              <line x1="0" y1="50" x2="600" y2="50" stroke="#26292E" strokeWidth="1"/>
              <line x1="0" y1="100" x2="600" y2="100" stroke="#26292E" strokeWidth="1"/>
              <line x1="0" y1="150" x2="600" y2="150" stroke="#26292E" strokeWidth="1"/>
              <path d="M0,160 L50,155 L100,140 L150,145 L200,120 L250,125 L300,100 L350,105 L400,80 L450,85 L500,60 L550,65 L600,40 L600,200 L0,200 Z" fill="url(#adminFill)"/>
              <path d="M0,160 L50,155 L100,140 L150,145 L200,120 L250,125 L300,100 L350,105 L400,80 L450,85 L500,60 L550,65 L600,40" fill="none" stroke="#C9A227" strokeWidth="2.5"/>
            </svg>
          </div>
          <div className="revenue-meta">
            <div>
              <span>Pending Payouts</span>
              <b style={{ color: 'var(--brass)' }}>${overview.payouts?.pendingAmount?.toLocaleString() || 0}</b>
            </div>
            <div>
              <span>Total Paid Out</span>
              <b style={{ color: 'var(--green)' }}>${overview.payouts?.totalPaid?.toLocaleString() || 0}</b>
            </div>
            <div>
              <span>Pending Requests</span>
              <b>{overview.payouts?.pendingCount || 0} Traders</b>
            </div>
          </div>
        </Card>

        <Card className="admin-panel">
          <div className="panel-head">
            <h3>Trader Account Status Breakdown</h3>
          </div>
          <div className="status-bars">
            <div className="status-item">
              <div className="status-label">
                <span className="status-dot active"></span>
                <span>Evaluation (Phase 1/2)</span>
              </div>
              <div className="status-bar">
                <div className="status-fill active" style={{width: '65%'}}></div>
              </div>
              <span className="status-count">{overview.activeChallenges}</span>
            </div>
            <div className="status-item">
              <div className="status-label">
                <span className="status-dot funded"></span>
                <span>Funded Live Traders</span>
              </div>
              <div className="status-bar">
                <div className="status-fill funded" style={{width: '25%'}}></div>
              </div>
              <span className="status-count">{overview.fundedAccounts}</span>
            </div>
            <div className="status-item">
              <div className="status-label">
                <span className="status-dot failed"></span>
                <span>Breached / Failed</span>
              </div>
              <div className="status-bar">
                <div className="status-fill failed" style={{width: '10%'}}></div>
              </div>
              <span className="status-count">{overview.failedAccounts || 69}</span>
            </div>
          </div>
        </Card>
      </div>

      <Card className="admin-panel">
        <div className="panel-head">
          <h3>Recent Payout Requests & Platform Logs</h3>
        </div>
        {recentActivity.length === 0 ? (
          <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--text-faint)' }}>
            No recent activity recorded yet.
          </div>
        ) : (
          <table className="admin-table">
            <thead>
              <tr>
                <th>Trader</th>
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
                      <div className="user-avatar">{(item.first_name || 'T')[0]}</div>
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

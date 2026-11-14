import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import Card from '../../components/Card'
import { api } from '../../services/api'
import { useAuth } from '../../context/AuthContext'
import './AdminPages.css'

export default function AdminDashboard() {
  const { token } = useAuth()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  const load = async () => {
    setLoading(true)
    try {
      const res = await api.getAdminOverview(token)
      if (res.stats) setData(res)
    } catch (err) { console.error(err) }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [token])

  const s = data?.stats || {}
  const recent = data?.recentDeposits || []

  return (
    <div className="admin-page">
      <div className="admin-topbar">
        <div>
          <h1>Admin Dashboard</h1>
          <div className="sub">Platform overview</div>
        </div>
        <button className="adm-refresh-btn" onClick={load}>↻ Refresh</button>
      </div>

      {loading ? <div className="adm-loading">Loading…</div> : (
        <>
          <div className="admin-grid-4">
            <Card className="admin-kpi">
              <label>Total Users</label>
              <div className="val">{s.totalUsers ?? 0}</div>
              <div className="delta up">Registered traders</div>
            </Card>
            <Card className="admin-kpi">
              <label>Pending Deposits</label>
              <div className="val" style={{ color: 'var(--brass)' }}>{s.pendingDeposits ?? 0}</div>
              <div className="delta">Awaiting approval</div>
            </Card>
            <Card className="admin-kpi">
              <label>Pending Withdrawals</label>
              <div className="val" style={{ color: '#F59E0B' }}>{s.pendingWithdrawals ?? 0}</div>
              <div className="delta">Awaiting processing</div>
            </Card>
            <Card className="admin-kpi">
              <label>Quick Trade Profit Paid</label>
              <div className="val" style={{ color: 'var(--green)' }}>${parseFloat(s.quickTradeProfit ?? 0).toFixed(2)}</div>
              <div className="delta up">Total winnings issued</div>
            </Card>
          </div>

          <div className="admin-grid-2" style={{ marginTop: 20 }}>
            <Card className="admin-panel">
              <div className="panel-head"><h3>Quick Links</h3></div>
              <div className="adm-quick-links">
                {[
                  { to: '/admin/deposits',     label: '📥 Approve Deposits',      badge: s.pendingDeposits },
                  { to: '/admin/withdrawals',  label: '📤 Process Withdrawals',   badge: s.pendingWithdrawals },
                  { to: '/admin/users',        label: '👥 Manage Users' },
                  { to: '/admin/wallets',      label: '💳 Deposit Wallets' },
                  { to: '/admin/transactions', label: '📊 Transactions' },
                ].map(item => (
                  <Link key={item.to} to={item.to} className="adm-quick-link">
                    {item.label}
                    {item.badge > 0 && <span className="adm-badge">{item.badge}</span>}
                  </Link>
                ))}
              </div>
            </Card>

            <Card className="admin-panel">
              <div className="panel-head"><h3>Recent Deposits</h3></div>
              {recent.length === 0
                ? <div className="adm-empty">No deposits yet</div>
                : <table className="admin-table">
                    <thead><tr><th>User</th><th>Coin</th><th>Amount</th><th>Status</th></tr></thead>
                    <tbody>
                      {recent.map(d => (
                        <tr key={d.id}>
                          <td><div className="user-cell"><div className="user-avatar">{d.first_name[0]}</div><span>{d.first_name} {d.last_name}</span></div></td>
                          <td className="mono">{d.coin}</td>
                          <td className="mono">{parseFloat(d.amount).toFixed(4)}</td>
                          <td><span className={`status-badge ${d.status.toLowerCase()}`}>{d.status}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
              }
            </Card>
          </div>
        </>
      )}
    </div>
  )
}

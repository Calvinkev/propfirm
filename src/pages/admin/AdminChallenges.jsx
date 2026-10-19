import { useState, useEffect } from 'react'
import Card from '../../components/Card'
import Button from '../../components/Button'
import { api } from '../../services/api'
import { useAuth } from '../../context/AuthContext'
import './AdminPages.css'

export default function AdminChallenges() {
  const { token } = useAuth()
  const [accounts, setAccounts] = useState([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('All')
  const [search, setSearch] = useState('')
  const [users, setUsers] = useState([])
  const [showIssueModal, setShowIssueModal] = useState(false)
  const [issueData, setIssueData] = useState({ userId: '', accountSize: 10000, status: 'Active', phase: 1 })

  const loadAccounts = async () => {
    try {
      setLoading(true)
      const res = await api.getAdminAccounts(token, { status: statusFilter, search })
      if (res.accounts) {
        setAccounts(res.accounts)
      }
    } catch (err) {
      console.error('Failed to load admin accounts:', err)
    } finally {
      setLoading(false)
    }
  }

  const loadUsersList = async () => {
    try {
      const res = await api.getAdminUsers(token)
      if (res.users) setUsers(res.users)
    } catch (err) {
      console.error('Failed to load users list:', err)
    }
  }

  useEffect(() => {
    loadAccounts()
    loadUsersList()
  }, [token, statusFilter, search])

  const handleIssueAccount = async (e) => {
    e.preventDefault()
    if (!issueData.userId) return alert('Select a user')
    try {
      await api.createAdminAccount(token, issueData)
      setShowIssueModal(false)
      loadAccounts()
    } catch (err) {
      alert('Failed to issue account')
    }
  }

  const handleAccountAction = async (accountId, action, data = {}) => {
    try {
      await api.updateAdminAccount(token, accountId, data)
      loadAccounts()
    } catch (err) {
      console.error(`Failed to execute ${action}:`, err)
    }
  }

  return (
    <div className="admin-page">
      <div className="admin-topbar">
        <div>
          <h1>Accounts & Challenges Console</h1>
          <div className="sub">Inspect trader evaluation progress, reset drawdowns, and issue funded accounts</div>
        </div>
        <div className="admin-actions">
          <input
            type="text"
            placeholder="Search Account ID or Trader Email..."
            className="search-input"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <Button onClick={() => setShowIssueModal(true)}>+ Issue New Account</Button>
        </div>
      </div>

      <div className="admin-grid-3">
        <Card className="admin-kpi">
          <label>Total Evaluation Accounts</label>
          <div className="val">{accounts.length}</div>
          <div className="delta up">▲ Active System Accounts</div>
        </Card>
        <Card className="admin-kpi">
          <label>Funded Accounts</label>
          <div className="val">{accounts.filter(a => a.status === 'Funded').length}</div>
          <div className="delta up">▲ Passed Evaluation</div>
        </Card>
        <Card className="admin-kpi">
          <label>Evaluation Phase 1 & 2</label>
          <div className="val">{accounts.filter(a => ['Active', 'Phase 1', 'Phase 2'].includes(a.status)).length}</div>
          <div className="delta up">▲ Currently Trading</div>
        </Card>
      </div>

      <Card className="admin-panel">
        <div className="panel-head">
          <h3>Trader Account Directory</h3>
          <div className="table-filters">
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="All">All Statuses</option>
              <option value="Active">Active / Phase 1</option>
              <option value="Phase 2">Phase 2 Verification</option>
              <option value="Funded">Funded</option>
              <option value="Failed">Failed / Breached</option>
            </select>
          </div>
        </div>

        {loading ? (
          <div style={{ padding: '30px 0', textAlign: 'center', color: 'var(--text-faint)' }}>Loading accounts...</div>
        ) : (
          <table className="admin-table">
            <thead>
              <tr>
                <th>Account ID</th>
                <th>Trader</th>
                <th>Phase</th>
                <th>Account Size</th>
                <th>Balance / Equity</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {accounts.map((a) => (
                <tr key={a.id}>
                  <td className="mono" style={{ color: 'var(--brass)', fontWeight: 600 }}>{a.account_id}</td>
                  <td>
                    <div className="user-cell">
                      <div className="user-avatar">{(a.first_name || 'T')[0]}</div>
                      <div>
                        <b>{a.first_name} {a.last_name}</b>
                        <span>{a.email}</span>
                      </div>
                    </div>
                  </td>
                  <td className="mono">Phase {a.phase}</td>
                  <td className="mono">${parseFloat(a.account_size).toLocaleString()}</td>
                  <td className="mono">
                    ${parseFloat(a.balance).toFixed(2)} / ${parseFloat(a.equity).toFixed(2)}
                  </td>
                  <td>
                    <span className={`status-badge ${a.status.toLowerCase()}`}>{a.status}</span>
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <Button
                        variant="outline"
                        onClick={() => handleAccountAction(a.id, 'reset', { resetDrawdown: true })}
                        style={{ padding: '4px 8px', fontSize: '10px' }}
                        title="Reset daily loss & drawdown metrics"
                      >
                        Reset Drawdown
                      </Button>
                      <Button
                        onClick={() => handleAccountAction(a.id, 'pass', { passPhase: true })}
                        style={{ padding: '4px 8px', fontSize: '10px' }}
                        title="Force advance to next phase or Funded"
                      >
                        Pass Phase
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      {/* Issue Account Modal */}
      {showIssueModal && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex',
          alignItems: 'center', justifyContent: 'center', zIndex: 10000
        }}>
          <div style={{
            background: 'var(--surface)', border: '1px solid var(--border-soft)',
            padding: '30px', borderRadius: '12px', width: '100%', maxWidth: '420px'
          }}>
            <h2 style={{ marginBottom: '16px' }}>Issue Challenge Account</h2>
            <form onSubmit={handleIssueAccount} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <label style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Select Trader</label>
              <select
                required value={issueData.userId} onChange={(e) => setIssueData({ ...issueData, userId: e.target.value })}
                style={{ padding: '10px', background: 'var(--surface-raised)', border: '1px solid var(--border-soft)', borderRadius: '6px', color: '#fff' }}
              >
                <option value="">-- Choose User --</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>{u.first_name} {u.last_name} ({u.email})</option>
                ))}
              </select>

              <label style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Account Capital Size</label>
              <select
                value={issueData.accountSize} onChange={(e) => setIssueData({ ...issueData, accountSize: e.target.value })}
                style={{ padding: '10px', background: 'var(--surface-raised)', border: '1px solid var(--border-soft)', borderRadius: '6px', color: '#fff' }}
              >
                <option value="1000">$1,000 Capital</option>
                <option value="2500">$2,500 Capital</option>
                <option value="6000">$6,000 Capital</option>
                <option value="10000">$10,000 Capital</option>
                <option value="100000">$100,000 Capital</option>
              </select>

              <label style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Initial Account Status</label>
              <select
                value={issueData.status} onChange={(e) => setIssueData({ ...issueData, status: e.target.value })}
                style={{ padding: '10px', background: 'var(--surface-raised)', border: '1px solid var(--border-soft)', borderRadius: '6px', color: '#fff' }}
              >
                <option value="Active">Active (Phase 1 Evaluation)</option>
                <option value="Phase 2">Phase 2 Verification</option>
                <option value="Funded">Directly Funded Account</option>
              </select>

              <div style={{ display: 'flex', gap: '10px', marginTop: '12px' }}>
                <Button type="submit" style={{ flex: 1 }}>Create Account</Button>
                <Button variant="outline" type="button" onClick={() => setShowIssueModal(false)}>Cancel</Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

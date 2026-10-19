import { useState, useEffect } from 'react'
import Card from '../../components/Card'
import Button from '../../components/Button'
import { api } from '../../services/api'
import { useAuth } from '../../context/AuthContext'
import './AdminPages.css'

export default function AdminPayouts() {
  const { token } = useAuth()
  const [payouts, setPayouts] = useState([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('All')
  const [showApproveModal, setShowApproveModal] = useState(false)
  const [selectedPayout, setSelectedPayout] = useState(null)
  const [txId, setTxId] = useState('')

  const loadPayouts = async () => {
    try {
      setLoading(true)
      const res = await api.getAdminPayouts(token, { status: statusFilter })
      if (res.payouts) {
        setPayouts(res.payouts)
      }
    } catch (err) {
      console.error('Failed to load payouts:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadPayouts()
  }, [token, statusFilter])

  const handleApprove = async (e) => {
    e.preventDefault()
    if (!selectedPayout) return
    try {
      await api.approveAdminPayout(token, selectedPayout.id, txId || `TX-${Date.now()}`)
      setShowApproveModal(false)
      setSelectedPayout(null)
      setTxId('')
      loadPayouts()
    } catch (err) {
      alert('Failed to approve payout')
    }
  }

  const handleReject = async (payoutId) => {
    if (window.confirm('Are you sure you want to reject this payout request?')) {
      try {
        await api.rejectAdminPayout(token, payoutId)
        loadPayouts()
      } catch (err) {
        console.error('Failed to reject payout:', err)
      }
    }
  }

  const pendingTotal = payouts.filter(p => p.status === 'Pending').reduce((acc, p) => acc + parseFloat(p.amount), 0)
  const completedTotal = payouts.filter(p => p.status === 'Completed').reduce((acc, p) => acc + parseFloat(p.amount), 0)

  return (
    <div className="admin-page">
      <div className="admin-topbar">
        <div>
          <h1>Payout Approvals & Financials</h1>
          <div className="sub">Review trader profit withdrawal requests, execute payouts, and track transactions</div>
        </div>
      </div>

      <div className="admin-grid-3">
        <Card className="admin-kpi">
          <label>Pending Withdrawal Requests</label>
          <div className="val" style={{ color: 'var(--brass)' }}>${pendingTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
          <div className="delta up">▲ Awaiting Administrative Processing</div>
        </Card>
        <Card className="admin-kpi">
          <label>Total Completed Payouts</label>
          <div className="val" style={{ color: 'var(--green)' }}>${completedTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
          <div className="delta up">▲ Total Profits Disbursed</div>
        </Card>
        <Card className="admin-kpi">
          <label>Total Payout Requests</label>
          <div className="val">{payouts.length}</div>
          <div className="delta up">▲ Platform Withdrawal Volume</div>
        </Card>
      </div>

      <Card className="admin-panel">
        <div className="panel-head">
          <h3>Payout Requests</h3>
          <div className="table-filters">
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="All">All Statuses</option>
              <option value="Pending">Pending Only</option>
              <option value="Completed">Completed / Paid</option>
              <option value="Rejected">Rejected</option>
            </select>
          </div>
        </div>

        {loading ? (
          <div style={{ padding: '30px 0', textAlign: 'center', color: 'var(--text-faint)' }}>Loading payouts...</div>
        ) : (
          <table className="admin-table">
            <thead>
              <tr>
                <th>Trader</th>
                <th>Account</th>
                <th>Amount</th>
                <th>Method</th>
                <th>Requested Date</th>
                <th>Status</th>
                <th>Transaction Reference</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {payouts.map((p) => (
                <tr key={p.id}>
                  <td>
                    <div className="user-cell">
                      <div className="user-avatar">{(p.first_name || 'T')[0]}</div>
                      <div>
                        <b>{p.first_name} {p.last_name}</b>
                        <span>{p.email}</span>
                      </div>
                    </div>
                  </td>
                  <td className="mono">{p.account_id}</td>
                  <td className="mono" style={{ color: 'var(--green)', fontWeight: 600 }}>${parseFloat(p.amount).toFixed(2)}</td>
                  <td className="mono">{p.method}</td>
                  <td className="mono">{new Date(p.request_date).toLocaleDateString()}</td>
                  <td>
                    <span className={`status-badge ${p.status.toLowerCase()}`}>{p.status}</span>
                  </td>
                  <td className="mono" style={{ fontSize: '11px', color: 'var(--text-faint)' }}>
                    {p.transaction_id || '—'}
                  </td>
                  <td>
                    {p.status === 'Pending' && (
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <Button
                          onClick={() => { setSelectedPayout(p); setShowApproveModal(true); }}
                          style={{ padding: '4px 10px', fontSize: '11px' }}
                        >
                          Approve
                        </Button>
                        <Button
                          variant="outline"
                          onClick={() => handleReject(p.id)}
                          style={{ padding: '4px 10px', fontSize: '11px', color: 'var(--red)', borderColor: 'var(--red)' }}
                        >
                          Reject
                        </Button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      {/* Approve Payout Modal */}
      {showApproveModal && selectedPayout && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex',
          alignItems: 'center', justifyContent: 'center', zIndex: 10000
        }}>
          <div style={{
            background: 'var(--surface)', border: '1px solid var(--border-soft)',
            padding: '30px', borderRadius: '12px', width: '100%', maxWidth: '420px'
          }}>
            <h2 style={{ marginBottom: '8px' }}>Approve Payout</h2>
            <div style={{ color: 'var(--text-muted)', fontSize: '13px', marginBottom: '16px' }}>
              Trader: <b>{selectedPayout.first_name} {selectedPayout.last_name}</b><br />
              Amount: <b style={{ color: 'var(--green)' }}>${parseFloat(selectedPayout.amount).toFixed(2)}</b> ({selectedPayout.method})
            </div>

            <form onSubmit={handleApprove} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <label style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Payment / Blockchain Transaction Hash</label>
              <input
                type="text"
                placeholder="e.g. 0x82f9... or TXN-994821"
                value={txId}
                onChange={(e) => setTxId(e.target.value)}
                style={{ padding: '10px', background: 'var(--surface-raised)', border: '1px solid var(--border-soft)', borderRadius: '6px', color: '#fff' }}
              />

              <div style={{ display: 'flex', gap: '10px', marginTop: '12px' }}>
                <Button type="submit" style={{ flex: 1 }}>Confirm & Send Payout</Button>
                <Button variant="outline" type="button" onClick={() => setShowApproveModal(false)}>Cancel</Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

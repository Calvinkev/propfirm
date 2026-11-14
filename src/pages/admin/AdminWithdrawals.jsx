import { useState, useEffect } from 'react'
import Card from '../../components/Card'
import { api } from '../../services/api'
import { useAuth } from '../../context/AuthContext'
import './AdminPages.css'

export default function AdminWithdrawals() {
  const { token } = useAuth()
  const [withdrawals, setWithdrawals] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('Pending')
  const [toast, setToast] = useState(null)
  const [acting, setActing] = useState(null)

  const toast_ = (type, msg) => { setToast({ type, msg }); setTimeout(() => setToast(null), 3500) }

  const load = async () => {
    setLoading(true)
    try {
      const res = await api.getAdminWithdrawals(token)
      if (res.withdrawals) setWithdrawals(res.withdrawals)
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [token])

  const handleApprove = async (id) => {
    if (!window.confirm('Approve this withdrawal? This will mark it as processed.')) return
    setActing(id)
    const res = await api.approveAdminWithdrawal(token, id)
    setActing(null)
    if (res.error) { toast_('error', res.error); return }
    toast_('success', res.message)
    load()
  }

  const handleReject = async (id) => {
    if (!window.confirm('Reject this withdrawal? Funds will be returned to the user.')) return
    setActing(id)
    const res = await api.rejectAdminWithdrawal(token, id)
    setActing(null)
    if (res.error) { toast_('error', res.error); return }
    toast_('success', res.message)
    load()
  }

  const filtered = filter === 'All' ? withdrawals : withdrawals.filter(w => w.status === filter)
  const pending = withdrawals.filter(w => w.status === 'Pending')
  const pendingTotal = pending.reduce((s, w) => s + parseFloat(w.amount), 0)

  return (
    <div className="admin-page">
      {toast && <div className={`adm-toast ${toast.type}`}>{toast.msg}</div>}

      <div className="admin-topbar">
        <div><h1>Withdrawals</h1><div className="sub">Review and process user withdrawal requests</div></div>
      </div>

      <div className="admin-grid-3">
        <Card className="admin-kpi"><label>Pending Requests</label><div className="val" style={{color:'#F59E0B'}}>{pending.length}</div><div className="delta">Awaiting processing</div></Card>
        <Card className="admin-kpi"><label>Pending Amount</label><div className="val" style={{color:'var(--brass)'}}>${pendingTotal.toLocaleString(undefined,{minimumFractionDigits:2})}</div><div className="delta">To be sent</div></Card>
        <Card className="admin-kpi"><label>Approved</label><div className="val" style={{color:'var(--green)'}}>{withdrawals.filter(w=>w.status==='Approved').length}</div></Card>
      </div>

      <Card className="admin-panel">
        <div className="panel-head">
          <h3>Withdrawal Requests</h3>
          <div className="table-filters">
            <select value={filter} onChange={e => setFilter(e.target.value)}>
              <option>Pending</option><option>Approved</option><option>Rejected</option><option value="All">All</option>
            </select>
          </div>
        </div>

        {loading ? <div className="adm-loading">Loading…</div> : (
          <div className="adm-table-wrap">
          <table className="admin-table">
            <thead>
              <tr><th>User</th><th>Coin</th><th>Network</th><th>Amount</th><th>Destination Address</th><th>Date</th><th>Status</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {filtered.length === 0
                ? <tr><td colSpan={8} className="adm-empty-cell">No withdrawals</td></tr>
                : filtered.map(w => (
                  <tr key={w.id}>
                    <td><div className="user-cell"><div className="user-avatar">{w.first_name[0]}</div><div><b>{w.first_name} {w.last_name}</b><span>{w.email}</span></div></div></td>
                    <td className="mono"><b>{w.coin}</b></td>
                    <td>{w.network}</td>
                    <td className="mono" style={{color:'var(--green)',fontWeight:600}}>{parseFloat(w.amount).toFixed(4)}</td>
                    <td className="mono adm-hash">{w.address}</td>
                    <td className="mono" style={{fontSize:'11px'}}>{new Date(w.created_at).toLocaleString()}</td>
                    <td><span className={`status-badge ${w.status.toLowerCase()}`}>{w.status}</span></td>
                    <td>
                      {w.status === 'Pending' && (
                        <div className="adm-row-actions">
                          <button className="adm-btn-sm success" disabled={acting===w.id} onClick={() => handleApprove(w.id)}>
                            {acting===w.id ? '…' : '✓ Approve'}
                          </button>
                          <button className="adm-btn-sm danger" disabled={acting===w.id} onClick={() => handleReject(w.id)}>
                            {acting===w.id ? '…' : '✕ Reject'}
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))
              }
            </tbody>
          </table>
          </div>
        )}
      </Card>
    </div>
  )
}

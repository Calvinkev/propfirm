import { useState, useEffect } from 'react'
import Card from '../../components/Card'
import { api } from '../../services/api'
import { useAuth } from '../../context/AuthContext'
import './AdminPages.css'

export default function AdminDeposits() {
  const { token } = useAuth()
  const [deposits, setDeposits] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('Pending')
  const [toast, setToast] = useState(null)
  const [acting, setActing] = useState(null)

  const toast_ = (type, msg) => { setToast({ type, msg }); setTimeout(() => setToast(null), 3500) }

  const load = async () => {
    setLoading(true)
    try {
      const res = await api.getAdminCryptoDeposits(token)
      if (res.deposits) setDeposits(res.deposits)
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [token])

  const handleApprove = async (id) => {
    setActing(id)
    const res = await api.approveAdminCryptoDeposit(token, id)
    setActing(null)
    if (res.error) { toast_('error', res.error); return }
    toast_('success', res.message)
    load()
  }

  const handleReject = async (id) => {
    if (!window.confirm('Reject this deposit?')) return
    setActing(id)
    const res = await api.rejectAdminCryptoDeposit(token, id)
    setActing(null)
    if (res.error) { toast_('error', res.error); return }
    toast_('success', 'Deposit rejected')
    load()
  }

  const filtered = filter === 'All' ? deposits : deposits.filter(d => d.status === filter)
  const pending = deposits.filter(d => d.status === 'Pending').length

  return (
    <div className="admin-page">
      {toast && <div className={`adm-toast ${toast.type}`}>{toast.msg}</div>}

      <div className="admin-topbar">
        <div><h1>Deposits</h1><div className="sub">Review and approve user crypto deposits</div></div>
      </div>

      <div className="admin-grid-3">
        <Card className="admin-kpi"><label>Pending</label><div className="val" style={{color:'var(--brass)'}}>{pending}</div><div className="delta">Awaiting approval</div></Card>
        <Card className="admin-kpi"><label>Approved</label><div className="val" style={{color:'var(--green)'}}>{deposits.filter(d=>d.status==='Approved').length}</div></Card>
        <Card className="admin-kpi"><label>Total Submissions</label><div className="val">{deposits.length}</div></Card>
      </div>

      <Card className="admin-panel">
        <div className="panel-head">
          <h3>Deposit Submissions</h3>
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
              <tr><th>User</th><th>Coin</th><th>Network</th><th>Amount</th><th>Tx Hash</th><th>Date</th><th>Status</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {filtered.length === 0
                ? <tr><td colSpan={8} className="adm-empty-cell">No deposits</td></tr>
                : filtered.map(d => (
                  <tr key={d.id}>
                    <td><div className="user-cell"><div className="user-avatar">{d.first_name[0]}</div><div><b>{d.first_name} {d.last_name}</b><span>{d.email}</span></div></div></td>
                    <td className="mono"><b>{d.coin}</b></td>
                    <td>{d.network}</td>
                    <td className="mono">{parseFloat(d.amount).toFixed(4)}</td>
                    <td className="mono adm-hash">{d.tx_hash}</td>
                    <td className="mono" style={{fontSize:'11px'}}>{new Date(d.created_at).toLocaleString()}</td>
                    <td><span className={`status-badge ${d.status.toLowerCase()}`}>{d.status}</span></td>
                    <td>
                      {d.status === 'Pending' && (
                        <div className="adm-row-actions">
                          <button className="adm-btn-sm success" disabled={acting===d.id} onClick={() => handleApprove(d.id)}>
                            {acting===d.id ? '…' : '✓ Approve'}
                          </button>
                          <button className="adm-btn-sm danger" disabled={acting===d.id} onClick={() => handleReject(d.id)}>
                            {acting===d.id ? '…' : '✕ Reject'}
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

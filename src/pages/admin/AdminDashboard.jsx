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
  const [notifForm, setNotifForm] = useState({ title: '', message: '', type: 'info', userId: '', all: true })
  const [notifSending, setNotifSending] = useState(false)
  const [notifToast, setNotifToast] = useState(null)
  const [users, setUsers] = useState([])

  const toast_ = (type, msg) => { setNotifToast({ type, msg }); setTimeout(() => setNotifToast(null), 3500) }

  const load = async () => {
    setLoading(true)
    try {
      const [res, uRes] = await Promise.all([api.getAdminOverview(token), api.getAdminUsers(token)])
      if (res.stats) setData(res)
      if (uRes.users) setUsers(uRes.users)
    } catch (err) { console.error(err) }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [token])

  const sendNotification = async (e) => {
    e.preventDefault()
    setNotifSending(true)
    const payload = { ...notifForm, userId: notifForm.all ? undefined : parseInt(notifForm.userId) }
    const res = await api.adminSendNotification(token, payload)
    setNotifSending(false)
    if (res.error) { toast_('error', res.error); return }
    toast_('success', res.message)
    setNotifForm({ title: '', message: '', type: 'info', userId: '', all: true })
  }

  const s = data?.stats || {}
  const recent = data?.recentDeposits || []

  return (
    <div className="admin-page">
      {notifToast && <div className={`adm-toast ${notifToast.type}`}>{notifToast.msg}</div>}

      <div className="admin-topbar">
        <div><h1>Admin Dashboard</h1><div className="sub">Platform overview</div></div>
        <button className="adm-refresh-btn" onClick={load}>↻ Refresh</button>
      </div>

      {loading ? <div className="adm-loading">Loading…</div> : (
        <>
          <div className="admin-grid-4">
            <Card className="admin-kpi"><label>Total Users</label><div className="val">{s.totalUsers ?? 0}</div><div className="delta up">Registered traders</div></Card>
            <Card className="admin-kpi"><label>Pending Deposits</label><div className="val" style={{color:'var(--brass)'}}>{s.pendingDeposits ?? 0}</div><div className="delta">Awaiting approval</div></Card>
            <Card className="admin-kpi"><label>Pending Withdrawals</label><div className="val" style={{color:'#F59E0B'}}>{s.pendingWithdrawals ?? 0}</div><div className="delta">Awaiting processing</div></Card>
            <Card className="admin-kpi"><label>Quick Trade Profit Paid</label><div className="val" style={{color:'var(--green)'}}>${parseFloat(s.quickTradeProfit ?? 0).toFixed(2)}</div><div className="delta up">Total winnings issued</div></Card>
          </div>

          <div className="admin-grid-2" style={{marginTop:20}}>
            <Card className="admin-panel">
              <div className="panel-head"><h3>Quick Links</h3></div>
              <div className="adm-quick-links">
                {[
                  { to: '/admin/deposits',     label: '📥 Approve Deposits',    badge: s.pendingDeposits },
                  { to: '/admin/withdrawals',  label: '📤 Process Withdrawals', badge: s.pendingWithdrawals },
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
              <div className="panel-head"><h3>📣 Send Notification</h3></div>
              <form onSubmit={sendNotification} style={{padding:'16px',display:'flex',flexDirection:'column',gap:12}}>
                <div style={{display:'flex',gap:16}}>
                  <label style={{display:'flex',alignItems:'center',gap:6,fontSize:13,cursor:'pointer'}}>
                    <input type="radio" checked={notifForm.all} onChange={() => setNotifForm(f=>({...f,all:true,userId:''}))} /> All users
                  </label>
                  <label style={{display:'flex',alignItems:'center',gap:6,fontSize:13,cursor:'pointer'}}>
                    <input type="radio" checked={!notifForm.all} onChange={() => setNotifForm(f=>({...f,all:false}))} /> Specific user
                  </label>
                </div>
                {!notifForm.all && (
                  <select value={notifForm.userId} onChange={e=>setNotifForm(f=>({...f,userId:e.target.value}))}
                    style={{background:'var(--surface-raised)',border:'1px solid var(--border)',color:'var(--text)',padding:'8px',borderRadius:6,fontSize:13}}>
                    <option value="">— Select user —</option>
                    {users.map(u=><option key={u.id} value={u.id}>{u.first_name} {u.last_name} ({u.email})</option>)}
                  </select>
                )}
                <select value={notifForm.type} onChange={e=>setNotifForm(f=>({...f,type:e.target.value}))}
                  style={{background:'var(--surface-raised)',border:'1px solid var(--border)',color:'var(--text)',padding:'8px',borderRadius:6,fontSize:13}}>
                  <option value="info">ℹ️ Info</option>
                  <option value="success">✅ Success</option>
                  <option value="warning">⚠️ Warning</option>
                </select>
                <input required placeholder="Title" value={notifForm.title} onChange={e=>setNotifForm(f=>({...f,title:e.target.value}))}
                  style={{background:'var(--surface-raised)',border:'1px solid var(--border)',color:'var(--text)',padding:'8px',borderRadius:6,fontSize:13}} />
                <textarea required placeholder="Message…" rows={3} value={notifForm.message} onChange={e=>setNotifForm(f=>({...f,message:e.target.value}))}
                  style={{background:'var(--surface-raised)',border:'1px solid var(--border)',color:'var(--text)',padding:'8px',borderRadius:6,fontSize:13,resize:'vertical'}} />
                <button type="submit" className="adm-btn-primary" disabled={notifSending}>
                  {notifSending ? 'Sending…' : '📣 Send Notification'}
                </button>
              </form>
            </Card>
          </div>

          <Card className="admin-panel" style={{marginTop:20}}>
            <div className="panel-head"><h3>Recent Deposits</h3></div>
            {recent.length === 0
              ? <div className="adm-empty">No deposits yet</div>
              : <table className="admin-table">
                  <thead><tr><th>User</th><th>Coin</th><th>Amount</th><th>Status</th></tr></thead>
                  <tbody>
                    {recent.map(d => (
                      <tr key={d.id}>
                        <td><div className="user-cell"><div className="user-avatar">{d?.first_name?.[0]??'?'}</div><span>{d.first_name} {d.last_name}</span></div></td>
                        <td className="mono">{d.coin}</td>
                        <td className="mono">{parseFloat(d.amount).toFixed(4)}</td>
                        <td><span className={`status-badge ${d.status.toLowerCase()}`}>{d.status}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
            }
          </Card>
        </>
      )}
    </div>
  )
}

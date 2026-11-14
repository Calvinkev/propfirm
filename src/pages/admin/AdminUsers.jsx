import { useState, useEffect } from 'react'
import Card from '../../components/Card'
import { api } from '../../services/api'
import { useAuth } from '../../context/AuthContext'
import './AdminPages.css'

export default function AdminUsers() {
  const { token } = useAuth()
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [toast, setToast] = useState(null)

  // Modals
  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState({ firstName: '', lastName: '', email: '', password: '' })
  const [creating, setCreating] = useState(false)
  const [formErr, setFormErr] = useState('')

  const [balanceUser, setBalanceUser] = useState(null)   // { id, name }
  const [newBalance, setNewBalance] = useState('')

  const toast_ = (type, msg) => { setToast({ type, msg }); setTimeout(() => setToast(null), 3500) }

  const load = async () => {
    setLoading(true)
    try {
      const res = await api.getAdminUsers(token, search ? { search } : {})
      if (res.users) setUsers(res.users)
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [token, search])

  const handleCreate = async (e) => {
    e.preventDefault()
    setFormErr(''); setCreating(true)
    const res = await api.createAdminUser(token, form)
    setCreating(false)
    if (res.error) { setFormErr(res.error); return }
    toast_('success', 'User created')
    setShowCreate(false)
    setForm({ firstName: '', lastName: '', email: '', password: '' })
    load()
  }

  const handleDelete = async (u) => {
    if (!window.confirm(`Delete ${u.first_name} ${u.last_name}? This cannot be undone.`)) return
    const res = await api.deleteAdminUser(token, u.id)
    if (res.error) { toast_('error', res.error); return }
    toast_('success', 'User deleted')
    load()
  }

  const handleSetBalance = async (e) => {
    e.preventDefault()
    const res = await api.setAdminUserBalance(token, balanceUser.id, parseFloat(newBalance))
    if (res.error) { toast_('error', res.error); return }
    toast_('success', res.message)
    setBalanceUser(null); setNewBalance('')
    load()
  }

  return (
    <div className="admin-page">
      {toast && <div className={`adm-toast ${toast.type}`}>{toast.msg}</div>}

      <div className="admin-topbar">
        <div><h1>Users</h1><div className="sub">All registered traders</div></div>
        <div className="admin-actions">
          <input className="search-input" placeholder="Search name or email…" value={search} onChange={e => setSearch(e.target.value)} />
          <button className="adm-btn-primary" onClick={() => setShowCreate(true)}>+ New User</button>
        </div>
      </div>

      <div className="admin-grid-3">
        <Card className="admin-kpi"><label>Total Users</label><div className="val">{users.length}</div></Card>
        <Card className="admin-kpi"><label>Pending Deposits</label><div className="val" style={{color:'var(--brass)'}}>{users.reduce((s,u)=>s+(u.pending_deposits||0),0)}</div></Card>
        <Card className="admin-kpi"><label>Total USDT on Platform</label><div className="val">${users.reduce((s,u)=>s+parseFloat(u.usdt_balance||0),0).toLocaleString(undefined,{minimumFractionDigits:2})}</div></Card>
      </div>

      <Card className="admin-panel">
        <div className="panel-head"><h3>All Users</h3></div>
        {loading ? <div className="adm-loading">Loading…</div> : (
          <div className="adm-table-wrap">
          <table className="admin-table">
            <thead><tr><th>User</th><th>Email</th><th>USDT Balance</th><th>Pending Deposits</th><th>Joined</th><th>Actions</th></tr></thead>
            <tbody>
              {users.map(u => (
                <tr key={u.id}>
                  <td><div className="user-cell"><div className="user-avatar">{u.first_name[0]}</div><b>{u.first_name} {u.last_name}</b></div></td>
                  <td className="mono">{u.email}</td>
                  <td className="mono">${parseFloat(u.usdt_balance||0).toLocaleString(undefined,{minimumFractionDigits:2})}</td>
                  <td className="mono">{u.pending_deposits||0}</td>
                  <td className="mono" style={{fontSize:'11px'}}>{new Date(u.created_at).toLocaleDateString()}</td>
                  <td>
                    <div className="adm-row-actions">
                      <button className="adm-btn-sm" onClick={() => { setBalanceUser({ id: u.id, name: `${u.first_name} ${u.last_name}` }); setNewBalance(parseFloat(u.usdt_balance||0).toFixed(2)) }}>Set Balance</button>
                      <button className="adm-btn-sm danger" onClick={() => handleDelete(u)}>Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </Card>

      {/* Create user modal */}
      {showCreate && (
        <div className="adm-modal-backdrop" onClick={e => e.target === e.currentTarget && setShowCreate(false)}>
          <div className="adm-modal">
            <div className="adm-modal-header"><h3>Create User</h3><button className="adm-close" onClick={() => setShowCreate(false)}>✕</button></div>
            {formErr && <div className="adm-form-err">{formErr}</div>}
            <form onSubmit={handleCreate} className="adm-form">
              <input required placeholder="First Name" value={form.firstName} onChange={e => setForm({...form, firstName: e.target.value})} />
              <input required placeholder="Last Name"  value={form.lastName}  onChange={e => setForm({...form, lastName:  e.target.value})} />
              <input required type="email" placeholder="Email" value={form.email} onChange={e => setForm({...form, email: e.target.value})} />
              <input required type="password" placeholder="Password" minLength={6} value={form.password} onChange={e => setForm({...form, password: e.target.value})} />
              <button type="submit" className="adm-btn-primary" disabled={creating}>{creating ? 'Creating…' : 'Create User'}</button>
            </form>
          </div>
        </div>
      )}

      {/* Set balance modal */}
      {balanceUser && (
        <div className="adm-modal-backdrop" onClick={e => e.target === e.currentTarget && setBalanceUser(null)}>
          <div className="adm-modal">
            <div className="adm-modal-header"><h3>Set USDT Balance</h3><button className="adm-close" onClick={() => setBalanceUser(null)}>✕</button></div>
            <div style={{color:'var(--text-muted)',fontSize:'13px',marginBottom:14}}>User: <b>{balanceUser.name}</b></div>
            <form onSubmit={handleSetBalance} className="adm-form">
              <label style={{fontSize:'12px',color:'var(--text-muted)'}}>New USDT Balance</label>
              <input type="number" min="0" step="0.01" required value={newBalance} onChange={e => setNewBalance(e.target.value)} />
              <button type="submit" className="adm-btn-primary">Set Balance</button>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

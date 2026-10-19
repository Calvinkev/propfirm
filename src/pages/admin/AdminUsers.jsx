import { useState, useEffect } from 'react'
import Card from '../../components/Card'
import Button from '../../components/Button'
import { api } from '../../services/api'
import { useAuth } from '../../context/AuthContext'
import './AdminPages.css'

export default function AdminUsers() {
  const { token } = useAuth()
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState('')
  const [showAddModal, setShowAddModal] = useState(false)
  const [formData, setFormData] = useState({ firstName: '', lastName: '', email: '', password: '', role: 'user' })
  const [submitError, setSubmitError] = useState('')

  const loadUsers = async () => {
    try {
      setLoading(true)
      const res = await api.getAdminUsers(token, { search, role: roleFilter })
      if (res.users) {
        setUsers(res.users)
      }
    } catch (err) {
      console.error('Failed to load users:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadUsers()
  }, [token, search, roleFilter])

  const handleCreateUser = async (e) => {
    e.preventDefault()
    setSubmitError('')
    try {
      const res = await api.createAdminUser(token, formData)
      if (res.user) {
        setShowAddModal(false)
        setFormData({ firstName: '', lastName: '', email: '', password: '', role: 'user' })
        loadUsers()
      } else {
        setSubmitError(res.error || 'Failed to create user')
      }
    } catch (err) {
      setSubmitError('Server connection error')
    }
  }

  const handleToggleRole = async (userId, currentRole) => {
    const newRole = currentRole === 'admin' ? 'user' : 'admin'
    if (window.confirm(`Are you sure you want to change user role to ${newRole.toUpperCase()}?`)) {
      try {
        await api.updateAdminUserRole(token, userId, newRole)
        loadUsers()
      } catch (err) {
        console.error('Failed to toggle user role:', err)
      }
    }
  }

  return (
    <div className="admin-page">
      <div className="admin-topbar">
        <div>
          <h1>User Management</h1>
          <div className="sub">Inspect, register, and configure platform user roles</div>
        </div>
        <div className="admin-actions">
          <input
            type="text"
            placeholder="Search name or email..."
            className="search-input"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <Button onClick={() => setShowAddModal(true)}>+ Add User / Admin</Button>
        </div>
      </div>

      <div className="admin-grid-3">
        <Card className="admin-kpi">
          <label>Total Registered Accounts</label>
          <div className="val">{users.length}</div>
          <div className="delta up">▲ Live Database Records</div>
        </Card>
        <Card className="admin-kpi">
          <label>Administrators</label>
          <div className="val">{users.filter(u => u.role === 'admin').length}</div>
          <div className="delta up">▲ Privileged Access Users</div>
        </Card>
        <Card className="admin-kpi">
          <label>Standard Traders</label>
          <div className="val">{users.filter(u => u.role === 'user').length}</div>
          <div className="delta up">▲ Active Challenge Holders</div>
        </Card>
      </div>

      <Card className="admin-panel">
        <div className="panel-head">
          <h3>All Platform Users</h3>
          <div className="table-filters">
            <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}>
              <option value="">All Roles</option>
              <option value="user">User / Trader</option>
              <option value="admin">Admin</option>
            </select>
          </div>
        </div>

        {loading ? (
          <div style={{ padding: '30px 0', textAlign: 'center', color: 'var(--text-faint)' }}>Loading users...</div>
        ) : (
          <table className="admin-table">
            <thead>
              <tr>
                <th>User</th>
                <th>Email</th>
                <th>Active Accounts</th>
                <th>Role</th>
                <th>Registered Date</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td>
                    <div className="user-cell">
                      <div className="user-avatar">{(u.first_name || 'U')[0]}</div>
                      <b>{u.first_name} {u.last_name}</b>
                    </div>
                  </td>
                  <td className="mono">{u.email}</td>
                  <td className="mono">{u.account_count || 0}</td>
                  <td>
                    <span className={`status-badge ${u.role === 'admin' ? 'completed' : 'pending'}`}>
                      {u.role.toUpperCase()}
                    </span>
                  </td>
                  <td className="mono">{new Date(u.created_at).toLocaleDateString()}</td>
                  <td>
                    <Button
                      variant="outline"
                      onClick={() => handleToggleRole(u.id, u.role)}
                      style={{ padding: '6px 12px', fontSize: '11px' }}
                    >
                      {u.role === 'admin' ? 'Make Trader' : 'Promote Admin'}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      {/* Add User Modal */}
      {showAddModal && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex',
          alignItems: 'center', justifyContent: 'center', zIndex: 10000
        }}>
          <div style={{
            background: 'var(--surface)', border: '1px solid var(--border-soft)',
            padding: '30px', borderRadius: '12px', width: '100%', maxWidth: '420px'
          }}>
            <h2 style={{ marginBottom: '16px' }}>Create New Account</h2>
            {submitError && <div style={{ color: 'var(--red)', fontSize: '13px', marginBottom: '12px' }}>{submitError}</div>}
            <form onSubmit={handleCreateUser} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <input
                type="text" placeholder="First Name" required
                value={formData.firstName} onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                style={{ padding: '10px', background: 'var(--surface-raised)', border: '1px solid var(--border-soft)', borderRadius: '6px', color: '#fff' }}
              />
              <input
                type="text" placeholder="Last Name" required
                value={formData.lastName} onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                style={{ padding: '10px', background: 'var(--surface-raised)', border: '1px solid var(--border-soft)', borderRadius: '6px', color: '#fff' }}
              />
              <input
                type="email" placeholder="Email Address" required
                value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                style={{ padding: '10px', background: 'var(--surface-raised)', border: '1px solid var(--border-soft)', borderRadius: '6px', color: '#fff' }}
              />
              <input
                type="password" placeholder="Password (min 6 chars)" required minLength={6}
                value={formData.password} onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                style={{ padding: '10px', background: 'var(--surface-raised)', border: '1px solid var(--border-soft)', borderRadius: '6px', color: '#fff' }}
              />
              <select
                value={formData.role} onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                style={{ padding: '10px', background: 'var(--surface-raised)', border: '1px solid var(--border-soft)', borderRadius: '6px', color: '#fff' }}
              >
                <option value="user">Trader (Standard User)</option>
                <option value="admin">Administrator</option>
              </select>

              <div style={{ display: 'flex', gap: '10px', marginTop: '12px' }}>
                <Button type="submit" style={{ flex: 1 }}>Save Account</Button>
                <Button variant="outline" type="button" onClick={() => setShowAddModal(false)}>Cancel</Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

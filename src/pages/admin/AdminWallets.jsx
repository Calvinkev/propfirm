import { useState, useEffect } from 'react'
import Card from '../../components/Card'
import { api } from '../../services/api'
import { useAuth } from '../../context/AuthContext'
import './AdminPages.css'

const COINS = ['USDT','BTC','ETH','SOL','BNB','XRP','DOGE','ADA','LTC','AVAX','LINK','MATIC','DOT','TRX','UNI','ATOM']

export default function AdminWallets() {
  const { token } = useAuth()
  const [wallets, setWallets] = useState([])
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState(null)
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState({ id: null, symbol: 'USDT', network: '', address: '', instructions: '', isActive: 1 })
  const [saving, setSaving] = useState(false)

  const toast_ = (type, msg) => { setToast({ type, msg }); setTimeout(() => setToast(null), 3500) }

  const load = async () => {
    setLoading(true)
    try {
      const res = await api.getAdminCryptoWallets(token)
      if (res.wallets) setWallets(res.wallets)
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [token])

  const openAdd = () => {
    setForm({ id: null, symbol: 'USDT', network: '', address: '', instructions: '', isActive: 1 })
    setShowModal(true)
  }
  const openEdit = (w) => {
    setForm({ id: w.id, symbol: w.symbol, network: w.network, address: w.address, instructions: w.instructions || '', isActive: w.is_active })
    setShowModal(true)
  }

  const handleSave = async (e) => {
    e.preventDefault()
    setSaving(true)
    const res = await api.saveAdminCryptoWallet(token, form)
    setSaving(false)
    if (res.error) { toast_('error', res.error); return }
    toast_('success', form.id ? 'Wallet updated' : 'Wallet added')
    setShowModal(false)
    load()
  }

  const handleToggle = async (id) => {
    const res = await api.toggleAdminCryptoWallet(token, id)
    if (res.error) { toast_('error', res.error); return }
    load()
  }

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this wallet address?')) return
    const res = await api.deleteAdminCryptoWallet(token, id)
    if (res.error) { toast_('error', res.error); return }
    toast_('success', 'Wallet deleted')
    load()
  }

  // Group wallets by coin for display
  const grouped = COINS.map(coin => ({
    coin,
    wallets: wallets.filter(w => w.symbol === coin)
  })).filter(g => g.wallets.length > 0)

  return (
    <div className="admin-page">
      {toast && <div className={`adm-toast ${toast.type}`}>{toast.msg}</div>}

      <div className="admin-topbar">
        <div>
          <h1>Deposit Wallets</h1>
          <div className="sub">Set the wallet address users see when depositing each coin. Each coin shows the same address to all users.</div>
        </div>
        <button className="adm-btn-primary" onClick={openAdd}>+ Add Wallet</button>
      </div>

      {loading ? <div className="adm-loading">Loading…</div> : (
        <>
          {/* Quick status — which coins have an active wallet */}
          <div className="adm-coin-status-grid">
            {COINS.map(coin => {
              const active = wallets.find(w => w.symbol === coin && w.is_active)
              return (
                <div key={coin} className={`adm-coin-chip ${active ? 'has-wallet' : 'no-wallet'}`}>
                  <span className="adm-coin-dot" />
                  {coin}
                </div>
              )
            })}
          </div>

          <Card className="admin-panel">
            <div className="panel-head"><h3>Configured Wallets</h3></div>
            <div className="adm-table-wrap">
            <table className="admin-table">
              <thead>
                <tr><th>Coin</th><th>Network</th><th>Wallet Address</th><th>Instructions</th><th>Status</th><th>Actions</th></tr>
              </thead>
              <tbody>
                {wallets.length === 0
                  ? <tr><td colSpan={6} className="adm-empty-cell">No wallets configured yet. Add one to let users deposit.</td></tr>
                  : wallets.map(w => (
                    <tr key={w.id}>
                      <td className="mono" style={{fontWeight:700,color:'var(--brass)'}}>{w.symbol}</td>
                      <td>{w.network}</td>
                      <td className="mono adm-hash" style={{maxWidth:260}}>{w.address}</td>
                      <td style={{fontSize:'12px',color:'var(--text-muted)',maxWidth:200}}>{w.instructions || '—'}</td>
                      <td><span className={`status-badge ${w.is_active ? 'completed' : 'rejected'}`}>{w.is_active ? 'ACTIVE' : 'DISABLED'}</span></td>
                      <td>
                        <div className="adm-row-actions">
                          <button className="adm-btn-sm" onClick={() => openEdit(w)}>Edit</button>
                          <button className="adm-btn-sm" onClick={() => handleToggle(w.id)}>{w.is_active ? 'Disable' : 'Enable'}</button>
                          <button className="adm-btn-sm danger" onClick={() => handleDelete(w.id)}>Delete</button>
                        </div>
                      </td>
                    </tr>
                  ))
                }
              </tbody>
            </table>
            </div>
          </Card>
        </>
      )}

      {/* Add / Edit modal */}
      {showModal && (
        <div className="adm-modal-backdrop" onClick={e => e.target === e.currentTarget && setShowModal(false)}>
          <div className="adm-modal">
            <div className="adm-modal-header">
              <h3>{form.id ? 'Edit Wallet' : 'Add Deposit Wallet'}</h3>
              <button className="adm-close" onClick={() => setShowModal(false)}>✕</button>
            </div>
            <form onSubmit={handleSave} className="adm-form">
              <label>Coin</label>
              <select value={form.symbol} onChange={e => setForm({...form, symbol: e.target.value})}>
                {COINS.map(c => <option key={c}>{c}</option>)}
              </select>

              <label>Network / Chain</label>
              <input required placeholder="e.g. TRC20, ERC20, Bitcoin, Solana" value={form.network} onChange={e => setForm({...form, network: e.target.value})} />

              <label>Wallet Address (your receiving address)</label>
              <input required placeholder="Paste wallet address" value={form.address} onChange={e => setForm({...form, address: e.target.value})} style={{fontFamily:'monospace'}} />

              <label>Deposit Instructions (optional)</label>
              <textarea rows={3} placeholder="e.g. Send exact USDT via TRC20 only." value={form.instructions} onChange={e => setForm({...form, instructions: e.target.value})} />

              <label style={{display:'flex',alignItems:'center',gap:8,cursor:'pointer'}}>
                <input type="checkbox" checked={!!form.isActive} onChange={e => setForm({...form, isActive: e.target.checked ? 1 : 0})} />
                Active (visible to users)
              </label>

              <button type="submit" className="adm-btn-primary" disabled={saving}>{saving ? 'Saving…' : form.id ? 'Update Wallet' : 'Add Wallet'}</button>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

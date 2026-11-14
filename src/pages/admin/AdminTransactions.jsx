import { useState, useEffect } from 'react'
import Card from '../../components/Card'
import { api } from '../../services/api'
import { useAuth } from '../../context/AuthContext'
import './AdminPages.css'

const STATUS_COLORS = { won:'#10B981', lost:'#EF4444', open:'#F59E0B', completed:'#10B981', disputed:'#EF4444', cancelled:'#6B7280', pending:'#F59E0B', paid:'#3B82F6' }

export default function AdminTransactions() {
  const { token } = useAuth()
  const [tab, setTab] = useState('quick')
  const [quickTrades, setQuickTrades] = useState([])
  const [p2pOrders, setP2pOrders] = useState([])
  const [loading, setLoading] = useState(false)
  const [toast, setToast] = useState(null)
  const [acting, setActing] = useState(null)

  const toast_ = (type, msg) => { setToast({ type, msg }); setTimeout(() => setToast(null), 3500) }

  const loadQuick = async () => {
    setLoading(true)
    try {
      const res = await api.getAdminQuickTrades(token)
      if (res.trades) setQuickTrades(res.trades)
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }

  const loadP2P = async () => {
    setLoading(true)
    try {
      const res = await api.getAdminP2POrders(token)
      if (res.orders) setP2pOrders(res.orders)
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }

  useEffect(() => {
    if (tab === 'quick') loadQuick()
    else loadP2P()
  }, [tab, token])

  const resolveDispute = async (id, favour) => {
    if (!window.confirm(`Resolve in favour of ${favour}?`)) return
    setActing(id)
    const res = await api.resolveAdminP2PDispute(token, id, favour)
    setActing(null)
    if (res.error) { toast_('error', res.error); return }
    toast_('success', res.message)
    loadP2P()
  }

  // Quick trade stats
  const qtWon  = quickTrades.filter(t => t.status === 'won').length
  const qtTotal = quickTrades.length
  const qtProfit = quickTrades.filter(t=>t.status==='won').reduce((s,t)=>s+parseFloat(t.profit||0),0)

  // P2P stats
  const p2pDisputed = p2pOrders.filter(o => o.status === 'disputed').length
  const p2pCompleted = p2pOrders.filter(o => o.status === 'completed').length

  return (
    <div className="admin-page">
      {toast && <div className={`adm-toast ${toast.type}`}>{toast.msg}</div>}

      <div className="admin-topbar">
        <div><h1>Transactions</h1><div className="sub">Quick trades and P2P orders across the platform</div></div>
      </div>

      {/* Tabs */}
      <div className="adm-tabs">
        <button className={`adm-tab ${tab==='quick'?'active':''}`} onClick={() => setTab('quick')}>⚡ Quick Trades</button>
        <button className={`adm-tab ${tab==='p2p'  ?'active':''}`} onClick={() => setTab('p2p')}>🤝 P2P Orders</button>
      </div>

      {/* ── QUICK TRADES ── */}
      {tab === 'quick' && (
        <>
          <div className="admin-grid-3">
            <Card className="admin-kpi"><label>Total Trades</label><div className="val">{qtTotal}</div></Card>
            <Card className="admin-kpi"><label>Won</label><div className="val" style={{color:'var(--green)'}}>{qtWon}</div></Card>
            <Card className="admin-kpi"><label>Total Profit Paid Out</label><div className="val" style={{color:'var(--brass)'}}>${qtProfit.toLocaleString(undefined,{minimumFractionDigits:2})}</div></Card>
          </div>
          <Card className="admin-panel" style={{marginTop:16}}>
            <div className="panel-head"><h3>All Quick Trades</h3></div>
            {loading ? <div className="adm-loading">Loading…</div> : (
              <div className="adm-table-wrap">
              <table className="admin-table">
                <thead><tr><th>User</th><th>Symbol</th><th>Direction</th><th>Amount</th><th>Profit</th><th>Status</th><th>Time</th></tr></thead>
                <tbody>
                  {quickTrades.length === 0
                    ? <tr><td colSpan={7} className="adm-empty-cell">No quick trades yet</td></tr>
                    : quickTrades.map(t => (
                      <tr key={t.id}>
                        <td><div className="user-cell"><div className="user-avatar">{t.first_name[0]}</div><div><b>{t.first_name} {t.last_name}</b><span>{t.email}</span></div></div></td>
                        <td className="mono">{t.symbol}</td>
                        <td><span style={{color: t.direction==='BUY'?'#10B981':'#EF4444',fontWeight:700}}>{t.direction==='BUY'?'▲ UP':'▼ DOWN'}</span></td>
                        <td className="mono">${parseFloat(t.amount).toFixed(2)}</td>
                        <td className="mono" style={{color: t.status==='won'?'#10B981':'var(--text-muted)',fontWeight:600}}>
                          {t.status==='won' ? `+$${parseFloat(t.profit).toFixed(2)}` : '—'}
                        </td>
                        <td><span className="status-badge" style={{background: STATUS_COLORS[t.status]+'22', color: STATUS_COLORS[t.status]}}>{t.status}</span></td>
                        <td className="mono" style={{fontSize:'11px'}}>{new Date(t.created_at).toLocaleString()}</td>
                      </tr>
                    ))
                  }
                </tbody>
              </table>
              </div>
            )}
          </Card>
        </>
      )}

      {/* ── P2P ORDERS ── */}
      {tab === 'p2p' && (
        <>
          <div className="admin-grid-3">
            <Card className="admin-kpi"><label>Total Orders</label><div className="val">{p2pOrders.length}</div></Card>
            <Card className="admin-kpi"><label>Completed</label><div className="val" style={{color:'var(--green)'}}>{p2pCompleted}</div></Card>
            <Card className="admin-kpi"><label>Disputed</label><div className="val" style={{color:'#EF4444'}}>{p2pDisputed}</div><div className="delta" style={{color:'#EF4444'}}>Needs resolution</div></Card>
          </div>
          <Card className="admin-panel" style={{marginTop:16}}>
            <div className="panel-head"><h3>All P2P Orders</h3></div>
            {loading ? <div className="adm-loading">Loading…</div> : (
              <div className="adm-table-wrap">
              <table className="admin-table">
                <thead><tr><th>Buyer</th><th>Seller</th><th>Asset</th><th>Crypto</th><th>Fiat</th><th>Payment</th><th>Status</th><th>Actions</th></tr></thead>
                <tbody>
                  {p2pOrders.length === 0
                    ? <tr><td colSpan={8} className="adm-empty-cell">No P2P orders yet</td></tr>
                    : p2pOrders.map(o => (
                      <tr key={o.id}>
                        <td><div className="user-cell"><div className="user-avatar">{o.buyer_first[0]}</div><div><b>{o.buyer_first} {o.buyer_last}</b><span>{o.buyer_email}</span></div></div></td>
                        <td><div className="user-cell"><div className="user-avatar">{o.seller_first[0]}</div><div><b>{o.seller_first} {o.seller_last}</b><span>{o.seller_email}</span></div></div></td>
                        <td className="mono"><b>{o.asset}</b></td>
                        <td className="mono">{parseFloat(o.crypto_amount).toFixed(6)}</td>
                        <td className="mono">{parseFloat(o.fiat_amount).toLocaleString(undefined,{minimumFractionDigits:2})} {o.fiat}</td>
                        <td>{o.payment_method}</td>
                        <td><span className="status-badge" style={{background:STATUS_COLORS[o.status]+'22',color:STATUS_COLORS[o.status]}}>{o.status}</span></td>
                        <td>
                          {o.status === 'disputed' && (
                            <div className="adm-row-actions">
                              <button className="adm-btn-sm success" disabled={acting===o.id} onClick={() => resolveDispute(o.id,'buyer')}>→ Buyer</button>
                              <button className="adm-btn-sm" disabled={acting===o.id} onClick={() => resolveDispute(o.id,'seller')}>→ Seller</button>
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
        </>
      )}
    </div>
  )
}

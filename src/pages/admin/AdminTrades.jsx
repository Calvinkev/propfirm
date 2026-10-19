import { useState, useEffect } from 'react'
import Card from '../../components/Card'
import { api } from '../../services/api'
import { useAuth } from '../../context/AuthContext'
import './AdminPages.css'

export default function AdminTrades() {
  const { token } = useAuth()
  const [trades, setTrades] = useState([])
  const [loading, setLoading] = useState(true)

  const loadTrades = async () => {
    try {
      setLoading(true)
      const res = await api.getAdminTrades(token)
      if (res.trades) {
        setTrades(res.trades)
      }
    } catch (err) {
      console.error('Failed to load admin trades:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadTrades()
  }, [token])

  return (
    <div className="admin-page">
      <div className="admin-topbar">
        <div>
          <h1>Global Live Trades Monitor</h1>
          <div className="sub">Monitor real-time positions, risk exposures, and trade history across all trader accounts</div>
        </div>
      </div>

      <div className="admin-grid-3">
        <Card className="admin-kpi">
          <label>Total Trades Logged</label>
          <div className="val">{trades.length}</div>
          <div className="delta up">▲ Platform Executions</div>
        </Card>
        <Card className="admin-kpi">
          <label>Currently Open Positions</label>
          <div className="val">{trades.filter(t => t.status === 'Open').length}</div>
          <div className="delta up">▲ Live Market Exposure</div>
        </Card>
        <Card className="admin-kpi">
          <label>Closed Trades</label>
          <div className="val">{trades.filter(t => t.status === 'Closed' || t.status === 'filled').length}</div>
          <div className="delta up">▲ Completed Orders</div>
        </Card>
      </div>

      <Card className="admin-panel">
        <div className="panel-head">
          <h3>Real-Time Trade Feed</h3>
        </div>

        {loading ? (
          <div style={{ padding: '30px 0', textAlign: 'center', color: 'var(--text-faint)' }}>Loading trades...</div>
        ) : (
          <table className="admin-table">
            <thead>
              <tr>
                <th>Symbol</th>
                <th>Trader</th>
                <th>Account</th>
                <th>Side</th>
                <th>Lots / Size</th>
                <th>Entry Price</th>
                <th>Exit Price</th>
                <th>P&L</th>
                <th>Status</th>
                <th>Opened Time</th>
              </tr>
            </thead>
            <tbody>
              {trades.map((t) => {
                const pnl = parseFloat(t.pnl || 0)
                return (
                  <tr key={t.id}>
                    <td className="mono" style={{ fontWeight: 600 }}>{t.symbol}</td>
                    <td>
                      <div className="user-cell">
                        <div className="user-avatar">{(t.first_name || 'T')[0]}</div>
                        <div>
                          <b>{t.first_name} {t.last_name}</b>
                          <span>{t.email}</span>
                        </div>
                      </div>
                    </td>
                    <td className="mono">{t.account_id}</td>
                    <td>
                      <span className={t.side === 'BUY' || t.side === 'buy' ? 'tag-buy' : 'tag-sell'}>
                        {(t.side || 'BUY').toUpperCase()}
                      </span>
                    </td>
                    <td className="mono">{parseFloat(t.size || t.lots || 0).toFixed(2)}</td>
                    <td className="mono">{parseFloat(t.entry_price || t.open_price || 0).toFixed(5)}</td>
                    <td className="mono">{t.exit_price || t.close_price ? parseFloat(t.exit_price || t.close_price).toFixed(5) : 'Open'}</td>
                    <td className="mono" style={{ color: pnl >= 0 ? 'var(--green)' : 'var(--red)', fontWeight: 600 }}>
                      {pnl >= 0 ? '+' : ''}${pnl.toFixed(2)}
                    </td>
                    <td>
                      <span className={`status-badge ${(t.status || 'open').toLowerCase()}`}>{t.status || 'Open'}</span>
                    </td>
                    <td className="mono" style={{ fontSize: '11px', color: 'var(--text-faint)' }}>
                      {new Date(t.opened_at || t.openedAt || Date.now()).toLocaleString()}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  )
}

import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../context/AuthContext'
import { api } from '../services/api'
import { wsService } from '../services/websocket'
import Card from '../components/Card'
import TradingChart from '../components/demo/TradingChart'
import OrderPanel from '../components/demo/OrderPanel'
import PositionsTable from '../components/demo/PositionsTable'
import PerformanceDashboard from '../components/demo/PerformanceDashboard'
import './TradingDesk.css'

const TABS = ['Trade', 'History', 'Performance']

export default function TradingDesk() {
  const { user, token } = useAuth()

  // Account state — scoped to the logged-in user via GET /api/demo/accounts/me
  const [demoAccount, setDemoAccount] = useState(null)

  // Instruments & prices
  const [instruments,    setInstruments]    = useState([])
  const [selectedSymbol, setSelectedSymbol] = useState('BTCUSD')
  const [livePrices,     setLivePrices]     = useState({}) // symbol -> { bid, ask }

  // Positions
  const [positions, setPositions] = useState([])
  const [closing,   setClosing]   = useState(new Set())

  // Trade history
  const [history, setHistory] = useState([])

  // Equity curve / performance
  const [curve, setCurve] = useState([])
  const [stats,  setStats] = useState(null)

  // UI
  const [tab,     setTab]     = useState('Trade')
  const [loading, setLoading] = useState(true)
  const [toast,   setToast]   = useState(null) // { type, msg }

  // ── Toast ─────────────────────────────────────────────────────────────────
  const showToast = useCallback((type, msg) => {
    setToast({ type, msg })
    setTimeout(() => setToast(null), 4000)
  }, [])

  // ── Init: fetch user's demo account (auto-creates if first visit) ─────────
  useEffect(() => {
    if (!token) { setLoading(false); return }

    const init = async () => {
      try {
        // 0. Ensure WebSocket is connected for this session
        if (!wsService.isConnected) {
          wsService.connect(token)
        }

        // 1. Fetch instruments + current prices
        const instrRes = await api.getDemoInstruments(token)
        if (instrRes.instruments) {
          setInstruments(instrRes.instruments)
          const prices = {}
          instrRes.instruments.forEach(i => {
            if (i.bid || i.ask) prices[i.symbol] = { bid: i.bid, ask: i.ask }
          })
          setLivePrices(prices)
        }

        // 2. Get (or auto-create) this user's demo account — no localStorage needed
        const demoRes = await api.getMyDemoAccount(token)
        if (demoRes.error) {
          showToast('error', demoRes.error)
          return
        }

        const account = demoRes.account
        setDemoAccount(account)

        // 3. Load account data in parallel
        const [posRes, equityRes] = await Promise.all([
          api.getDemoPositions(token, account.id),
          api.getDemoEquityCurve(token, account.id),
        ])

        if (posRes.positions)   setPositions(posRes.positions)
        if (equityRes.curve)    setCurve(equityRes.curve)
        if (equityRes.stats)    setStats(equityRes.stats)

      } catch (err) {
        console.error('TradingDesk init error:', err)
        showToast('error', 'Failed to load trading desk')
      } finally {
        setLoading(false)
      }
    }

    init()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token])

  // ── Data refresh helpers ──────────────────────────────────────────────────
  const refreshPositions = useCallback(async () => {
    if (!demoAccount) return
    try {
      const posRes = await api.getDemoPositions(token, demoAccount.id)
      if (posRes.positions) setPositions(posRes.positions)
    } catch (err) {
      console.error('refreshPositions error:', err)
    }
  }, [demoAccount, token])

  const refreshHistory = useCallback(async () => {
    if (!demoAccount) return
    try {
      const res = await api.getDemoHistory(token, demoAccount.id)
      if (res.trades) setHistory(res.trades)
    } catch (err) {
      console.error('refreshHistory error:', err)
    }
  }, [demoAccount, token])

  const refreshPerformance = useCallback(async () => {
    if (!demoAccount) return
    try {
      const res = await api.getDemoEquityCurve(token, demoAccount.id)
      if (res.curve) setCurve(res.curve)
      if (res.stats) setStats(res.stats)
    } catch (err) {
      console.error('refreshPerformance error:', err)
    }
  }, [demoAccount, token])

  // ── Tab: lazy-load data on switch ─────────────────────────────────────────
  useEffect(() => {
    if (!demoAccount) return
    if (tab === 'History')     refreshHistory()
    if (tab === 'Performance') refreshPerformance()
  }, [tab, demoAccount]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── WebSocket: live price sync ────────────────────────────────────────────
  useEffect(() => {
    const handlePriceTick = (data) => {
      setLivePrices(prev => ({ ...prev, [data.symbol]: { bid: data.bid, ask: data.ask } }))
      setInstruments(prev =>
        prev.map(i => i.symbol === data.symbol ? { ...i, bid: data.bid, ask: data.ask } : i)
      )
    }

    wsService.on('price_tick', handlePriceTick)

    return () => {
      wsService.off('price_tick', handlePriceTick)
    }
  })

  // ── Order placed ──────────────────────────────────────────────────────────
  const handleOrderPlaced = async (result) => {
    if (result.position) {
      showToast('success', `Position opened at ${parseFloat(result.position.open_price).toFixed(2)}`)
    } else if (result.order) {
      showToast('success', `Pending ${result.order.order_type} order placed`)
    }
    await refreshPositions()
  }

  // ── Close position ────────────────────────────────────────────────────────
  const handleClosePosition = async (positionId) => {
    setClosing(prev => new Set(prev).add(positionId))
    try {
      const res = await api.closeDemoPosition(token, positionId)
      if (res.error) {
        showToast('error', res.error)
      } else {
        const pnl = res.profit
        showToast(
          pnl >= 0 ? 'success' : 'error',
          `Position closed — ${pnl >= 0 ? '+' : ''}$${parseFloat(pnl).toFixed(2)} P&L`
        )
        await refreshPositions()
        if (tab === 'Performance') refreshPerformance()
      }
    } catch (err) {
      showToast('error', 'Failed to close position')
    } finally {
      setClosing(prev => { const s = new Set(prev); s.delete(positionId); return s })
    }
  }

  const currentPrice = livePrices[selectedSymbol] || {}

  // ── Loading ───────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="trading-desk loading">
        <span>Loading trading desk…</span>
      </div>
    )
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="trading-desk">
      {/* Toast */}
      {toast && (
        <div className={`desk-toast ${toast.type}`}>{toast.msg}</div>
      )}

      {/* Header */}
      <div className="desk-header">
        <div>
          <h1>Trading Desk</h1>
          <span className="desk-sub">
            {user?.firstName} {user?.lastName} · Demo account
          </span>
        </div>
        <div className="desk-tabs">
          {TABS.map(t => (
            <button
              key={t}
              className={`desk-tab ${tab === t ? 'active' : ''}`}
              onClick={() => setTab(t)}
            >
              {t}
              {t === 'Trade' && positions.length > 0 && (
                <span className="tab-badge">{positions.length}</span>
              )}
            </button>
          ))}
        </div>
      </div>


      {/* ── TRADE TAB ── */}
      {tab === 'Trade' && (
        <div className="trade-layout">
          {/* Left: chart + open positions */}
          <div className="chart-col">
            <TradingChart
              symbol={selectedSymbol}
              bid={currentPrice.bid}
              ask={currentPrice.ask}
              token={token}
              instruments={instruments}
              onSymbolChange={setSelectedSymbol}
            />
            <Card className="panel" style={{ marginTop: '18px' }}>
              <div className="panel-head">
                <h3>Open Positions</h3>
                <span style={{ fontSize: '12px', color: 'var(--text-faint)', fontFamily: 'var(--mono)' }}>
                  {positions.length} open
                </span>
              </div>
              <PositionsTable
                positions={positions}
                onClose={handleClosePosition}
                closing={closing}
              />
            </Card>
          </div>

          {/* Right: order panel */}
          <div className="order-col">
            <OrderPanel
              instruments={instruments}
              selectedSymbol={selectedSymbol}
              onSymbolChange={setSelectedSymbol}
              demoAccountId={demoAccount?.id}
              onOrderPlaced={handleOrderPlaced}
              onError={(msg) => showToast('error', msg)}
              token={token}
              api={api}
            />
          </div>
        </div>
      )}

      {/* ── HISTORY TAB ── */}
      {tab === 'History' && (
        <Card className="panel">
          <div className="panel-head">
            <h3>Closed Trades</h3>
            <span style={{ fontSize: '12px', color: 'var(--text-faint)', fontFamily: 'var(--mono)' }}>
              {history.length} trades
            </span>
          </div>
          {history.length === 0 ? (
            <div style={{ padding: '30px', textAlign: 'center', color: 'var(--text-faint)', fontFamily: 'var(--mono)', fontSize: '13px' }}>
              No closed trades yet.
            </div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Symbol</th>
                  <th>Dir</th>
                  <th>Lots</th>
                  <th>Open Price</th>
                  <th>Close Price</th>
                  <th>P&L</th>
                  <th>Opened</th>
                  <th>Closed</th>
                </tr>
              </thead>
              <tbody>
                {history.map(t => {
                  const pnl = parseFloat(t.profit || 0)
                  const dec = t.symbol?.includes('BTC') || t.symbol?.includes('ETH') ? 2 : 5
                  return (
                    <tr key={t.id}>
                      <td><b>{t.symbol}</b></td>
                      <td>
                        <span className={t.direction === 'buy' ? 'tag-buy' : 'tag-sell'}>
                          {t.direction?.toUpperCase()}
                        </span>
                      </td>
                      <td className="mono">{parseFloat(t.lots).toFixed(2)}</td>
                      <td className="mono">{parseFloat(t.open_price).toFixed(dec)}</td>
                      <td className="mono">{parseFloat(t.close_price).toFixed(dec)}</td>
                      <td className={pnl >= 0 ? 'pl-pos' : 'pl-neg'}>
                        {pnl >= 0 ? '+' : ''}${Math.abs(pnl).toFixed(2)}
                      </td>
                      <td className="mono" style={{ fontSize: '11px', color: 'var(--text-faint)' }}>
                        {new Date(t.opened_at).toLocaleDateString()}
                      </td>
                      <td className="mono" style={{ fontSize: '11px', color: 'var(--text-faint)' }}>
                        {t.closed_at ? new Date(t.closed_at).toLocaleDateString() : '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </Card>
      )}

      {/* ── PERFORMANCE TAB ── */}
      {tab === 'Performance' && (
        <PerformanceDashboard curve={curve} stats={stats} />
      )}
    </div>
  )
}

import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import Card from '../components/Card'
import Button from '../components/Button'
import { api } from '../services/api'
import { wsService } from '../services/websocket'
import { useAuth } from '../context/AuthContext'
import './Dashboard.css'

// Build a simple SVG equity curve from daily PnL data
function EquityCurve({ data, startBalance }) {
  if (!data || data.length === 0) {
    return (
      <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-faint)', fontFamily: 'var(--mono)', fontSize: '13px' }}>
        No trade history yet — equity curve will appear once you close trades.
      </div>
    )
  }

  // Build cumulative equity points
  let running = startBalance
  const points = data.map((d) => {
    if (d.equity !== undefined) {
      running = parseFloat(d.equity)
    } else {
      running += parseFloat(d.daily_pnl || 0)
    }
    return running
  })

  const min = Math.min(...points)
  const max = Math.max(...points)
  const range = max - min || 1
  const W = 900, H = 200, PAD = 10

  const coords = points.map((v, i) => {
    const x = (i / (points.length - 1 || 1)) * W
    const y = PAD + (1 - (v - min) / range) * (H - PAD * 2)
    return `${x},${y}`
  })
  const polyline = coords.join(' ')
  const fillPath = `M0,${H} L${coords[0].split(',')[0]},${coords[0].split(',')[1]} ${coords.slice(1).join(' ')} L${W},${H} Z`

  const peakEquity = Math.max(...points)
  const lowestEquity = Math.min(...points)
  const totalPnL = points[points.length - 1] - startBalance

  return (
    <>
      <div className="curve-wrap">
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} preserveAspectRatio="none">
          <defs>
            <linearGradient id="curveFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#C9A227" stopOpacity="0.28" />
              <stop offset="100%" stopColor="#C9A227" stopOpacity="0" />
            </linearGradient>
          </defs>
          <line x1="0" y1={H / 3} x2={W} y2={H / 3} stroke="#26292E" strokeWidth="1" />
          <line x1="0" y1={(H * 2) / 3} x2={W} y2={(H * 2) / 3} stroke="#26292E" strokeWidth="1" />
          <path d={fillPath} fill="url(#curveFill)" />
          <polyline points={polyline} fill="none" stroke="#C9A227" strokeWidth="2.5" />
        </svg>
      </div>
      <div className="curve-meta">
        <div>Peak Equity<b>${peakEquity.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</b></div>
        <div>Lowest Point<b>${lowestEquity.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</b></div>
        <div>Total P&L<b style={{ color: totalPnL >= 0 ? 'var(--green)' : 'var(--red)' }}>
          {totalPnL >= 0 ? '+' : ''}${totalPnL.toFixed(2)}
        </b></div>
        <div>Data Points<b>{data.length} {data[0]?.equity !== undefined ? 'snapshots' : 'days'}</b></div>
      </div>
    </>
  )
}

export default function Dashboard() {
  const { user, token } = useAuth()
  const navigate = useNavigate()
  const [accounts, setAccounts] = useState([])
  const [selectedAccount, setSelectedAccount] = useState(null)
  const [trades, setTrades] = useState([])
  const [stats, setStats] = useState(null)
  const [equityData, setEquityData] = useState([])
  const [loading, setLoading] = useState(true)
  const [marketData, setMarketData] = useState({})

  // Format today's date
  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })

  useEffect(() => {
    if (!token) { setLoading(false); return }

    const fetchAll = async () => {
      try {
        // Fetch profile + accounts
        const profile = await api.getProfile(token)
        let hasAccounts = false
        
        if (profile.accounts && profile.accounts.length > 0) {
          setAccounts(profile.accounts)
          hasAccounts = true
          const acct = profile.accounts[0]
          setSelectedAccount(acct)

          // Fetch trades for this account
          const tradesRes = await api.getAccountTrades(token, acct.id)
          if (tradesRes.trades) setTrades(tradesRes.trades)

          // Fetch trading stats
          const statsRes = await api.getTradingStats(token, acct.id)
          if (statsRes.overall) setStats(statsRes.overall)

          // Fetch equity curve data
          const perfRes = await api.getAccountPerformance(token, acct.id)
          if (perfRes.dailyPnL) setEquityData(perfRes.dailyPnL)

          // Connect WebSocket
          wsService.connect(token)
          wsService.subscribeToAccount(acct.id)
          wsService.subscribeToMarketData(['EUR/USD', 'GBP/USD', 'USD/JPY', 'BTC/USD', 'XAU/USD'])
        } else {
          // No regular accounts, check for demo account
          try {
            const demoAccount = await api.getMyDemoAccount(token)
            const acct = demoAccount?.account
            if (acct && acct.id) {
              // Treat demo account as a regular account for display
              setAccounts([acct])
              hasAccounts = true
              setSelectedAccount(acct)

              // Fetch demo positions and history
              const [positionsRes, historyRes, equityRes] = await Promise.all([
                api.getDemoPositions(token, acct.id),
                api.getDemoHistory(token, acct.id),
                api.getDemoEquityCurve(token, acct.id)
              ])

              let combinedTrades = []
              if (positionsRes.positions) {
                combinedTrades = [...combinedTrades, ...positionsRes.positions]
              }
              if (historyRes.trades) {
                combinedTrades = [...combinedTrades, ...historyRes.trades]
              }
              setTrades(combinedTrades)

              if (equityRes.curve) {
                setEquityData(equityRes.curve)
              }

              // Connect WebSocket
              wsService.connect(token)
            }
          } catch (demoErr) {
            // No demo account either - user truly has no accounts
          }
        }
      } catch (err) {
        console.error('Dashboard fetch error:', err)
      } finally {
        setLoading(false)
      }
    }
    fetchAll()
  }, [token])

  // Fetch trades/stats when selected account changes
  const handleAccountChange = async (acct) => {
    if (selectedAccount) wsService.unsubscribeFromAccount(selectedAccount.id)
    setSelectedAccount(acct)
    wsService.subscribeToAccount(acct.id)
    try {
      const [tradesRes, statsRes, perfRes] = await Promise.all([
        api.getAccountTrades(token, acct.id),
        api.getTradingStats(token, acct.id),
        api.getAccountPerformance(token, acct.id),
      ])
      if (tradesRes.trades) setTrades(tradesRes.trades)
      if (statsRes.overall) setStats(statsRes.overall)
      if (perfRes.dailyPnL) setEquityData(perfRes.dailyPnL)
    } catch (err) {
      console.error('Account switch fetch error:', err)
    }
  }

  // WebSocket listeners
  useEffect(() => {
    wsService.on('account_update', (data) => {
      if (data.accountId === selectedAccount?.id) {
        setSelectedAccount(prev => ({ ...prev, ...data.data }))
      }
    })
    wsService.on('market_data', (data) => {
      setMarketData(prev => ({ ...prev, [data.symbol]: data.data }))
    })
    wsService.on('breach_alert', (data) => {
      if (data.accountId === selectedAccount?.id) {
        api.getAccount(token, data.accountId).then(res => {
          if (res.account) setSelectedAccount(prev => ({ ...prev, ...res.account }))
        })
      }
    })
  }, [selectedAccount, token])

  if (loading) {
    return (
      <div className="dashboard" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', color: 'var(--text-muted)', fontFamily: 'var(--mono)', fontSize: '13px' }}>
        Loading…
      </div>
    )
  }

  // No accounts yet — full onboarding CTA
  if (accounts.length === 0) {
    return (
      <div className="dashboard">
        <div className="topbar">
          <div>
            <h1>Welcome, {user?.firstName}</h1>
            <div className="sub">{today}</div>
          </div>
        </div>

        <div className="onboarding-hero">
          <div className="onboarding-content">
            <div className="onboarding-icon">⚡</div>
            <h2>Start your first challenge</h2>
            <p>
              Choose an account size, pass the objectives, and trade our capital —
              keeping up to 90% of profits. The whole process starts with one click.
            </p>
            <Button
              onClick={() => navigate('/checkout')}
              style={{ padding: '13px 32px', fontSize: '15px' }}
            >
              Start a Challenge →
            </Button>
          </div>

          {/* Steps preview */}
          <div className="onboarding-steps">
            <div className="ob-step">
              <div className="ob-step-num">01</div>
              <div>
                <h4>Pick an account size</h4>
                <p>From $1,000 up to $100,000 — five tiers, one rule set.</p>
              </div>
            </div>
            <div className="ob-step-divider" />
            <div className="ob-step">
              <div className="ob-step-num">02</div>
              <div>
                <h4>Pass the challenge</h4>
                <p>Hit your profit target in 30 days while staying within drawdown limits.</p>
              </div>
            </div>
            <div className="ob-step-divider" />
            <div className="ob-step">
              <div className="ob-step-num">03</div>
              <div>
                <h4>Get funded &amp; paid</h4>
                <p>Trade a live capital account and request payouts from day one.</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // User has accounts - show performance dashboard (no CTA to start new challenge)
  // Only show "Start a Challenge" button in a subtle way if they want to add another

  const account = selectedAccount || {}

  const balance  = parseFloat(account.balance || 0)
  const equity   = parseFloat(account.equity  || balance)

  const isDemo = !account.account_type;

  // Use the very first snapshot's balance as the starting balance for demo accounts
  // because the live account balance gets updated dynamically.
  const startBalance = isDemo && equityData.length > 0 
    ? parseFloat(equityData[0].balance) 
    : parseFloat(account.account_size || account.balance || 0)

  // DB progress target values are stored as percentages (e.g. 8 for 8%, 5 for 5%)
  const profitTargetPct = isDemo ? 10 : parseFloat(account.profit_target ?? 10);
  const dailyLossLimitPct = isDemo ? 5 : parseFloat(account.daily_loss_limit ?? 5);
  const drawdownLimitPct = isDemo ? 10 : parseFloat(account.max_drawdown_limit ?? 10);
  
  // Dynamically compute actual progress from live equity and starting balance
  const currentProfitPct = startBalance > 0 ? ((equity - startBalance) / startBalance * 100) : 0;
  
  // Today's trades (opened today)
  const todayStr   = new Date().toDateString()
  const todayTrades = trades.filter(t => new Date(t.opened_at).toDateString() === todayStr)
  // Support both t.pnl (regular) and t.profit (demo)
  const todayPnL   = todayTrades.reduce((s, t) => s + parseFloat(t.pnl ?? t.profit ?? 0), 0)
  
  // Daily loss is based on today's closed trades + floating PnL (for now using todayPnL)
  const dailyLossUsedPct = (startBalance > 0 && todayPnL < 0) ? (Math.abs(todayPnL) / startBalance * 100) : 0;
  
  // Drawdown is based on peak equity drop, simplified here as drop below starting balance
  const drawdownUsedPct = (startBalance > 0 && equity < startBalance) ? ((startBalance - equity) / startBalance * 100) : 0;
  
  const tradingDays = parseInt(account.trading_days_completed ?? account.trading_days ?? 0);
  const daysRequired = isDemo ? 5 : parseInt(account.trading_days_required ?? 5);

  const currentProfit = currentProfitPct > 0 ? currentProfitPct : 0; // only positive counts toward target visually
  
  const profitPercent = profitTargetPct > 0 ? ((currentProfit / profitTargetPct) * 100).toFixed(1) : 0;
  const dailyLossPct = dailyLossLimitPct > 0 ? ((dailyLossUsedPct / dailyLossLimitPct) * 100).toFixed(1) : 0;
  const drawdownPct = drawdownLimitPct > 0 ? ((drawdownUsedPct / drawdownLimitPct) * 100).toFixed(1) : 0;

  // Start date → days elapsed
  const startDate    = account.start_date ? new Date(account.start_date) : null
  const daysElapsed  = startDate ? Math.floor((Date.now() - startDate.getTime()) / 86400000) : 0
  const daysRemaining = Math.max(0, 30 - daysElapsed)



  const fmt = (n, decimals = 2) =>
    parseFloat(n).toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals })

  return (
    <div className="dashboard">
      {/* Topbar */}
      <div className="topbar">
        <div>
          <h1>Welcome back, {user?.firstName}</h1>
          <div className="sub">{today} · {account.status || 'Active'}</div>
        </div>
        <div className="topbar-right">
          {accounts.length > 1 ? (
            <select
              className="acct-switch"
              value={account.id}
              onChange={e => {
                const a = accounts.find(x => x.id === parseInt(e.target.value))
                if (a) handleAccountChange(a)
              }}
              style={{ cursor: 'pointer' }}
            >
              {accounts.map(a => (
                <option key={a.id} value={a.id}>
                  ${a.account_size?.toLocaleString()} · Phase {a.phase} · {a.account_id}
                </option>
              ))}
            </select>
          ) : (
            <div className="acct-switch">
              <div>
                <b>${balance.toLocaleString()} · Phase {account.phase || 1}</b>
                <span>{account.account_id || '—'}</span>
              </div>
              <div className="chev">▾</div>
            </div>
          )}
          {/* Only show "New Challenge" button if user has multiple accounts or explicitly wants to add another */}
          <Button
            onClick={() => navigate('/checkout')}
            style={{ padding: '9px 18px', fontSize: '13px', whiteSpace: 'nowrap', opacity: 0.7 }}
          >
            + Add Account
          </Button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid-4">
        <Card className="kpi">
          <label>Account Balance</label>
          <div className="val">${fmt(balance)}</div>
          <div className={`delta ${currentProfitPct >= 0 ? 'up' : 'down'}`}>
            {currentProfitPct >= 0 ? '▲' : '▼'} ${Math.abs(equity - startBalance).toFixed(2)} ({currentProfitPct.toFixed(2)}%)
          </div>
        </Card>
        <Card className="kpi">
          <label>Current Equity</label>
          <div className="val">${fmt(equity)}</div>
          <div className={`delta ${equity >= startBalance ? 'up' : 'down'}`}>
            {equity >= startBalance ? '▲' : '▼'} ${Math.abs(equity - startBalance).toFixed(2)}
          </div>
        </Card>
        <Card className="kpi">
          <label>Today's P&L</label>
          <div className="val" style={{ color: todayPnL >= 0 ? 'var(--green)' : 'var(--red)' }}>
            {todayPnL >= 0 ? '+' : '−'}${Math.abs(todayPnL).toFixed(2)}
          </div>
          <div className="delta" style={{ color: 'var(--text-faint)' }}>
            {todayTrades.length} trade{todayTrades.length !== 1 ? 's' : ''} today
          </div>
        </Card>
        <Card className="kpi">
          <label>Days Remaining</label>
          <div className="val">
            {daysRemaining}<span style={{ fontSize: '14px', color: 'var(--text-faint)' }}> / 30</span>
          </div>
          <div className="delta" style={{ color: 'var(--text-faint)' }}>
            {tradingDays} / {daysRequired} trading days logged
          </div>
        </Card>
      </div>

      {/* Gauges */}
      <div className="grid-3">
        <Card className="gauge-card">
          <div className="gauge-top">
            <h4>Profit Target</h4>
            <span className="pct" style={{ color: 'var(--brass)' }}>
              {currentProfit.toFixed(1)}% / {profitTargetPct}%
            </span>
          </div>
          <div className="gauge-track">
            <div className="gauge-fill brass" style={{ width: `${Math.min(profitPercent, 100)}%` }} />
          </div>
          <div className="gauge-scale"><span>0%</span><span>Target {profitTargetPct}%</span></div>
        </Card>
        <Card className="gauge-card">
          <div className="gauge-top">
            <h4>Max Daily Loss</h4>
            <span className="pct" style={{ color: dailyLossPct >= 80 ? 'var(--red)' : 'var(--green)' }}>
              {dailyLossUsedPct.toFixed(1)}% / {dailyLossLimitPct}%
            </span>
          </div>
          <div className="gauge-track">
            <div
              className={`gauge-fill ${dailyLossPct >= 80 ? 'red' : 'green'}`}
              style={{ width: `${Math.min(dailyLossPct, 100)}%` }}
            />
          </div>
          <div className="gauge-scale"><span>0%</span><span>Limit {dailyLossLimitPct}%</span></div>
        </Card>
        <Card className="gauge-card">
          <div className="gauge-top">
            <h4>Max Drawdown</h4>
            <span className="pct" style={{ color: drawdownPct >= 80 ? 'var(--red)' : 'var(--green)' }}>
              {drawdownUsedPct.toFixed(1)}% / {drawdownLimitPct}%
            </span>
          </div>
          <div className="gauge-track">
            <div
              className={`gauge-fill ${drawdownPct >= 80 ? 'red' : 'green'}`}
              style={{ width: `${Math.min(drawdownPct, 100)}%` }}
            />
          </div>
          <div className="gauge-scale"><span>0%</span><span>Limit {drawdownLimitPct}%</span></div>
        </Card>
      </div>

      {/* Alerts */}
      {(dailyLossPct >= 80 || drawdownPct >= 80) && (
        <Card className="panel">
          <div className="panel-head"><h3>⚠ Breach Alerts</h3></div>
          <div style={{ paddingTop: '8px' }}>
            {dailyLossPct >= 80 && (
              <div style={{ color: 'var(--red)', padding: '14px', border: '1px solid var(--red)', borderRadius: '8px', marginBottom: '10px', fontSize: '13.5px' }}>
                Daily Loss at {dailyLossUsedPct.toFixed(1)}% of {dailyLossLimitPct}% limit — trade carefully today.
              </div>
            )}
            {drawdownPct >= 80 && (
              <div style={{ color: 'var(--red)', padding: '14px', border: '1px solid var(--red)', borderRadius: '8px', fontSize: '13.5px' }}>
                Max Drawdown at {drawdownUsedPct.toFixed(1)}% of {drawdownLimitPct}% limit.
              </div>
            )}
          </div>
        </Card>
      )}

      {/* Equity Curve */}
      <Card className="panel">
        <div className="panel-head">
          <h3>Equity Curve</h3>
          <span style={{ fontSize: '12px', color: 'var(--text-faint)', fontFamily: 'var(--mono)' }}>Last 30 days</span>
        </div>
        <EquityCurve data={equityData} startBalance={balance} />
      </Card>

      {/* Trading Stats */}
      {stats && (
        <div className="grid-4">
          <Card className="kpi">
            <label>Total Trades</label>
            <div className="val">{stats.totalTrades}</div>
            <div className="delta" style={{ color: 'var(--text-faint)' }}>{stats.winningTrades}W / {stats.losingTrades}L</div>
          </Card>
          <Card className="kpi">
            <label>Win Rate</label>
            <div className="val">{stats.winRate}%</div>
            <div className="delta" style={{ color: 'var(--text-faint)' }}>closed trades</div>
          </Card>
          <Card className="kpi">
            <label>Best Trade</label>
            <div className="val" style={{ color: 'var(--green)', fontSize: '22px' }}>+${parseFloat(stats.bestTrade || 0).toFixed(2)}</div>
            <div className="delta" style={{ color: 'var(--text-faint)' }}>single trade</div>
          </Card>
          <Card className="kpi">
            <label>Worst Trade</label>
            <div className="val" style={{ color: 'var(--red)', fontSize: '22px' }}>${parseFloat(stats.worstTrade || 0).toFixed(2)}</div>
            <div className="delta" style={{ color: 'var(--text-faint)' }}>single trade</div>
          </Card>
        </div>
      )}

      {/* Trade History */}
      <Card className="panel">
        <div className="panel-head">
          <h3>Recent Trades</h3>
          <span style={{ fontSize: '12px', color: 'var(--text-faint)', fontFamily: 'var(--mono)' }}>
            {trades.length} total
          </span>
        </div>
        {trades.length === 0 ? (
          <div style={{ padding: '30px 0', textAlign: 'center', color: 'var(--text-faint)', fontSize: '13px', fontFamily: 'var(--mono)' }}>
            No trades yet on this account.
          </div>
        ) : (
          <div className="table-responsive">
            <table>
              <thead>
                <tr>
                  <th>Symbol</th>
                  <th>Side</th>
                  <th>Size</th>
                  <th>Entry</th>
                  <th>Exit</th>
                  <th>P&L</th>
                  <th>Status</th>
                  <th>Opened</th>
                </tr>
              </thead>
              <tbody>
                {trades.slice(0, 20).map(t => {
                  const pnl = parseFloat(t.pnl ?? t.profit ?? 0)
                  return (
                    <tr key={t.id || Math.random()}>
                      <td>{t.symbol}</td>
                      <td><span className={t.side === 'BUY' ? 'tag-buy' : 'tag-sell'}>{t.side}</span></td>
                      <td className="mono">{parseFloat(t.size).toFixed(2)}</td>
                      <td className="mono">{parseFloat(t.entry_price).toFixed(5)}</td>
                      <td className="mono">{t.exit_price ? parseFloat(t.exit_price).toFixed(5) : <span style={{ color: 'var(--text-faint)' }}>Open</span>}</td>
                      <td className={pnl >= 0 ? 'pl-pos' : 'pl-neg'}>
                        {t.status === 'Open' ? '—' : `${pnl >= 0 ? '+' : ''}$${Math.abs(pnl).toFixed(2)}`}
                      </td>
                      <td>
                        <span className={t.status === 'Open' ? 'tag-buy' : 'tag-sell'} style={t.status === 'Closed' ? { background: 'var(--surface-raised)', color: 'var(--text-muted)' } : {}}>
                          {t.status}
                        </span>
                      </td>
                      <td className="mono" style={{ fontSize: '11px', color: 'var(--text-faint)' }}>
                        {new Date(t.opened_at).toLocaleDateString()}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}

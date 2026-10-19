import { useState, useEffect } from 'react'
import Card from '../components/Card'
import Button from '../components/Button'
import { api } from '../services/api'
import { useAuth } from '../context/AuthContext'
import './Rules.css'

const PHASE_STEPS = [
  { label: 'Registered' },
  { label: 'Challenge' },
  { label: 'Verification' },
  { label: 'Funded' },
]

export default function Rules() {
  const { token } = useAuth()
  const [accounts, setAccounts]               = useState([])
  const [selected, setSelected]               = useState(null)
  const [loading, setLoading]                 = useState(true)

  useEffect(() => {
    if (!token) { setLoading(false); return }
    api.getProfile(token)
      .then(res => {
        if (res.accounts && res.accounts.length > 0) {
          setAccounts(res.accounts)
          setSelected(res.accounts[0])
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [token])

  if (loading) {
    return (
      <div className="rules" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', color: 'var(--text-muted)', fontFamily: 'var(--mono)', fontSize: '13px' }}>
        Loading…
      </div>
    )
  }

  if (!selected) {
    return (
      <div className="rules">
        <div className="topbar">
          <div><h1>Account & Rules</h1><div className="sub">No accounts yet</div></div>
        </div>
        <Card style={{ padding: '40px', textAlign: 'center' }}>
          <p style={{ color: 'var(--text-muted)', marginBottom: '20px' }}>Start a challenge to see your objectives and rule status here.</p>
          <Button onClick={() => window.location.href = '/checkout'}>Start a Challenge →</Button>
        </Card>
      </div>
    )
  }

  const a = selected

  // Challenge progress fields
  const currentProfit   = parseFloat(a.current_profit   ?? 0)
  const profitTarget    = parseFloat(a.profit_target     ?? 10)
  const dailyLossUsed   = parseFloat(a.daily_loss_used   ?? 0)
  const dailyLossLimit  = parseFloat(a.daily_loss_limit  ?? 5)
  const drawdownUsed    = parseFloat(a.max_drawdown_used ?? 0)
  const drawdownLimit   = parseFloat(a.max_drawdown_limit ?? 10)
  const tradingDays     = parseInt(a.trading_days_completed ?? 0)
  const daysRequired    = parseInt(a.trading_days_required  ?? 5)

  const startDate    = a.start_date ? new Date(a.start_date) : null
  const daysElapsed  = startDate ? Math.floor((Date.now() - startDate.getTime()) / 86400000) : 0

  // Objective met checks
  const tradingDaysMet = tradingDays >= daysRequired
  const profitMet      = currentProfit >= profitTarget
  const dailySafe      = dailyLossUsed < dailyLossLimit
  const drawdownSafe   = drawdownUsed < drawdownLimit

  // Phase step index: 0=Registered, 1=Challenge, 2=Verification, 3=Funded
  const phaseIndex = a.status === 'Funded' ? 3 : a.status === 'Passed' ? 2 : 1

  return (
    <div className="rules">
      <div className="topbar">
        <div>
          <h1>Account & Rules</h1>
          <div className="sub">{a.account_id} · ${parseInt(a.account_size).toLocaleString()} {a.account_type}</div>
        </div>
        {accounts.length > 1 ? (
          <select
            className="acct-switch"
            value={a.id}
            onChange={e => {
              const found = accounts.find(x => x.id === parseInt(e.target.value))
              if (found) setSelected(found)
            }}
            style={{ cursor: 'pointer' }}
          >
            {accounts.map(ac => (
              <option key={ac.id} value={ac.id}>
                {ac.account_id} · ${parseInt(ac.account_size).toLocaleString()} Phase {ac.phase}
              </option>
            ))}
          </select>
        ) : (
          <div className="acct-switch">
            <div>
              <b>Phase {a.phase || 1}</b>
              <span>Day {daysElapsed} of 30</span>
            </div>
            <div className="chev">▾</div>
          </div>
        )}
      </div>

      {/* Progress stepper + objectives */}
      <Card style={{ padding: '30px 34px', marginBottom: '20px' }}>
        <div className="stepper">
          {PHASE_STEPS.map((step, i) => (
            <div key={step.label} className={`step-node ${i < phaseIndex ? 'done' : i === phaseIndex ? 'current' : ''}`}>
              {i < PHASE_STEPS.length - 1 && <div className="step-line" />}
              <div className="step-circle">{i < phaseIndex ? '✓' : i + 1}</div>
              <p>{step.label}</p>
            </div>
          ))}
        </div>

        {/* Objectives */}
        <div className={`obj-item ${tradingDaysMet ? 'done' : ''}`}>
          <div className="left">
            <div className="box" />
            <div className="name">Minimum trading days<span>At least {daysRequired} separate active days</span></div>
          </div>
          <div className="prog" style={{ color: tradingDaysMet ? 'var(--green)' : 'var(--text-muted)' }}>
            {tradingDays} / {daysRequired} {tradingDaysMet ? '✓' : ''}
          </div>
        </div>
        <div className={`obj-item ${profitMet ? 'done' : ''}`}>
          <div className="left">
            <div className="box" />
            <div className="name">Profit target<span>Reach {profitTarget}% total gain on starting balance</span></div>
          </div>
          <div className="prog" style={{ color: profitMet ? 'var(--green)' : 'var(--brass)' }}>
            {currentProfit.toFixed(2)}% / {profitTarget}% {profitMet ? '✓' : ''}
          </div>
        </div>
        <div className={`obj-item ${dailySafe ? 'done' : ''}`}>
          <div className="left">
            <div className="box" />
            <div className="name">Daily loss limit respected<span>Never exceed {dailyLossLimit}% loss in a single day</span></div>
          </div>
          <div className="prog" style={{ color: dailySafe ? 'var(--green)' : 'var(--red)' }}>
            Max used {dailyLossUsed.toFixed(2)}% {dailySafe ? '✓' : '⚠'}
          </div>
        </div>
        <div className={`obj-item ${drawdownSafe ? 'done' : ''}`}>
          <div className="left">
            <div className="box" />
            <div className="name">Max drawdown respected<span>Equity never falls {drawdownLimit}% below balance</span></div>
          </div>
          <div className="prog" style={{ color: drawdownSafe ? 'var(--green)' : 'var(--red)' }}>
            Max used {drawdownUsed.toFixed(2)}% {drawdownSafe ? '✓' : '⚠'}
          </div>
        </div>
      </Card>

      <div className="grid-3" style={{ alignItems: 'start' }}>
        {/* Rule set */}
        <Card style={{ gridColumn: 'span 2', padding: '26px' }}>
          <div className="panel-head"><h3>Rule Set</h3></div>
          <div className="rule-grid">
            <div className="rule-card">
              <div>
                <h4>Max Daily Loss — {dailyLossLimit}%</h4>
                <p>Calculated from prior day's balance at 00:00 platform time</p>
              </div>
              <div className={`rule-check ${dailySafe ? '' : 'pending'}`}>{dailySafe ? '✓' : '⚠'}</div>
            </div>
            <div className="rule-card">
              <div>
                <h4>Max Overall Drawdown — {drawdownLimit}%</h4>
                <p>Static, measured from initial starting balance</p>
              </div>
              <div className={`rule-check ${drawdownSafe ? '' : 'pending'}`}>{drawdownSafe ? '✓' : '⚠'}</div>
            </div>
            <div className="rule-card">
              <div>
                <h4>Min Trading Days — {daysRequired}</h4>
                <p>One qualifying trade per day is enough to count</p>
              </div>
              <div className={`rule-check ${tradingDaysMet ? '' : 'pending'}`}>{tradingDaysMet ? '✓' : `${tradingDays}/${daysRequired}`}</div>
            </div>
            <div className="rule-card">
              <div>
                <h4>Profit Target — {profitTarget}%</h4>
                <p>Reach {profitTarget}% total gain before the 30-day window closes</p>
              </div>
              <div className={`rule-check ${profitMet ? '' : 'pending'}`}>{profitMet ? '✓' : `${currentProfit.toFixed(1)}%`}</div>
            </div>
            <div className="rule-card">
              <div>
                <h4>News Trading</h4>
                <p>Permitted with no restriction across all account sizes</p>
              </div>
              <div className="rule-check">✓</div>
            </div>
            <div className="rule-card">
              <div>
                <h4>Weekend Holding</h4>
                <p>Positions may be held over weekends without penalty</p>
              </div>
              <div className="rule-check">✓</div>
            </div>
          </div>
        </Card>

        {/* Certificate card */}
        <div className="cert-card">
          <div className="seal">SU</div>
          <h4 style={{ fontSize: '14px', marginBottom: '6px' }}>Funded Certificate</h4>
          {a.status === 'Funded' ? (
            <>
              <p style={{ fontSize: '12px', color: 'var(--green)', lineHeight: '1.5', marginBottom: '16px' }}>
                Congratulations — you are funded!
              </p>
              <Button style={{ width: '100%', fontSize: '12.5px', padding: '10px' }}>
                Download Certificate
              </Button>
            </>
          ) : (
            <>
              <p style={{ fontSize: '12px', color: 'var(--text-faint)', lineHeight: '1.5', marginBottom: '16px' }}>
                Current status: <b style={{ color: 'var(--brass)' }}>{a.status}</b>
                <br />Unlocked automatically once Verification is complete.
              </p>
              <Button variant="ghost" style={{ width: '100%', fontSize: '12.5px', padding: '10px' }} disabled>
                {a.status === 'Passed' ? 'Verification in progress' : 'Locked — complete challenge'}
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

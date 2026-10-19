import { useState, useEffect } from 'react'
import Card from '../components/Card'
import Button from '../components/Button'
import { api } from '../services/api'
import { useAuth } from '../context/AuthContext'
import './Payouts.css'

export default function Payouts() {
  const { token } = useAuth()
  const [payouts, setPayouts] = useState([])
  const [stats, setStats] = useState(null)
  const [eligibility, setEligibility] = useState([])
  const [config, setConfig] = useState(null)
  const [loading, setLoading] = useState(true)
  const [requesting, setRequesting] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ accountId: '', amount: '', method: 'Crypto' })
  const [formError, setFormError] = useState('')
  const [formSuccess, setFormSuccess] = useState('')

  const methods = ['Crypto', 'Bank Transfer', 'PayPal', 'Stripe']

  useEffect(() => {
    if (!token) { setLoading(false); return }
    fetchAll()
  }, [token])

  const fetchAll = async () => {
    setLoading(true)
    try {
      const [payoutRes, eligRes] = await Promise.all([
        api.getPayoutHistory(token),
        api.getPayoutEligibility(token),
      ])
      if (payoutRes.payouts)    setPayouts(payoutRes.payouts)
      if (payoutRes.statistics) setStats(payoutRes.statistics)
      if (eligRes.eligibility)  setEligibility(eligRes.eligibility)
      if (eligRes.config)       setConfig(eligRes.config)
    } catch (err) {
      console.error('Payouts fetch error:', err)
    } finally {
      setLoading(false)
    }
  }

  const selectedElig = eligibility.find(e => e.accountId === parseInt(form.accountId))

  const handleRequest = async (e) => {
    e.preventDefault()
    setFormError('')
    setFormSuccess('')
    setRequesting(true)
    try {
      const res = await api.requestPayout(token, {
        accountId: parseInt(form.accountId),
        amount: parseFloat(form.amount),
        method: form.method,
      })
      if (res.payoutId) {
        setFormSuccess(`Payout request #${res.payoutId} submitted — $${parseFloat(form.amount).toFixed(2)} via ${form.method}`)
        setShowForm(false)
        setForm({ accountId: '', amount: '', method: 'Crypto' })
        fetchAll()
      } else {
        setFormError(res.error || 'Failed to submit request.')
      }
    } catch {
      setFormError('Server error. Please try again.')
    } finally {
      setRequesting(false)
    }
  }

  const handleCancel = async (payoutId) => {
    if (!window.confirm('Cancel this payout request?')) return
    try {
      await api.cancelPayout(token, payoutId)
      fetchAll()
    } catch (err) {
      console.error('Cancel error:', err)
    }
  }

  const statusColor = (s) => {
    if (s === 'Completed') return { background: 'var(--green-dim)', color: 'var(--green)' }
    if (s === 'Pending')   return { background: 'rgba(201,162,39,0.15)', color: 'var(--brass)' }
    if (s === 'Rejected' || s === 'Cancelled') return { background: 'var(--red-dim)', color: 'var(--red)' }
    return { background: 'var(--surface-raised)', color: 'var(--text-muted)' }
  }

  const inputStyle = {
    width: '100%', padding: '10px 12px', border: '1px solid var(--border)',
    borderRadius: '7px', background: 'var(--base)', color: 'var(--text)',
    fontSize: '13.5px', outline: 'none',
  }

  if (loading) {
    return (
      <div className="payouts" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', color: 'var(--text-muted)', fontFamily: 'var(--mono)', fontSize: '13px' }}>
        Loading…
      </div>
    )
  }

  const eligibleAccounts = eligibility.filter(e => e.isEligible)

  return (
    <div className="payouts">
      <div className="topbar">
        <div>
          <h1>Payouts</h1>
          <div className="sub">
            {config
              ? `${config.profitSplit * 100}% profit split · $${config.minPayout} minimum`
              : 'Loading configuration…'}
          </div>
        </div>
        {eligibleAccounts.length > 0 && (
          <Button onClick={() => { setShowForm(v => !v); setFormError(''); setFormSuccess('') }}>
            {showForm ? 'Cancel' : 'Request Payout'}
          </Button>
        )}
      </div>

      {/* Stats */}
      <div className="payout-hero">
        <Card className="kpi">
          <label>Total Paid to Date</label>
          <div className="val" style={{ color: 'var(--brass)' }}>
            ${parseFloat(stats?.total_paid || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </div>
          <div className="delta" style={{ color: 'var(--text-faint)' }}>
            {stats?.total_requests || 0} payout request{stats?.total_requests !== 1 ? 's' : ''}
          </div>
        </Card>
        <Card className="kpi">
          <label>Pending Amount</label>
          <div className="val">${parseFloat(stats?.pending_amount || 0).toFixed(2)}</div>
          <div className="delta" style={{ color: 'var(--text-faint)' }}>
            {payouts.filter(p => p.status === 'Pending').length} pending
          </div>
        </Card>
        <Card className="kpi">
          <label>Eligible Accounts</label>
          <div className="val">{eligibleAccounts.length}</div>
          <div className="delta" style={{ color: 'var(--text-faint)' }}>of {eligibility.length} funded</div>
        </Card>
      </div>

      {/* Eligibility Cards */}
      {eligibility.length > 0 && (
        <div style={{ marginBottom: '20px' }}>
          <h3 style={{ marginBottom: '12px', fontSize: '14px', color: 'var(--text-muted)' }}>Account Eligibility</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '12px' }}>
            {eligibility.map(e => (
              <Card key={e.accountId} className="panel" style={{ padding: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                  <span style={{ fontFamily: 'var(--mono)', fontSize: '11px', color: 'var(--text-faint)' }}>{e.accountNumber}</span>
                  <span style={{
                    ...statusColor(e.isEligible ? 'Completed' : 'Rejected'),
                    fontSize: '10px', padding: '2px 8px', borderRadius: '4px', fontFamily: 'var(--mono)'
                  }}>
                    {e.isEligible ? 'ELIGIBLE' : 'NOT ELIGIBLE'}
                  </span>
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)', lineHeight: '1.8' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>Account Size</span>
                    <span style={{ color: 'var(--text)' }}>${e.accountSize.toLocaleString()}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>Net Profit</span>
                    <span style={{ color: e.dollarProfit > 0 ? 'var(--green)' : 'var(--red)' }}>${e.dollarProfit.toFixed(2)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>Your Share ({e.profitSplit})</span>
                    <span style={{ color: 'var(--brass)' }}>${e.traderShare.toFixed(2)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>Already Withdrawn</span>
                    <span>${e.alreadyPaid.toFixed(2)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--border)', paddingTop: '6px', marginTop: '4px' }}>
                    <span style={{ fontWeight: 600 }}>Withdrawable</span>
                    <span style={{ fontWeight: 600, color: 'var(--brass)' }}>${e.withdrawableAmount.toFixed(2)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>Trading Days</span>
                    <span>{e.tradingDays}</span>
                  </div>
                </div>
                {!e.isEligible && e.reasons.length > 0 && (
                  <div style={{ marginTop: '8px', fontSize: '11px', color: 'var(--red)', lineHeight: '1.6' }}>
                    {e.reasons.map((r, i) => <div key={i}>• {r}</div>)}
                  </div>
                )}
              </Card>
            ))}
          </div>
        </div>
      )}

      {eligibility.length === 0 && (
        <Card className="panel" style={{ padding: '30px', textAlign: 'center', marginBottom: '20px' }}>
          <div style={{ color: 'var(--text-faint)', fontSize: '13px', fontFamily: 'var(--mono)' }}>
            No funded accounts yet. Complete your challenge to get funded and start earning!
          </div>
        </Card>
      )}

      {/* Request form */}
      {showForm && (
        <Card className="panel" style={{ marginBottom: '20px' }}>
          <div className="panel-head"><h3>New Payout Request</h3></div>
          {formError && (
            <div style={{ color: 'var(--red)', background: 'var(--red-dim)', border: '1px solid rgba(229,72,77,0.3)', borderRadius: '7px', padding: '10px 14px', marginBottom: '16px', fontSize: '13px' }}>
              {formError}
            </div>
          )}
          <form onSubmit={handleRequest} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <div>
              <label style={{ display: 'block', marginBottom: '6px', fontSize: '12px', color: 'var(--text-muted)' }}>Funded Account</label>
              <select
                required
                value={form.accountId}
                onChange={e => setForm(f => ({ ...f, accountId: e.target.value, amount: '' }))}
                style={inputStyle}
              >
                <option value="">Select account…</option>
                {eligibleAccounts.map(e => (
                  <option key={e.accountId} value={e.accountId}>
                    {e.accountNumber} · ${e.accountSize.toLocaleString()} · Avail: ${e.withdrawableAmount.toFixed(2)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '6px', fontSize: '12px', color: 'var(--text-muted)' }}>
                Amount (USD) {selectedElig ? `— max $${selectedElig.withdrawableAmount.toFixed(2)}` : ''}
              </label>
              <input
                type="number" min="50" step="0.01" required
                max={selectedElig?.withdrawableAmount || 999999}
                value={form.amount}
                onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
                placeholder="0.00"
                style={inputStyle}
              />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '6px', fontSize: '12px', color: 'var(--text-muted)' }}>Payout Method</label>
              <select
                value={form.method}
                onChange={e => setForm(f => ({ ...f, method: e.target.value }))}
                style={inputStyle}
              >
                {methods.map(m => <option key={m}>{m}</option>)}
              </select>
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-end' }}>
              <Button type="submit" disabled={requesting} style={{ width: '100%' }}>
                {requesting ? 'Submitting…' : 'Submit Request'}
              </Button>
            </div>
          </form>
        </Card>
      )}

      {formSuccess && (
        <div style={{ color: 'var(--green)', background: 'var(--green-dim)', border: '1px solid rgba(62,207,142,0.3)', borderRadius: '7px', padding: '12px 16px', marginBottom: '16px', fontSize: '13.5px' }}>
          ✓ {formSuccess}
        </div>
      )}

      {/* History */}
      <Card className="panel">
        <div className="panel-head"><h3>Payout History</h3></div>
        {payouts.length === 0 ? (
          <div style={{ padding: '30px 0', textAlign: 'center', color: 'var(--text-faint)', fontSize: '13px', fontFamily: 'var(--mono)' }}>
            No payout requests yet.
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Account</th>
                <th>Gross Profit</th>
                <th>Your Share</th>
                <th>Method</th>
                <th>Status</th>
                <th>Processed</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {payouts.map(p => (
                <tr key={p.id}>
                  <td className="mono">{new Date(p.request_date).toLocaleDateString()}</td>
                  <td className="mono" style={{ fontSize: '11px', color: 'var(--text-faint)' }}>{p.account_id}</td>
                  <td className="mono" style={{ color: 'var(--text-muted)' }}>
                    ${parseFloat(p.gross_profit || 0).toFixed(2)}
                  </td>
                  <td className="mono" style={{ color: 'var(--brass)' }}>${parseFloat(p.amount).toFixed(2)}</td>
                  <td>{p.method}</td>
                  <td>
                    <span style={{ ...statusColor(p.status), fontSize: '11px', padding: '3px 9px', borderRadius: '4px', fontFamily: 'var(--mono)' }}>
                      {p.status}
                    </span>
                  </td>
                  <td className="mono" style={{ fontSize: '11px', color: 'var(--text-faint)' }}>
                    {p.processed_date ? new Date(p.processed_date).toLocaleDateString() : '—'}
                  </td>
                  <td>
                    {p.status === 'Pending' && (
                      <button
                        onClick={() => handleCancel(p.id)}
                        style={{ background: 'none', border: 'none', color: 'var(--red)', cursor: 'pointer', fontSize: '12px' }}
                      >
                        Cancel
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  )
}

import Card from '../Card'
import './AccountSummary.css'

/**
 * AccountSummary
 * Four stat cards: Balance, Equity, Margin Level, Free Margin.
 * Values come from GET /api/demo/accounts/:id/summary
 *
 * Props:
 *   account  — demo_accounts row
 *   summary  — { equity, marginUsed, freeMargin, marginLevel }
 */
export default function AccountSummary({ account, summary }) {
  if (!account) return null

  const balance     = parseFloat(account.balance || 0)
  const equity      = parseFloat(summary?.equity      ?? balance)
  const marginUsed  = parseFloat(summary?.marginUsed  ?? 0)
  const freeMargin  = parseFloat(summary?.freeMargin  ?? balance)
  const marginLevel = summary?.marginLevel === Infinity || summary?.marginLevel == null
    ? null
    : parseFloat(summary.marginLevel)

  const floatingPL  = equity - balance
  const isUp        = floatingPL >= 0

  const marginColor =
    marginLevel === null   ? 'var(--text-muted)' :
    marginLevel < 100      ? 'var(--red)'         :
    marginLevel < 150      ? '#E4C24A'            :
    'var(--green)'

  const fmt = (n) =>
    parseFloat(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  return (
    <div className="account-summary">
      <Card className="kpi">
        <label>Balance</label>
        <div className="val">${fmt(balance)}</div>
        <div className="delta" style={{ color: 'var(--text-faint)' }}>
          {account.currency || 'USD'} · {account.leverage || 100}x leverage
        </div>
      </Card>

      <Card className="kpi">
        <label>Equity</label>
        <div className="val">${fmt(equity)}</div>
        <div className={`delta ${isUp ? 'up' : 'down'}`}>
          {isUp ? '▲' : '▼'} {isUp ? '+' : '−'}${Math.abs(floatingPL).toFixed(2)} floating
        </div>
      </Card>

      <Card className="kpi">
        <label>Margin Level</label>
        <div className="val" style={{ color: marginColor }}>
          {marginLevel !== null ? `${marginLevel.toFixed(0)}%` : '—'}
        </div>
        <div className="delta" style={{ color: 'var(--text-faint)' }}>
          {marginUsed > 0 ? `$${fmt(marginUsed)} used` : 'No open positions'}
        </div>
      </Card>

      <Card className="kpi">
        <label>Free Margin</label>
        <div className="val">${fmt(freeMargin)}</div>
        <div className="delta" style={{ color: 'var(--text-faint)' }}>
          available to open positions
        </div>
      </Card>
    </div>
  )
}

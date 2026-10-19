import { useEffect, useRef } from 'react'
import { createChart } from 'lightweight-charts'
import Card from '../Card'
import './PerformanceDashboard.css'

/**
 * PerformanceDashboard
 * Equity curve chart + win rate, profit factor, trade count stats.
 *
 * Props:
 *   curve  — array of { balance, equity, timestamp } from /equity-curve
 *   stats  — { totalTrades, winningTrades, losingTrades, winRate,
 *               profitFactor, grossProfit, grossLoss, bestTrade, worstTrade }
 */
export default function PerformanceDashboard({ curve = [], stats }) {
  const containerRef = useRef(null)
  const chartRef     = useRef(null)

  useEffect(() => {
    if (!containerRef.current || curve.length === 0) return

    // Destroy old chart if curve data changes
    if (chartRef.current) {
      chartRef.current.remove()
      chartRef.current = null
    }

    const chart = createChart(containerRef.current, {
      layout: {
        background: { color: 'transparent' },
        textColor:  '#9A9DA3',
      },
      grid: {
        vertLines: { color: '#1E2226' },
        horzLines: { color: '#1E2226' },
      },
      crosshair: {
        vertLine: { color: '#C9A227', labelBackgroundColor: '#C9A227' },
        horzLine: { color: '#C9A227', labelBackgroundColor: '#C9A227' },
      },
      rightPriceScale: { borderColor: '#26292E' },
      timeScale: {
        borderColor: '#26292E',
        timeVisible: true,
      },
      width:  containerRef.current.clientWidth,
      height: 220,
    })

    const equitySeries = chart.addAreaSeries({
      lineColor:   '#C9A227',
      topColor:    'rgba(201, 162, 39, 0.25)',
      bottomColor: 'rgba(201, 162, 39, 0)',
      lineWidth:   2,
    })

    const balanceSeries = chart.addLineSeries({
      color:     '#5C5F65',
      lineWidth: 1,
      lineStyle: 2, // dashed
    })

    // Convert timestamps to UTC seconds
    const equityData  = []
    const balanceData = []

    curve.forEach(snap => {
      const time = Math.floor(new Date(snap.timestamp).getTime() / 1000)
      equityData.push({ time, value: parseFloat(snap.equity) })
      balanceData.push({ time, value: parseFloat(snap.balance) })
    })

    // Deduplicate by time (lightweight-charts requires strictly ascending unique times)
    const dedup = (arr) => {
      const seen = new Set()
      return arr
        .filter(d => { if (seen.has(d.time)) return false; seen.add(d.time); return true })
        .sort((a, b) => a.time - b.time)
    }

    equitySeries.setData(dedup(equityData))
    balanceSeries.setData(dedup(balanceData))
    chart.timeScale().fitContent()

    chartRef.current = chart

    const ro = new ResizeObserver(() => {
      if (containerRef.current) chart.applyOptions({ width: containerRef.current.clientWidth })
    })
    ro.observe(containerRef.current)

    return () => {
      ro.disconnect()
      chart.remove()
      chartRef.current = null
    }
  }, [curve])

  const fmt = (n, d = 2) => parseFloat(n || 0).toFixed(d)

  return (
    <div className="perf-dashboard">
      {/* Equity curve */}
      <Card className="panel perf-chart-card">
        <div className="panel-head">
          <h3>Equity Curve</h3>
          <div className="perf-legend">
            <span><i className="dot-brass" /> Equity</span>
            <span><i className="dot-faint" /> Balance</span>
          </div>
        </div>
        {curve.length === 0 ? (
          <div className="perf-empty">
            No snapshots yet — equity curve will appear once you trade.
          </div>
        ) : (
          <div ref={containerRef} className="perf-chart-canvas" />
        )}
      </Card>

      {/* Stats grid */}
      {stats && (
        <div className="perf-stats">
          <Card className="kpi">
            <label>Total Trades</label>
            <div className="val">{stats.totalTrades}</div>
            <div className="delta" style={{ color: 'var(--text-faint)' }}>
              {stats.winningTrades}W / {stats.losingTrades}L
            </div>
          </Card>

          <Card className="kpi">
            <label>Win Rate</label>
            <div className="val" style={{ color: stats.winRate >= 50 ? 'var(--green)' : 'var(--red)' }}>
              {fmt(stats.winRate, 1)}%
            </div>
            <div className="delta" style={{ color: 'var(--text-faint)' }}>closed trades</div>
          </Card>

          <Card className="kpi">
            <label>Profit Factor</label>
            <div className="val" style={{ color: parseFloat(stats.profitFactor) >= 1 ? 'var(--green)' : 'var(--red)' }}>
              {stats.profitFactor}
            </div>
            <div className="delta" style={{ color: 'var(--text-faint)' }}>
              gross profit / gross loss
            </div>
          </Card>

          <Card className="kpi">
            <label>Best Trade</label>
            <div className="val" style={{ color: 'var(--green)', fontSize: '22px' }}>
              +${fmt(stats.bestTrade)}
            </div>
            <div className="delta" style={{ color: 'var(--text-faint)' }}>
              Worst: −${fmt(Math.abs(stats.worstTrade))}
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}

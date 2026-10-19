import { useState, useEffect, useRef } from 'react'
import { wsService } from '../../services/websocket'
import './PositionsTable.css'

/**
 * PositionsTable
 * Shows open demo positions with live floating P&L updated via wsService price ticks.
 *
 * Props:
 *   positions    — initial array from GET /api/demo/accounts/:id/positions
 *   onClose(id)  — callback when user clicks close on a row
 *   closing      — Set of positionIds currently being closed (loading state)
 */
export default function PositionsTable({ positions = [], onClose, closing = new Set() }) {
  // livePositions mirrors positions but with live floatingPL overrides
  const [livePositions, setLivePositions] = useState(positions)

  // Sync when parent refreshes the positions list
  useEffect(() => {
    setLivePositions(positions)
  }, [positions])

  // Subscribe to price rooms for every unique symbol in the positions list
  const subscribedSymbols = useRef(new Set())

  useEffect(() => {
    const symbols = [...new Set(positions.map(p => p.symbol))]

    // Subscribe to any new symbols
    symbols.forEach(sym => {
      if (!subscribedSymbols.current.has(sym)) {
        wsService.subscribeToPriceRoom(sym)
        subscribedSymbols.current.add(sym)
      }
    })

    // Handler: update floating P&L for all positions on this symbol
    const handlers = {}
    symbols.forEach(sym => {
      const handler = (data) => {
        const bid = parseFloat(data.bid)
        const ask = parseFloat(data.ask)

        setLivePositions(prev =>
          prev.map(pos => {
            if (pos.symbol !== sym) return pos
            const contractSize = parseFloat(pos.contract_size) || 1
            const lots         = parseFloat(pos.lots)
            const openPrice    = parseFloat(pos.open_price)

            const closePrice = pos.direction === 'buy' ? bid : ask
            const floatingPL = pos.direction === 'buy'
              ? (closePrice - openPrice) * lots * contractSize
              : (openPrice - closePrice) * lots * contractSize

            return {
              ...pos,
              floatingPL: parseFloat(floatingPL.toFixed(2)),
              currentBid: bid,
              currentAsk: ask,
            }
          })
        )
      }
      handlers[sym] = handler
      wsService.on(`price:${sym}`, handler)
    })

    return () => {
      symbols.forEach(sym => wsService.off(`price:${sym}`, handlers[sym]))
    }
  }, [positions])

  const fmt = (n, d = 2) =>
    n !== null && n !== undefined ? parseFloat(n).toFixed(d) : '—'

  const priceDecimals = (symbol) =>
    symbol?.includes('BTC') || symbol?.includes('ETH') ? 2 : 5

  if (livePositions.length === 0) {
    return (
      <div className="positions-empty">
        No open positions — place an order to get started.
      </div>
    )
  }

  return (
    <div className="positions-wrap">
      <table className="positions-table">
        <thead>
          <tr>
            <th>Symbol</th>
            <th>Dir</th>
            <th>Lots</th>
            <th>Open</th>
            <th>Current</th>
            <th>SL</th>
            <th>TP</th>
            <th>Float P&L</th>
            <th>Opened</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {livePositions.map(pos => {
            const pnl     = pos.floatingPL ?? 0
            const isClose = closing.has(pos.id)
            const dec     = priceDecimals(pos.symbol)
            const curPrice = pos.direction === 'buy' ? pos.currentBid : pos.currentAsk

            return (
              <tr key={pos.id} className={pnl > 0 ? 'row-up' : pnl < 0 ? 'row-down' : ''}>
                <td className="mono"><b>{pos.symbol}</b></td>
                <td>
                  <span className={pos.direction === 'buy' ? 'tag-buy' : 'tag-sell'}>
                    {pos.direction.toUpperCase()}
                  </span>
                </td>
                <td className="mono">{fmt(pos.lots, 2)}</td>
                <td className="mono">{fmt(pos.open_price, dec)}</td>
                <td className="mono">
                  {curPrice ? parseFloat(curPrice).toFixed(dec) : '—'}
                </td>
                <td className="mono faint">{pos.sl ? fmt(pos.sl, dec) : '—'}</td>
                <td className="mono faint">{pos.tp ? fmt(pos.tp, dec) : '—'}</td>
                <td className={`mono pnl ${pnl >= 0 ? 'pos' : 'neg'}`}>
                  {pnl >= 0 ? '+' : ''}${fmt(Math.abs(pnl))}
                </td>
                <td className="mono faint small">
                  {new Date(pos.opened_at).toLocaleDateString()}
                </td>
                <td>
                  <button
                    className="close-btn"
                    onClick={() => onClose?.(pos.id)}
                    disabled={isClose}
                  >
                    {isClose ? '…' : 'Close'}
                  </button>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

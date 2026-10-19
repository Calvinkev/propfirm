import { useState } from 'react'
import Button from '../Button'
import './OrderPanel.css'

/**
 * OrderPanel
 * Props:
 *   instruments  — array from GET /api/demo/instruments
 *   selectedSymbol / onSymbolChange — controlled instrument selector
 *   demoAccountId — the demo account to trade on
 *   onOrderPlaced(result) — callback after successful order
 *   onError(msg) — callback for error messages
 *   token — JWT
 *   api — api service object (passed in to keep component testable)
 */
export default function OrderPanel({
  instruments = [],
  selectedSymbol,
  onSymbolChange,
  demoAccountId,
  onOrderPlaced,
  onError,
  token,
  api,
}) {
  const [lots,       setLots]       = useState('0.01')
  const [sl,         setSl]         = useState('')
  const [tp,         setTp]         = useState('')
  const [orderType,  setOrderType]  = useState('market')
  const [reqPrice,   setReqPrice]   = useState('')
  const [loading,    setLoading]    = useState(null) // 'buy' | 'sell' | null
  const [showAdv,    setShowAdv]    = useState(false)

  const selectedInstrument = instruments.find(i => i.symbol === selectedSymbol)

  const handleSubmit = async (direction) => {
    if (!demoAccountId) {
      onError?.('No demo account selected. Create one first.')
      return
    }
    if (!selectedInstrument) {
      onError?.('Select an instrument first.')
      return
    }

    const lotsNum = parseFloat(lots)
    if (isNaN(lotsNum) || lotsNum <= 0) {
      onError?.('Enter a valid lot size.')
      return
    }

    setLoading(direction)
    try {
      const result = await api.placeDemoOrder(token, {
        accountId:      demoAccountId,
        instrumentId:   selectedInstrument.id,
        orderType,
        direction,
        lots:           lotsNum,
        requestedPrice: reqPrice ? parseFloat(reqPrice) : undefined,
        sl:             sl ? parseFloat(sl) : undefined,
        tp:             tp ? parseFloat(tp) : undefined,
      })

      if (result.error) {
        onError?.(result.error)
      } else {
        onOrderPlaced?.(result)
      }
    } catch (err) {
      onError?.(err.message || 'Failed to place order')
    } finally {
      setLoading(null)
    }
  }

  const priceDecimals = selectedSymbol?.includes('BTC') || selectedSymbol?.includes('ETH') ? 2 : 5

  return (
    <div className="order-panel">
      <div className="order-panel-head">
        <h3>New Order</h3>
        {selectedInstrument && (
          <span className="order-spread">
            {selectedInstrument.spread_pips} pip spread
          </span>
        )}
      </div>

      {/* Instrument selector */}
      <div className="order-field">
        <label>Instrument</label>
        <select
          value={selectedSymbol || ''}
          onChange={e => onSymbolChange?.(e.target.value)}
          className="order-select"
        >
          <option value="" disabled>Select instrument…</option>
          {instruments.map(i => (
            <option key={i.id} value={i.symbol}>
              {i.display_name} ({i.symbol})
            </option>
          ))}
        </select>
      </div>

      {/* Live bid/ask */}
      {selectedInstrument && (
        <div className="order-prices">
          <div className="order-price sell-price">
            <span>SELL</span>
            <b>{selectedInstrument.bid
              ? parseFloat(selectedInstrument.bid).toFixed(priceDecimals)
              : '—'}</b>
          </div>
          <div className="order-price buy-price">
            <span>BUY</span>
            <b>{selectedInstrument.ask
              ? parseFloat(selectedInstrument.ask).toFixed(priceDecimals)
              : '—'}</b>
          </div>
        </div>
      )}

      {/* Order type */}
      <div className="order-field">
        <label>Order Type</label>
        <div className="order-type-tabs">
          {['market', 'limit', 'stop'].map(t => (
            <button
              key={t}
              className={`type-tab ${orderType === t ? 'active' : ''}`}
              onClick={() => setOrderType(t)}
            >
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Requested price — only for limit/stop */}
      {orderType !== 'market' && (
        <div className="order-field">
          <label>Price</label>
          <input
            type="number"
            step="any"
            value={reqPrice}
            onChange={e => setReqPrice(e.target.value)}
            placeholder={`e.g. ${selectedInstrument?.bid ? parseFloat(selectedInstrument.bid).toFixed(priceDecimals) : '0.00'}`}
            className="order-input"
          />
        </div>
      )}

      {/* Lot size */}
      <div className="order-field">
        <label>Lot Size</label>
        <div className="lots-row">
          <input
            type="number"
            step="0.01"
            min="0.01"
            value={lots}
            onChange={e => setLots(e.target.value)}
            className="order-input"
          />
          <div className="lot-presets">
            {['0.01', '0.1', '0.5', '1'].map(v => (
              <button key={v} className={`preset-btn ${lots === v ? 'active' : ''}`} onClick={() => setLots(v)}>
                {v}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Advanced — SL/TP */}
      <button className="adv-toggle" onClick={() => setShowAdv(p => !p)}>
        {showAdv ? '▾' : '▸'} SL / TP {showAdv ? '' : '(optional)'}
      </button>

      {showAdv && (
        <div className="order-row-2">
          <div className="order-field">
            <label>Stop Loss</label>
            <input
              type="number"
              step="any"
              value={sl}
              onChange={e => setSl(e.target.value)}
              placeholder="0.00"
              className="order-input"
            />
          </div>
          <div className="order-field">
            <label>Take Profit</label>
            <input
              type="number"
              step="any"
              value={tp}
              onChange={e => setTp(e.target.value)}
              placeholder="0.00"
              className="order-input"
            />
          </div>
        </div>
      )}

      {/* Buy / Sell buttons */}
      <div className="order-actions">
        <button
          className="order-btn sell-btn"
          onClick={() => handleSubmit('sell')}
          disabled={!!loading}
        >
          {loading === 'sell' ? '…' : `SELL ${selectedSymbol || ''}`}
        </button>
        <button
          className="order-btn buy-btn"
          onClick={() => handleSubmit('buy')}
          disabled={!!loading}
        >
          {loading === 'buy' ? '…' : `BUY ${selectedSymbol || ''}`}
        </button>
      </div>
    </div>
  )
}

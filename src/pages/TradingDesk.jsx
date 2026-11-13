import React, { useEffect, useState, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import { wsService } from '../services/websocket';
import { createChart } from 'lightweight-charts';
import CryptoIcon from '../components/CryptoIcon';
import './TradingDesk.css';

const PAIRS = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'XRPUSDT', 'DOGEUSDT', 'ADAUSDT', 'LTCUSDT', 'AVAXUSDT', 'LINKUSDT', 'MATICUSDT', 'DOTUSDT', 'TRXUSDT', 'UNIUSDT', 'ATOMUSDT'];

export default function TradingDesk() {
  const { token } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const symbol = (searchParams.get('symbol') || 'BTCUSDT').toUpperCase();

  const [orderbook, setOrderbook] = useState({ bids: [], asks: [] });
  const [marketData, setMarketData] = useState({ high: 0, low: 0, volume: 0, change: 0 });
  const [ticker, setTicker] = useState({ price: 0 });
  const [balances, setBalances] = useState([]);
  const [openOrders, setOpenOrders] = useState([]);
  const [tradeHistory, setTradeHistory] = useState([]);
  const [positions, setPositions] = useState([]);
  const [activeTab, setActiveTab] = useState('POSITIONS');
  const [mobileDeskTab, setMobileDeskTab] = useState('chart'); // 'chart' | 'orderbook' | 'order'
  const [chartTimeframe, setChartTimeframe] = useState('1h'); // active timeframe

  // Spot Order form state
  const [orderSide, setOrderSide] = useState('BUY'); // BUY or SELL
  const [orderType, setOrderType] = useState('LIMIT'); // LIMIT or MARKET
  const [priceInput, setPriceInput] = useState('');
  const [amountInput, setAmountInput] = useState('');
  const [percentage, setPercentage] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState(null);

  const chartContainerRef = useRef(null);
  const chartInstance = useRef(null);
  const candleSeries = useRef(null);

  const baseAsset = symbol.replace('USDT', '');
  const quoteAsset = 'USDT';

  const baseBalance = balances.find(b => b.asset === baseAsset)?.free || 0;
  const quoteBalance = balances.find(b => b.asset === quoteAsset)?.free || 0;

  const showToast = (type, msg) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 3500);
  };

  // 1. Initial Load & Balance Fetch
  const refreshData = async () => {
    try {
      const [balRes, ordRes, trdRes, posRes] = await Promise.all([
        api.getWalletBalances(token),
        api.getOpenOrders(token),
        api.getTradeHistory(token),
        api.getSpotPositions(token),
      ]);
      if (balRes.balances) setBalances(balRes.balances);
      if (ordRes.orders) setOpenOrders(ordRes.orders);
      if (trdRes.trades) setTradeHistory(trdRes.trades);
      if (posRes.positions) setPositions(posRes.positions);
    } catch (err) {
      console.error('Refresh data error:', err);
    }
  };

  useEffect(() => {
    refreshData();
  }, [token]);

  // 2. Fetch Orderbook & Ticker
  useEffect(() => {
    async function loadOrderbook() {
      try {
        const res = await api.getOrderbook(symbol);
        if (res.bids) setOrderbook(res);
        if (res.lastPrice) {
          setTicker(prev => ({ ...prev, price: res.lastPrice }));
          setMarketData(prev => ({
            high: res.high24h || prev.high || 0,
            low: res.low24h || prev.low || 0,
            volume: res.volume24h || prev.volume || 0,
            change: res.change24h || prev.change || 0,
          }));
          if (!priceInput || orderType === 'MARKET') {
            setPriceInput(res.lastPrice.toString());
          }
        }
      } catch (err) {
        console.error('Load orderbook error:', err);
      }
    }
    loadOrderbook();
    const timer = setInterval(loadOrderbook, 2000);
    return () => clearInterval(timer);
  }, [symbol, orderType]);

  // 3. WebSocket Realtime Prices
  useEffect(() => {
    if (!wsService.isConnected) wsService.connect(token);
    wsService.send({ type: 'subscribe_price', symbol });

    const handlePriceTick = (data) => {
      if (data.symbol === symbol) {
        setTicker(prev => ({ ...prev, price: data.ask }));
      }
      // Update floating PnL live for all positions
      setPositions(prev => prev.map(pos => {
        if (pos.symbol !== data.symbol) return pos;
        const mark = (data.bid + data.ask) / 2;
        const currentValue = mark * pos.quantity;
        const unrealizedPnl = pos.totalCost ? currentValue - pos.totalCost : null;
        const unrealizedPnlPct = pos.totalCost && unrealizedPnl !== null ? (unrealizedPnl / pos.totalCost) * 100 : null;
        return { ...pos, markPrice: mark, currentValue, unrealizedPnl, unrealizedPnlPct };
      }));
    };

    wsService.on('price_tick', handlePriceTick);
    return () => {
      wsService.off('price_tick', handlePriceTick);
      wsService.send({ type: 'unsubscribe_price', symbol });
    };
  }, [symbol, token]);

  // 4. Initialize Lightweight Chart
  useEffect(() => {
    if (!chartContainerRef.current) return;

    if (chartInstance.current) {
      chartInstance.current.remove();
      chartInstance.current = null;
    }

    const container = chartContainerRef.current;

    const chart = createChart(container, {
      autoSize: true,
      layout: {
        background: { color: '#0B0F14' },
        textColor: '#9AA6B5',
      },
      grid: {
        vertLines: { color: '#1B2430' },
        horzLines: { color: '#1B2430' },
      },
      timeScale: {
        timeVisible: true,
        borderColor: '#283241',
        rightOffset: 5,
        barSpacing: 6,
        minBarSpacing: 2,
      },
      crosshair: {
        mode: 1,
      },
    });

    const series = chart.addCandlestickSeries({
      upColor: '#10B981',
      downColor: '#F43F5E',
      borderVisible: false,
      wickUpColor: '#10B981',
      wickDownColor: '#F43F5E',
    });

    chartInstance.current = chart;
    candleSeries.current = series;

    api.getChartCandles(symbol, chartTimeframe, 1000).then(res => {
      if (res.candles && res.candles.length > 0) {
        series.setData(res.candles);
        // Scroll to the most recent candle
        chart.timeScale().scrollToRealTime();
      }
    });

    return () => {
      if (chartInstance.current) {
        chartInstance.current.remove();
        chartInstance.current = null;
      }
    };
  }, [symbol, chartTimeframe]);

  // Percentage slider logic
  const handlePercentageChange = (pct) => {
    setPercentage(pct);
    if (orderSide === 'BUY') {
      const availableQuote = parseFloat(quoteBalance);
      const curPrice = parseFloat(priceInput) || ticker.price;
      if (curPrice > 0) {
        const totalToSpend = (availableQuote * pct) / 100;
        setAmountInput((totalToSpend / curPrice).toFixed(4));
      }
    } else {
      const availableBase = parseFloat(baseBalance);
      setAmountInput(((availableBase * pct) / 100).toFixed(4));
    }
  };

  // Submit Order
  const handlePlaceOrder = async (e) => {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    try {
      const res = await api.placeSpotOrder(token, {
        symbol,
        side: orderSide,
        type: orderType,
        price: priceInput,
        amount: amountInput
      });

      if (res.error) {
        showToast('error', res.error);
      } else {
        showToast('success', res.message || 'Order placed successfully');
        setAmountInput('');
        setPercentage(0);
        refreshData();
      }
    } catch (err) {
      showToast('error', 'Failed to place spot order');
    } finally {
      setSubmitting(false);
    }
  };

  // Cancel Order
  const handleCancelOrder = async (orderId) => {
    try {
      const res = await api.cancelSpotOrder(token, orderId);
      if (res.error) {
        showToast('error', res.error);
      } else {
        showToast('success', 'Order canceled');
        refreshData();
      }
    } catch (err) {
      showToast('error', 'Failed to cancel order');
    }
  };

  return (
    <div className="trading-desk-layout">
      {toast && <div className={`desk-toast ${toast.type}`}>{toast.msg}</div>}

      {/* Top Pair Selector Header */}
      <div className="pair-bar">
        <div className="pair-select-group">
          <CryptoIcon symbol={baseAsset} size={28} />
          <span className="pair-name">{symbol.replace('USDT', '/USDT')}</span>
          <div className="pair-dropdown">
            {PAIRS.map(p => (
              <button
                key={p}
                className={`pair-btn ${p === symbol ? 'active' : ''}`}
                onClick={() => setSearchParams({ symbol: p })}
              >
                {p.replace('USDT', '')}
              </button>
            ))}
          </div>
        </div>

        <div className="ticker-stats">
          <div className="stat">
            <span className="stat-label">Price</span>
            <span className="stat-value gold">${parseFloat(ticker.price || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
          </div>
          <div className="stat">
            <span className="stat-label">24h Change</span>
            <span className={`stat-value ${marketData.change >= 0 ? 'pos' : 'neg'}`}>
              {marketData.change >= 0 ? '+' : ''}{parseFloat(marketData.change || 0).toFixed(2)}%
            </span>
          </div>
          <div className="stat">
            <span className="stat-label">24h High</span>
            <span className="stat-value">{marketData.high ? `$${parseFloat(marketData.high).toLocaleString(undefined, { minimumFractionDigits: 2 })}` : '—'}</span>
          </div>
          <div className="stat">
            <span className="stat-label">24h Low</span>
            <span className="stat-value">{marketData.low ? `$${parseFloat(marketData.low).toLocaleString(undefined, { minimumFractionDigits: 2 })}` : '—'}</span>
          </div>
          <div className="stat">
            <span className="stat-label">24h Volume</span>
            <span className="stat-value">{marketData.volume ? `$${(marketData.volume / 1e6).toFixed(2)}M` : '—'}</span>
          </div>
        </div>
      </div>

      {/* Mobile tab switcher — hidden on desktop via CSS, shown on mobile */}
      <div className="mobile-desk-tabs">
        {[
          { key: 'chart', label: 'Chart' },
          { key: 'orderbook', label: 'Order Book' },
          { key: 'order', label: 'Place Order' },
        ].map(t => (
          <button
            key={t.key}
            className={`mobile-desk-tab ${mobileDeskTab === t.key ? 'active' : ''}`}
            onClick={() => setMobileDeskTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Main Workspace */}
      <div className="desk-main-grid">

        {/* Left Column: Order Book Depth */}
        <div className={`orderbook-col${mobileDeskTab === 'orderbook' ? ' mobile-visible' : ''}`}>
          <div className="col-header">Order Book</div>
          <div className="ob-table-header">
            <span>Price(USDT)</span>
            <span>Amount({baseAsset})</span>
          </div>

          {/* Asks (Sells) in Red */}
          <div className="ob-asks">
            {(orderbook.asks || []).slice(0, 10).map((a, i) => (
              <div key={i} className="ob-row ask-row">
                <span className="ask-price">{a.price.toFixed(2)}</span>
                <span className="ob-amount">{a.amount.toFixed(4)}</span>
              </div>
            ))}
          </div>

          {/* Mid Price Ticker */}
          <div className="ob-mid-price">
            ${parseFloat(ticker.price || 0).toFixed(2)}
          </div>

          {/* Bids (Buys) in Green */}
          <div className="ob-bids">
            {(orderbook.bids || []).slice(0, 10).map((b, i) => (
              <div key={i} className="ob-row bid-row">
                <span className="bid-price">{b.price.toFixed(2)}</span>
                <span className="ob-amount">{b.amount.toFixed(4)}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Center Column: Lightweight Chart */}
        <div className={`chart-col${mobileDeskTab === 'chart' ? ' mobile-visible' : ''}`}>
          <div className="chart-header">
            <span>{symbol.replace('USDT', '/USDT')} · Candlestick Chart</span>
            <div className="chart-timeframes">
              {['1m','5m','15m','1h','4h','1d','1w'].map(tf => (
                <button
                  key={tf}
                  className={`tf-btn ${chartTimeframe === tf ? 'active' : ''}`}
                  onClick={() => setChartTimeframe(tf)}
                >
                  {tf}
                </button>
              ))}
            </div>
          </div>
          <div className="chart-container" ref={chartContainerRef} />
        </div>

        {/* Right Column: Order Panel */}
        <div className={`order-panel-col${mobileDeskTab === 'order' ? ' mobile-visible' : ''}`}>
          <div className="order-tabs">
            <button
              className={`side-tab buy ${orderSide === 'BUY' ? 'active' : ''}`}
              onClick={() => setOrderSide('BUY')}
            >
              Buy {baseAsset}
            </button>
            <button
              className={`side-tab sell ${orderSide === 'SELL' ? 'active' : ''}`}
              onClick={() => setOrderSide('SELL')}
            >
              Sell {baseAsset}
            </button>
          </div>

          <div className="type-toggle">
            <button
              className={`type-btn ${orderType === 'LIMIT' ? 'active' : ''}`}
              onClick={() => setOrderType('LIMIT')}
            >
              Limit
            </button>
            <button
              className={`type-btn ${orderType === 'MARKET' ? 'active' : ''}`}
              onClick={() => setOrderType('MARKET')}
            >
              Market
            </button>
          </div>

          <form className="spot-order-form" onSubmit={handlePlaceOrder}>
            <div className="avail-balance">
              <span>Avail:</span>
              <span className="mono">
                {orderSide === 'BUY'
                  ? `${parseFloat(quoteBalance).toFixed(2)} USDT`
                  : `${parseFloat(baseBalance).toFixed(4)} ${baseAsset}`}
              </span>
            </div>

            {orderType === 'LIMIT' && (
              <div className="form-group">
                <label>Price</label>
                <div className="input-box">
                  <input
                    type="number"
                    step="0.01"
                    value={priceInput}
                    onChange={(e) => setPriceInput(e.target.value)}
                    required
                  />
                  <span className="unit">USDT</span>
                </div>
              </div>
            )}

            <div className="form-group">
              <label>Amount</label>
              <div className="input-box">
                <input
                  type="number"
                  step="0.0001"
                  placeholder="0.00"
                  value={amountInput}
                  onChange={(e) => setAmountInput(e.target.value)}
                  required
                />
                <span className="unit">{baseAsset}</span>
              </div>
            </div>

            {/* Percentage Quick Selector */}
            <div className="pct-slider">
              {[25, 50, 75, 100].map(pct => (
                <button
                  type="button"
                  key={pct}
                  className={`pct-btn ${percentage === pct ? 'active' : ''}`}
                  onClick={() => handlePercentageChange(pct)}
                >
                  {pct}%
                </button>
              ))}
            </div>

            <div className="order-summary">
              <span>Order Total:</span>
              <span className="mono">
                ${((parseFloat(amountInput) || 0) * (parseFloat(priceInput) || ticker.price)).toFixed(2)} USDT
              </span>
            </div>

            <button
              type="submit"
              className={`submit-order-btn ${orderSide.toLowerCase()}`}
              disabled={submitting}
            >
              {submitting ? 'Placing Order…' : `${orderSide} ${baseAsset}`}
            </button>
          </form>
        </div>
      </div>

      {/* Bottom Orders & Trades Panel */}
      <div className="desk-bottom-panel">
        <div className="bottom-tabs">
          <button
            className={`bottom-tab ${activeTab === 'POSITIONS' ? 'active' : ''}`}
            onClick={() => setActiveTab('POSITIONS')}
          >
            Positions {positions.length > 0 && `(${positions.length})`}
          </button>
          <button
            className={`bottom-tab ${activeTab === 'OPEN_ORDERS' ? 'active' : ''}`}
            onClick={() => setActiveTab('OPEN_ORDERS')}
          >
            Open Orders ({openOrders.length})
          </button>
          <button
            className={`bottom-tab ${activeTab === 'TRADE_HISTORY' ? 'active' : ''}`}
            onClick={() => setActiveTab('TRADE_HISTORY')}
          >
            Trade History
          </button>
          <button
            className={`bottom-tab ${activeTab === 'BALANCES' ? 'active' : ''}`}
            onClick={() => setActiveTab('BALANCES')}
          >
            Asset Balances
          </button>
        </div>

        <div className="bottom-table-container">

          {activeTab === 'POSITIONS' && (
            <table className="desk-table">
              <thead>
                <tr>
                  <th>Asset</th>
                  <th>Quantity</th>
                  <th>Avg Entry</th>
                  <th>Mark Price</th>
                  <th>Cost Basis</th>
                  <th>Current Value</th>
                  <th>Unrealized PnL</th>
                  <th>PnL %</th>
                </tr>
              </thead>
              <tbody>
                {positions.length === 0 ? (
                  <tr><td colSpan="8" className="empty-msg">No open positions. Buy an asset to see your floating PnL here.</td></tr>
                ) : (
                  positions.map(pos => {
                    const pnl = pos.unrealizedPnl;
                    const pnlPct = pos.unrealizedPnlPct;
                    const pnlClass = pnl === null ? '' : pnl >= 0 ? 'pos' : 'neg';
                    return (
                      <tr key={pos.asset}>
                        <td><b>{pos.asset}</b></td>
                        <td className="mono">{parseFloat(pos.quantity).toFixed(6)}</td>
                        <td className="mono">
                          {pos.avgEntryPrice ? `$${parseFloat(pos.avgEntryPrice).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 })}` : '—'}
                        </td>
                        <td className="mono gold">
                          {pos.markPrice ? `$${parseFloat(pos.markPrice).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 })}` : '—'}
                        </td>
                        <td className="mono">
                          {pos.totalCost ? `$${parseFloat(pos.totalCost).toFixed(2)}` : '—'}
                        </td>
                        <td className="mono">
                          {pos.currentValue ? `$${parseFloat(pos.currentValue).toFixed(2)}` : '—'}
                        </td>
                        <td className={`mono ${pnlClass}`}>
                          {pnl !== null ? `${pnl >= 0 ? '+' : ''}$${parseFloat(pnl).toFixed(2)}` : '—'}
                        </td>
                        <td className={`mono ${pnlClass}`}>
                          {pnlPct !== null ? `${pnlPct >= 0 ? '+' : ''}${parseFloat(pnlPct).toFixed(2)}%` : '—'}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
              {positions.length > 0 && (() => {
                const totalCost = positions.reduce((s, p) => s + (p.totalCost || 0), 0);
                const totalValue = positions.reduce((s, p) => s + (p.currentValue || 0), 0);
                const totalPnl = totalValue - totalCost;
                const totalPct = totalCost > 0 ? (totalPnl / totalCost) * 100 : 0;
                const cls = totalPnl >= 0 ? 'pos' : 'neg';
                return (
                  <tfoot>
                    <tr className="positions-total-row">
                      <td colSpan="4"><b>Portfolio Total</b></td>
                      <td className="mono"><b>${totalCost.toFixed(2)}</b></td>
                      <td className="mono"><b>${totalValue.toFixed(2)}</b></td>
                      <td className={`mono ${cls}`}><b>{totalPnl >= 0 ? '+' : ''}${totalPnl.toFixed(2)}</b></td>
                      <td className={`mono ${cls}`}><b>{totalPnl >= 0 ? '+' : ''}{totalPct.toFixed(2)}%</b></td>
                    </tr>
                  </tfoot>
                );
              })()}
            </table>
          )}

          {activeTab === 'OPEN_ORDERS' && (
            <table className="desk-table">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Pair</th>
                  <th>Side</th>
                  <th>Type</th>
                  <th>Price</th>
                  <th>Amount</th>
                  <th>Filled</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {openOrders.length === 0 ? (
                  <tr><td colSpan="8" className="empty-msg">No open orders</td></tr>
                ) : (
                  openOrders.map(o => (
                    <tr key={o.id}>
                      <td>{new Date(o.created_at).toLocaleTimeString()}</td>
                      <td><b>{o.symbol}</b></td>
                      <td className={o.side === 'BUY' ? 'pos' : 'neg'}>{o.side}</td>
                      <td>{o.type}</td>
                      <td className="mono">${parseFloat(o.price).toFixed(2)}</td>
                      <td className="mono">{parseFloat(o.amount).toFixed(4)}</td>
                      <td className="mono">{parseFloat(o.filled_amount).toFixed(4)}</td>
                      <td>
                        <button className="cancel-btn" onClick={() => handleCancelOrder(o.id)}>Cancel</button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}

          {activeTab === 'TRADE_HISTORY' && (
            <table className="desk-table">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Pair</th>
                  <th>Side</th>
                  <th>Price</th>
                  <th>Executed Amount</th>
                  <th>Fee</th>
                </tr>
              </thead>
              <tbody>
                {tradeHistory.length === 0 ? (
                  <tr><td colSpan="6" className="empty-msg">No trades executed yet</td></tr>
                ) : (
                  tradeHistory.map(t => (
                    <tr key={t.id}>
                      <td>{new Date(t.created_at).toLocaleString()}</td>
                      <td><b>{t.symbol}</b></td>
                      <td className={t.side === 'BUY' ? 'pos' : 'neg'}>{t.side}</td>
                      <td className="mono">${parseFloat(t.price).toFixed(2)}</td>
                      <td className="mono">{parseFloat(t.amount).toFixed(4)}</td>
                      <td className="mono">${parseFloat(t.fee).toFixed(4)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}

          {activeTab === 'BALANCES' && (
            <table className="desk-table">
              <thead>
                <tr>
                  <th>Asset</th>
                  <th>Available Free</th>
                  <th>Locked in Orders</th>
                  <th>Total Balance</th>
                </tr>
              </thead>
              <tbody>
                {balances.map(b => (
                  <tr key={b.asset}>
                    <td><b>{b.asset}</b></td>
                    <td className="mono">{parseFloat(b.free).toFixed(4)}</td>
                    <td className="mono">{parseFloat(b.locked).toFixed(4)}</td>
                    <td className="mono">{(parseFloat(b.free) + parseFloat(b.locked)).toFixed(4)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

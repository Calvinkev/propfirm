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
  const [amountInput, setAmountInput] = useState(''); // USD amount
  const [calculatedValue, setCalculatedValue] = useState(''); // Calculated coin quantity
  const [percentage, setPercentage] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState(null);

  // Order panel mode: 'spot' | 'quick'
  const [orderMode, setOrderMode] = useState('spot');

  // Quick Trade state
  const [qtAmount, setQtAmount] = useState('');
  const [qtDirection, setQtDirection] = useState('BUY');
  const [qtActive, setQtActive] = useState(null);
  const [qtResult, setQtResult] = useState(null);  // { won, profit, payout }
  const [qtTimeLeft, setQtTimeLeft] = useState(30);
  const [qtHistory, setQtHistory] = useState([]);
  const [qtPlacing, setQtPlacing] = useState(false);
  const [qtCycle, setQtCycle] = useState({ duration: 30, profit: 20, label: '30s' }); // Default cycle
  const qtTimerRef = useRef(null);

  // Cycle options for Quick Trade
  const CYCLE_OPTIONS = [
    { duration: 30, profit: 20, label: '30s' },
    { duration: 60, profit: 25, label: '60s' },
    { duration: 120, profit: 35, label: '120s' },
    { duration: 3600, profit: 45, label: '1hr' },
    { duration: 86400, profit: 60, label: '24hr' },
    { duration: 604800, profit: 70, label: '7d' },
    { duration: 2592000, profit: 80, label: '30d' },
  ];

  const chartContainerRef = useRef(null);
  const chartInstance = useRef(null);
  const candleSeries = useRef(null);
  const priceLineRefs = useRef([]);  // tracks active entry price lines

  const baseAsset = symbol.replace('USDT', '');
  const quoteAsset = 'USDT';

  const baseBalance = balances.find(b => b.asset === baseAsset)?.free || 0;
  const quoteBalance = balances.find(b => b.asset === quoteAsset)?.free || 0;

  const showToast = (type, msg) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 3500);
  };

  // Draw entry price lines on the chart for all open spot positions
  const drawEntryLines = (positionList) => {
    if (!candleSeries.current) return;
    // Remove old lines
    priceLineRefs.current.forEach(line => {
      try { candleSeries.current.removePriceLine(line); } catch (_) {}
    });
    priceLineRefs.current = [];

    positionList.forEach(pos => {
      if (!pos.avgEntryPrice || pos.quantity < 0.000001) return;
      const isProfit = pos.unrealizedPnl !== null && pos.unrealizedPnl >= 0;
      const line = candleSeries.current.createPriceLine({
        price:       pos.avgEntryPrice,
        color:       isProfit ? '#10B981' : '#F43F5E',
        lineWidth:   1,
        lineStyle:   2,  // dashed
        axisLabelVisible: true,
        title:       `${pos.asset} Entry`,
      });
      priceLineRefs.current.push(line);
    });
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
      if (posRes.positions) {
        setPositions(posRes.positions);
        drawEntryLines(posRes.positions);
      }
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
      setPositions(prev => {
        const updated = prev.map(pos => {
          if (pos.symbol !== data.symbol) return pos;
          const mark = (data.bid + data.ask) / 2;
          const currentValue = mark * pos.quantity;
          const unrealizedPnl = pos.totalCost ? currentValue - pos.totalCost : null;
          const unrealizedPnlPct = pos.totalCost && unrealizedPnl !== null ? (unrealizedPnl / pos.totalCost) * 100 : null;
          return { ...pos, markPrice: mark, currentValue, unrealizedPnl, unrealizedPnlPct };
        });
        // Redraw lines with updated PnL colours
        drawEntryLines(updated);
        return updated;
      });
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
        chart.timeScale().scrollToRealTime();
        // Redraw entry lines after candles load (positions already in state)
        drawEntryLines(positions);
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
      if (availableQuote > 0) {
        setAmountInput(((availableQuote * pct) / 100).toFixed(2));
      }
    } else {
      const availableBase = parseFloat(baseBalance);
      const curPrice = parseFloat(priceInput) || ticker.price;
      if (curPrice > 0) {
        const usdValue = (availableBase * pct / 100) * curPrice;
        setAmountInput(usdValue.toFixed(2));
      }
    }
  };

  // Calculate coin quantity from USD amount
  const calculateCoinQuantity = () => {
    const usdAmount = parseFloat(amountInput) || 0;
    const price = parseFloat(priceInput) || ticker.price;
    return price > 0 ? (usdAmount / price).toFixed(6) : '0';
  };

  // Update calculatedValue when amount, symbol, or price changes
  useEffect(() => {
    setCalculatedValue(calculateCoinQuantity());
  }, [amountInput, symbol, ticker.price, priceInput]);

  // Update priceInput when symbol changes for LIMIT orders
  useEffect(() => {
    if (orderType === 'LIMIT' && ticker.price) {
      setPriceInput(ticker.price.toString());
    }
  }, [symbol, orderType, ticker.price]);

  // Submit Order
  const handlePlaceOrder = async (e) => {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    try {
      const coinQuantity = calculateCoinQuantity();
      const res = await api.placeSpotOrder(token, {
        symbol,
        side: orderSide,
        type: orderType,
        price: priceInput,
        amount: coinQuantity
      });

      if (res.error) {
        showToast('error', res.error);
      } else {
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

  // ── Quick Trade ────────────────────────────────────────────────────────────
  const loadQtHistory = async () => {
    const res = await api.getQuickTradeHistory(token);
    if (res.trades) setQtHistory(res.trades);
  };

  const handleQuickTrade = async () => {
    const amt = parseFloat(qtAmount);
    if (isNaN(amt) || amt < 1) { showToast('error', 'Minimum $1 USDT'); return; }
    setQtPlacing(true);
    setQtResult(null);
    try {
      const res = await api.placeQuickTrade(token, { symbol, direction: qtDirection, amount: amt, cycle: qtCycle.label });
      if (res.error) { showToast('error', res.error); return; }

      setQtActive(res);
      setQtTimeLeft(qtCycle.duration);
      refreshData();

      // Countdown timer
      let t = qtCycle.duration;
      qtTimerRef.current = setInterval(() => {
        t -= 1;
        setQtTimeLeft(t);
        if (t <= 0) {
          clearInterval(qtTimerRef.current);
          // Poll for result
          const poll = setInterval(async () => {
            const r = await api.getQuickTrade(token, res.tradeId);
            if (r.trade && r.trade.status !== 'open') {
              clearInterval(poll);
              setQtResult({ won: r.trade.status === 'won', profit: parseFloat(r.trade.profit), payout: parseFloat(r.trade.amount) + parseFloat(r.trade.profit) });
              setQtActive(null);
              refreshData();
              loadQtHistory();
            }
          }, 1000);
        }
      }, 1000);
    } catch { showToast('error', 'Failed to place trade'); }
    finally { setQtPlacing(false); }
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
          <div className="col-header">
            <span>Order Book</span>
            <span className="ob-spread">
              Spread: {orderbook.asks.length > 0 && orderbook.bids.length > 0 
                ? ((orderbook.asks[0].price - orderbook.bids[0].price) / ticker.price * 100).toFixed(2) + '%'
                : '—'}
            </span>
          </div>
          <div className="ob-table-header">
            <span>Price(USDT)</span>
            <span>Amount({baseAsset})</span>
            <span>Total(USDT)</span>
          </div>

          {/* Asks (Sells) in Red */}
          <div className="ob-asks">
            {(orderbook.asks || []).slice(0, 10).map((a, i) => {
              const total = a.price * a.amount;
              const asksAmounts = orderbook.asks.map(x => x.amount);
              const maxAmount = asksAmounts.length > 0 ? Math.max(...asksAmounts) : 1;
              const depthPercent = (a.amount / maxAmount) * 100;
              return (
                <div key={i} className="ob-row ask-row">
                  <div className="ob-depth-bar ask-depth" style={{ width: `${depthPercent}%` }} />
                  <span className="ask-price">{a.price.toFixed(2)}</span>
                  <span className="ob-amount">{a.amount.toFixed(4)}</span>
                  <span className="ob-total">{total.toFixed(2)}</span>
                </div>
              );
            })}
          </div>

          {/* Mid Price Ticker */}
          <div className="ob-mid-price">
            <span className="ob-mid-label">Mid Price</span>
            <span className="ob-mid-value">${parseFloat(ticker.price || 0).toFixed(2)}</span>
          </div>

          {/* Bids (Buys) in Green */}
          <div className="ob-bids">
            {(orderbook.bids || []).slice(0, 10).map((b, i) => {
              const total = b.price * b.amount;
              const bidsAmounts = orderbook.bids.map(x => x.amount);
              const maxAmount = bidsAmounts.length > 0 ? Math.max(...bidsAmounts) : 1;
              const depthPercent = (b.amount / maxAmount) * 100;
              return (
                <div key={i} className="ob-row bid-row">
                  <div className="ob-depth-bar bid-depth" style={{ width: `${depthPercent}%` }} />
                  <span className="bid-price">{b.price.toFixed(2)}</span>
                  <span className="ob-amount">{b.amount.toFixed(4)}</span>
                  <span className="ob-total">{total.toFixed(2)}</span>
                </div>
              );
            })}
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

          {/* Mode switcher: Spot / Quick Trade */}
          <div className="order-mode-tabs">
            <button className={`order-mode-tab ${orderMode === 'spot' ? 'active' : ''}`} onClick={() => setOrderMode('spot')}>Spot</button>
            <button className={`order-mode-tab ${orderMode === 'quick' ? 'active qt' : ''}`} onClick={() => { setOrderMode('quick'); loadQtHistory(); }}>⚡ Quick Trade</button>
          </div>

          {/* ── SPOT ORDER ── */}
          {orderMode === 'spot' && (<>
          <div className="order-tabs">
            <button className={`side-tab buy ${orderSide === 'BUY' ? 'active' : ''}`} onClick={() => setOrderSide('BUY')}>Buy {baseAsset}</button>
            <button className={`side-tab sell ${orderSide === 'SELL' ? 'active' : ''}`} onClick={() => setOrderSide('SELL')}>Sell {baseAsset}</button>
          </div>

          {/* Order Type Selector */}
          <div className="order-type-selector">
            <button className={`order-type-btn ${orderType === 'LIMIT' ? 'active' : ''}`} onClick={() => setOrderType('LIMIT')}>Limit</button>
            <button className={`order-type-btn ${orderType === 'MARKET' ? 'active' : ''}`} onClick={() => setOrderType('MARKET')}>Market</button>
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

            <div className="form-group">
              <label>Amount</label>
              <div className="input-box">
                <input type="number" step="0.01" placeholder="0.00" value={amountInput} onChange={(e) => setAmountInput(e.target.value)} required />
              </div>
            </div>

            <div className="form-group">
              <label>Value</label>
              <div className="input-box">
                <input type="text" value={calculatedValue} readOnly />
              </div>
            </div>


            <div className="order-summary">
              <span>Order Total:</span>
              <span className="mono">${parseFloat(amountInput || 0).toFixed(2)}</span>
            </div>

            <button type="submit" className={`submit-order-btn ${orderSide.toLowerCase()}`} disabled={submitting}>
              {submitting ? 'Placing Order…' : `${orderSide} ${baseAsset}`}
            </button>
          </form>
          </>)}

          {/* ── QUICK TRADE ── */}
          {orderMode === 'quick' && (
            <div className="qt-panel">
              <div className="qt-info-banner">
                <span className="qt-info-icon">⚡</span>
                <div>
                  <div className="qt-info-title">Quick Trade</div>
                  <div className="qt-info-sub">Place a trade and earn <b>+{qtCycle.profit}% profit</b> in {qtCycle.label}</div>
                </div>
              </div>

              <div className="qt-balance">
                <span>Available USDT:</span>
                <span className="mono">${parseFloat(quoteBalance).toFixed(2)}</span>
              </div>

              {/* Direction */}
              <div className="qt-direction-row">
                <button className={`qt-dir-btn up ${qtDirection === 'BUY' ? 'active' : ''}`} onClick={() => setQtDirection('BUY')} disabled={!!qtActive}>
                  <span className="qt-arrow">▲</span> BUY
                </button>
                <button className={`qt-dir-btn down ${qtDirection === 'SELL' ? 'active' : ''}`} onClick={() => setQtDirection('SELL')} disabled={!!qtActive}>
                  <span className="qt-arrow">▼</span> SELL
                </button>
              </div>

              {/* Cycle Selection */}
              <div className="form-group">
                <label>Cycle</label>
                <div className="cycle-options">
                  {CYCLE_OPTIONS.map(cycle => (
                    <button
                      key={cycle.label}
                      type="button"
                      className={`cycle-btn ${qtCycle.label === cycle.label ? 'active' : ''}`}
                      onClick={() => setQtCycle(cycle)}
                      disabled={!!qtActive}
                    >
                      <span className="cycle-label">{cycle.label}</span>
                      <span className="cycle-profit">+{cycle.profit}%</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Amount */}
              <div className="form-group">
                <label>Trade Amount (USD)</label>
                <div className="input-box">
                  <input type="number" min="1" step="1" placeholder="e.g. 100" value={qtAmount}
                    onChange={e => setQtAmount(e.target.value)} disabled={!!qtActive} />
                  <span className="unit">USD</span>
                </div>
                {qtAmount && parseFloat(qtAmount) > 0 && ticker.price > 0 && (
                  <div className="qt-coin-value">
                    ≈ {(parseFloat(qtAmount) / ticker.price).toFixed(6)} {baseAsset}
                  </div>
                )}
              </div>

              {qtAmount && parseFloat(qtAmount) > 0 && (
                <div className="qt-payout-preview">
                  <div className="qt-payout-row"><span>Invest</span><b>${parseFloat(qtAmount || 0).toFixed(2)}</b></div>
                  <div className="qt-payout-row profit"><span>Profit ({qtCycle.profit}%)</span><b>+${(parseFloat(qtAmount || 0) * (qtCycle.profit / 100)).toFixed(2)}</b></div>
                  <div className="qt-payout-row total"><span>Total Payout</span><b>${(parseFloat(qtAmount || 0) * (1 + qtCycle.profit / 100)).toFixed(2)}</b></div>
                </div>
              )}

              {/* Quick amounts */}
              <div className="pct-slider">
                {[10, 25, 50, 100].map(v => (
                  <button key={v} type="button" className={`pct-btn ${qtAmount == v ? 'active' : ''}`}
                    onClick={() => setQtAmount(String(v))} disabled={!!qtActive}>${v}</button>
                ))}
              </div>

              {/* Active trade countdown */}
              {qtActive && (
                <div className="qt-active-trade">
                  <div className="qt-countdown-wrap">
                    <svg className="qt-countdown-ring" viewBox="0 0 44 44">
                      <circle cx="22" cy="22" r="18" fill="none" stroke="#1E2D40" strokeWidth="4"/>
                      <circle cx="22" cy="22" r="18" fill="none" stroke={qtDirection === 'BUY' ? '#10B981' : '#EF4444'}
                        strokeWidth="4" strokeDasharray="113" strokeDashoffset={113 - (113 * qtTimeLeft / qtCycle.duration)}
                        strokeLinecap="round" transform="rotate(-90 22 22)" style={{transition:'stroke-dashoffset 1s linear'}}/>
                    </svg>
                    <span className="qt-countdown-num">{qtTimeLeft}s</span>
                  </div>
                  <div className="qt-active-info">
                    <div className="qt-active-dir" style={{color: qtDirection === 'BUY' ? '#10B981' : '#EF4444'}}>
                      {qtDirection === 'BUY' ? '▲ BUY' : '▼ SELL'} · {symbol.replace('USDT','/USDT')}
                    </div>
                    <div className="qt-active-amt">
                      ${qtActive.amount} → <b style={{color:'#10B981'}}>+${qtActive.profitIfWin}</b>
                    </div>
                    <div className="qt-active-entry">Entry: ${parseFloat(qtActive.entryPrice).toLocaleString(undefined,{minimumFractionDigits:2})}</div>
                  </div>
                </div>
              )}

              {/* Result banner */}
              {qtResult && !qtActive && (
                <div className={`qt-result-banner ${qtResult.won ? 'won' : 'lost'}`}>
                  <div className="qt-result-icon">{qtResult.won ? '🎉' : '😞'}</div>
                  <div>
                    <div className="qt-result-title">{qtResult.won ? 'Trade Won!' : 'Trade Lost'}</div>
                    <div className="qt-result-sub">
                      {qtResult.won
                        ? `+$${qtResult.profit.toFixed(2)} profit · Payout: $${qtResult.payout.toFixed(2)}`
                        : 'Better luck next time'}
                    </div>
                  </div>
                </div>
              )}

              <button className={`submit-order-btn ${qtDirection === 'BUY' ? 'buy' : 'sell'} qt-trade-btn`}
                onClick={handleQuickTrade} disabled={!!qtActive || qtPlacing || !qtAmount}>
                {qtActive ? `Trading… ${qtTimeLeft}s` : qtPlacing ? 'Placing…' : `⚡ Trade ${qtDirection === 'BUY' ? '▲ BUY' : '▼ SELL'}`}
              </button>

              {/* Recent history */}
              {qtHistory.length > 0 && (
                <div className="qt-history">
                  <div className="qt-history-title">Recent Trades</div>
                  {qtHistory.slice(0, 5).map(t => (
                    <div key={t.id} className={`qt-history-row ${t.status}`}>
                      <span className="qt-h-dir" style={{color: t.direction==='BUY'?'#10B981':'#EF4444'}}>{t.direction==='BUY'?'▲':'▼'} {t.symbol.replace('USDT','')}</span>
                      <span className="qt-h-amt">${parseFloat(t.amount).toFixed(0)}</span>
                      <span className={`qt-h-result ${t.status}`}>
                        {t.status === 'won' ? `+$${parseFloat(t.profit).toFixed(2)}` : t.status === 'open' ? '⏳' : `-$${parseFloat(t.amount).toFixed(2)}`}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
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
                    const rowClass = pnl === null ? '' : pnl > 0 ? 'row-profit' : pnl < 0 ? 'row-loss' : '';
                    return (
                      <tr key={pos.asset} className={rowClass}>
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

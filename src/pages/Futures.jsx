import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import { createChart } from 'lightweight-charts';
import CryptoIcon from '../components/CryptoIcon';
import Icon from '../components/Icon';
import './Futures.css';

const PAIRS = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'XRPUSDT', 'DOGEUSDT', 'ADAUSDT'];
const LEVERAGES = [1, 2, 3, 5, 10, 20, 50, 100, 125];

export default function Futures() {
  const { token } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const symbol = (searchParams.get('symbol') || 'BTCUSDT').toUpperCase();

  const [futuresBalance, setFuturesBalance] = useState(0);
  const [positions, setPositions]           = useState([]);
  const [history, setHistory]               = useState([]);
  const [ticker, setTicker]                 = useState({ price: 0, high: 0, low: 0, change: 0 });
  const [bottomTab, setBottomTab]           = useState('positions');
  const [mobileDeskTab, setMobileDeskTab]   = useState('chart');

  // Order form
  const [side, setSide]         = useState('BUY');
  const [leverage, setLeverage] = useState(10);
  const [orderType, setOrderType] = useState('MARKET');
  const [quantity, setQuantity] = useState('');
  const [limitPrice, setLimitPrice] = useState('');
  const [toast, setToast]       = useState(null);

  // Transfer modal
  const [showTransfer, setShowTransfer] = useState(false);
  const [transferAmount, setTransferAmount] = useState('');
  const [transferDir, setTransferDir]   = useState('spot_to_futures');

  const chartRef = useRef(null);
  const chartInst = useRef(null);

  const showToast = (type, msg) => { setToast({ type, msg }); setTimeout(() => setToast(null), 3500); };

  const loadData = useCallback(async () => {
    try {
      const [walRes, posRes, histRes] = await Promise.all([
        api.getFuturesWallet(token),
        api.getFuturesPositions(token),
        api.getFuturesHistory(token),
      ]);
      if (walRes.balance !== undefined) setFuturesBalance(walRes.balance);
      if (posRes.positions) setPositions(posRes.positions);
      if (histRes.history) setHistory(histRes.history);
    } catch (err) { console.error('Futures load error:', err); }
  }, [token]);

  // Poll ticker
  useEffect(() => {
    async function fetchTicker() {
      try {
        const res = await api.getOrderbook(symbol);
        if (res.lastPrice) {
          setTicker(prev => ({
            ...prev,
            price: res.lastPrice,
            high: res.lastPrice * 1.025,
            low: res.lastPrice * 0.975,
          }));
          if (orderType === 'MARKET') setLimitPrice(res.lastPrice.toString());
        }
      } catch {}
    }
    fetchTicker();
    const t = setInterval(fetchTicker, 2000);
    return () => clearInterval(t);
  }, [symbol, orderType]);

  useEffect(() => { loadData(); }, [loadData]);

  // Chart
  useEffect(() => {
    if (!chartRef.current) return;
    if (chartInst.current) {
      chartInst.current.remove();
      chartInst.current = null;
    }

    const container = chartRef.current;

    const chart = createChart(container, {
      autoSize: true,
      layout: { background: { color: '#0B0E11' }, textColor: '#848E9C' },
      grid: { vertLines: { color: '#2B313A' }, horzLines: { color: '#2B313A' } },
      timeScale: { timeVisible: true, borderColor: '#2B313A' },
    });

    const series = chart.addCandlestickSeries({
      upColor: '#0ECB81', downColor: '#F6465D', borderVisible: false,
      wickUpColor: '#0ECB81', wickDownColor: '#F6465D',
    });

    chartInst.current = chart;

    api.getChartCandles(symbol, '1h').then(res => {
      if (res.candles) series.setData(res.candles);
    });

    return () => {
      if (chartInst.current) {
        chartInst.current.remove();
        chartInst.current = null;
      }
    };
  }, [symbol]);

  const handlePlaceOrder = async (e) => {
    e.preventDefault();
    const res = await api.placeFuturesOrder(token, {
      symbol, side, quantity, leverage,
      type: orderType, price: limitPrice,
    });
    if (res.error) showToast('error', res.error);
    else {
      showToast('success', `${side} position opened @ $${res.entryPrice?.toLocaleString()}`);
      setQuantity(''); loadData();
    }
  };

  const handleClose = async (posId) => {
    const res = await api.closeFuturesPosition(token, posId);
    if (res.error) showToast('error', res.error);
    else {
      const pnl = parseFloat(res.realizedPnl);
      showToast(pnl >= 0 ? 'success' : 'error', `Closed: PnL $${pnl.toFixed(2)}`);
      loadData();
    }
  };

  const handleTransfer = async (e) => {
    e.preventDefault();
    const res = await api.transferFutures(token, { amount: transferAmount, direction: transferDir });
    if (res.error) showToast('error', res.error);
    else { showToast('success', 'Transfer successful'); setShowTransfer(false); setTransferAmount(''); loadData(); }
  };

  const totalUnrealizedPnl = positions.reduce((s, p) => s + parseFloat(p.unrealized_pnl || 0), 0);

  return (
    <div className="futures-layout">
      {toast && <div className={`ft-toast ${toast.type}`}>{toast.msg}</div>}

      {/* Pair bar */}
      <div className="ft-pair-bar">
        <div className="ft-pair-left">
          <CryptoIcon symbol={symbol.replace('USDT','')} size={28} />
          <span className="ft-pair-name">{symbol.replace('USDT', '')}<span className="ft-perp">PERP</span></span>
          <div className="ft-pair-dropdown">
            {PAIRS.map(p => (
              <button key={p} className={`ft-pair-btn ${p === symbol ? 'active' : ''}`}
                onClick={() => setSearchParams({ symbol: p })}>
                {p.replace('USDT', '')}
              </button>
            ))}
          </div>
        </div>
        <div className="ft-ticker-stats">
          <div className="ft-stat">
            <span className="ft-stat-label">Mark Price</span>
            <span className="ft-stat-val yellow">${parseFloat(ticker.price || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
          </div>
          <div className="ft-stat">
            <span className="ft-stat-label">24h High</span>
            <span className="ft-stat-val">${parseFloat(ticker.high || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
          </div>
          <div className="ft-stat">
            <span className="ft-stat-label">24h Low</span>
            <span className="ft-stat-val">${parseFloat(ticker.low || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
          </div>
          <div className="ft-stat">
            <span className="ft-stat-label">Funding Rate</span>
            <span className="ft-stat-val pos">+0.0100%</span>
          </div>
        </div>
      </div>

      {/* Mobile tab switcher */}
      <div className="ft-mobile-tabs">
        {[{key:'chart',label:'Chart'},{key:'order',label:'Order'}].map(t => (
          <button key={t.key} className={`ft-mobile-tab ${mobileDeskTab===t.key?'active':''}`}
            onClick={() => setMobileDeskTab(t.key)}>{t.label}</button>
        ))}
      </div>

      {/* Main grid */}
      <div className="ft-main-grid">
        {/* Chart */}
        <div className={`ft-chart-col${mobileDeskTab==='chart'?' mobile-visible':''}`}>
          <div className="ft-chart-header">
            <span>{symbol} Perpetual</span>
            <span className={`ft-pnl-pill ${totalUnrealizedPnl >= 0 ? 'pos' : 'neg'}`}>
              Unrealized: {totalUnrealizedPnl >= 0 ? '+' : ''}${totalUnrealizedPnl.toFixed(2)}
            </span>
          </div>
          <div className="ft-chart-wrap" ref={chartRef} />
        </div>

        {/* Order panel */}
        <div className={`ft-order-col${mobileDeskTab==='order'?' mobile-visible':''}`}>
          {/* Wallet */}
          <div className="ft-wallet-box">
            <div className="ft-wallet-info">
              <span className="ft-wallet-label">Futures Balance</span>
              <span className="ft-wallet-val">{parseFloat(futuresBalance).toFixed(2)} <span className="usdt">USDT</span></span>
            </div>
            <button className="ft-transfer-btn" onClick={() => setShowTransfer(true)}>Transfer</button>
          </div>

          {/* Leverage */}
          <div className="ft-leverage-section">
            <span className="ft-section-label">Leverage: <b>{leverage}x</b></span>
            <div className="ft-lev-grid">
              {LEVERAGES.map(l => (
                <button key={l} className={`ft-lev-btn ${leverage === l ? 'active' : ''}`}
                  onClick={() => setLeverage(l)}>{l}x</button>
              ))}
            </div>
          </div>

          {/* Buy/Sell tabs */}
          <div className="ft-side-tabs">
            <button className={`ft-side-tab long ${side === 'BUY' ? 'active' : ''}`} onClick={() => setSide('BUY')}>
              Long / Buy
            </button>
            <button className={`ft-side-tab short ${side === 'SELL' ? 'active' : ''}`} onClick={() => setSide('SELL')}>
              Short / Sell
            </button>
          </div>

          {/* Order form */}
          <form className="ft-order-form" onSubmit={handlePlaceOrder}>
            <div className="ft-type-toggle">
              {['MARKET','LIMIT'].map(t => (
                <button key={t} type="button"
                  className={`ft-type-btn ${orderType === t ? 'active' : ''}`}
                  onClick={() => setOrderType(t)}>{t}</button>
              ))}
            </div>

            {orderType === 'LIMIT' && (
              <div className="ft-form-group">
                <label>Price (USDT)</label>
                <div className="ft-input-box">
                  <input type="number" step="0.01" value={limitPrice}
                    onChange={e => setLimitPrice(e.target.value)} required />
                  <span className="ft-unit">USDT</span>
                </div>
              </div>
            )}

            <div className="ft-form-group">
              <label>Quantity ({symbol.replace('USDT','')})</label>
              <div className="ft-input-box">
                <input type="number" step="0.001" placeholder="0.000" value={quantity}
                  onChange={e => setQuantity(e.target.value)} required />
                <span className="ft-unit">{symbol.replace('USDT','')}</span>
              </div>
            </div>

            <div className="ft-order-summary">
              <div className="ft-summary-row">
                <span>Notional</span>
                <span className="mono">${(parseFloat(quantity||0) * parseFloat(ticker.price||0)).toLocaleString(undefined,{maximumFractionDigits:2})}</span>
              </div>
              <div className="ft-summary-row">
                <span>Required Margin</span>
                <span className="mono">${((parseFloat(quantity||0) * parseFloat(ticker.price||0)) / leverage).toFixed(2)}</span>
              </div>
            </div>

            <button type="submit" className={`ft-submit-btn ${side === 'BUY' ? 'long' : 'short'}`}>
              {side === 'BUY' ? `Long ${symbol.replace('USDT','')}` : `Short ${symbol.replace('USDT','')}`}
            </button>
          </form>
        </div>
      </div>

      {/* Bottom panel */}
      <div className="ft-bottom-panel">
        <div className="ft-bottom-tabs">
          <button className={`ft-bottom-tab ${bottomTab==='positions'?'active':''}`} onClick={()=>setBottomTab('positions')}>
            Open Positions ({positions.length})
          </button>
          <button className={`ft-bottom-tab ${bottomTab==='history'?'active':''}`} onClick={()=>setBottomTab('history')}>
            Position History
          </button>
        </div>
        <div className="ft-bottom-table-wrap">
          {bottomTab === 'positions' && (
            <table className="ft-table">
              <thead><tr>
                <th>Symbol</th><th>Side</th><th>Size</th><th>Entry Price</th>
                <th>Mark Price</th><th>Leverage</th><th>Margin</th><th>Unrealized PnL</th><th>ROE%</th><th>Action</th>
              </tr></thead>
              <tbody>
                {positions.length === 0
                  ? <tr><td colSpan="10" className="ft-empty">No open positions</td></tr>
                  : positions.map(p => (
                    <tr key={p.id}>
                      <td><b>{p.symbol}</b></td>
                      <td><span className={`ft-side ${p.side.toLowerCase()}`}>{p.side}</span></td>
                      <td className="mono">{parseFloat(p.size).toFixed(4)}</td>
                      <td className="mono">${parseFloat(p.entry_price).toLocaleString(undefined,{minimumFractionDigits:2})}</td>
                      <td className="mono">${parseFloat(p.mark_price).toLocaleString(undefined,{minimumFractionDigits:2})}</td>
                      <td className="mono">{p.leverage}x</td>
                      <td className="mono">${parseFloat(p.margin).toFixed(2)}</td>
                      <td className={`mono ${parseFloat(p.unrealized_pnl)>=0?'pos':'neg'}`}>
                        {parseFloat(p.unrealized_pnl)>=0?'+':''}{parseFloat(p.unrealized_pnl).toFixed(4)}
                      </td>
                      <td className={parseFloat(p.roe)>=0?'pos':'neg'}>{p.roe}%</td>
                      <td><button className="ft-close-btn" onClick={()=>handleClose(p.id)}>Close</button></td>
                    </tr>
                  ))
                }
              </tbody>
            </table>
          )}
          {bottomTab === 'history' && (
            <table className="ft-table">
              <thead><tr>
                <th>Symbol</th><th>Side</th><th>Size</th><th>Entry</th><th>Leverage</th><th>Realized PnL</th><th>Status</th><th>Opened</th>
              </tr></thead>
              <tbody>
                {history.length === 0
                  ? <tr><td colSpan="8" className="ft-empty">No position history</td></tr>
                  : history.map(p => (
                    <tr key={p.id}>
                      <td><b>{p.symbol}</b></td>
                      <td><span className={`ft-side ${p.side.toLowerCase()}`}>{p.side}</span></td>
                      <td className="mono">{parseFloat(p.size).toFixed(4)}</td>
                      <td className="mono">${parseFloat(p.entry_price).toLocaleString(undefined,{minimumFractionDigits:2})}</td>
                      <td className="mono">{p.leverage}x</td>
                      <td className={`mono ${parseFloat(p.realized_pnl||0)>=0?'pos':'neg'}`}>
                        {parseFloat(p.realized_pnl||0)>=0?'+':''}{parseFloat(p.realized_pnl||0).toFixed(4)}
                      </td>
                      <td><span className={`ft-status ${p.status.toLowerCase()}`}>{p.status}</span></td>
                      <td>{new Date(p.opened_at).toLocaleString()}</td>
                    </tr>
                  ))
                }
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Transfer Modal */}
      {showTransfer && (
        <div className="ft-modal-backdrop">
          <div className="ft-modal">
            <div className="ft-modal-head">
              <h3>Transfer USDT</h3>
              <button className="ft-modal-close" onClick={() => setShowTransfer(false)}>
                <Icon name="close" size={18} />
              </button>
            </div>
            <form onSubmit={handleTransfer} className="ft-modal-body">
              <div className="ft-modal-field">
                <label>Direction</label>
                <select value={transferDir} onChange={e => setTransferDir(e.target.value)}>
                  <option value="spot_to_futures">Spot Wallet → Futures Wallet</option>
                  <option value="futures_to_spot">Futures Wallet → Spot Wallet</option>
                </select>
              </div>
              <div className="ft-modal-field">
                <label>Amount (USDT)</label>
                <input type="number" step="0.01" placeholder="0.00" value={transferAmount}
                  onChange={e => setTransferAmount(e.target.value)} required />
              </div>
              <button type="submit" className="ft-modal-confirm">Confirm Transfer</button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

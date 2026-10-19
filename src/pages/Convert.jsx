import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import './Convert.css';

const ASSETS = ['USDT', 'BTC', 'ETH', 'SOL', 'BNB', 'XRP', 'DOGE', 'ADA'];

export default function Convert() {
  const { token } = useAuth();
  const [fromAsset, setFromAsset] = useState('BTC');
  const [toAsset, setToAsset]     = useState('USDT');
  const [amount, setAmount]       = useState('');
  const [quote, setQuote]         = useState(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [history, setHistory]     = useState([]);
  const [balances, setBalances]   = useState([]);
  const [toast, setToast]         = useState(null);
  const [countdown, setCountdown] = useState(0);

  const showToast = (type, msg) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 3500);
  };

  const loadData = useCallback(async () => {
    const [balRes, histRes] = await Promise.all([
      api.getWalletBalances(token),
      api.getConvertHistory(token),
    ]);
    if (balRes.balances) setBalances(balRes.balances);
    if (histRes.history) setHistory(histRes.history);
  }, [token]);

  useEffect(() => { loadData(); }, [loadData]);

  const getBalance = (asset) => {
    const b = balances.find(b => b.asset === asset);
    return b ? parseFloat(b.free) : 0;
  };

  const fetchQuote = useCallback(async () => {
    if (!amount || parseFloat(amount) <= 0 || fromAsset === toAsset) return;
    setQuoteLoading(true);
    try {
      const res = await api.getConvertQuote(token, fromAsset, toAsset, amount);
      if (res.error) { showToast('error', res.error); setQuote(null); }
      else { setQuote(res); setCountdown(10); }
    } catch { showToast('error', 'Failed to get quote'); }
    finally { setQuoteLoading(false); }
  }, [token, fromAsset, toAsset, amount]);

  // Countdown timer for quote validity
  useEffect(() => {
    if (countdown <= 0) return;
    const t = setInterval(() => setCountdown(c => {
      if (c <= 1) { setQuote(null); return 0; }
      return c - 1;
    }), 1000);
    return () => clearInterval(t);
  }, [countdown]);

  const handleSwap = () => {
    setFromAsset(toAsset);
    setToAsset(fromAsset);
    setQuote(null);
    setAmount('');
  };

  const handleConfirm = async () => {
    if (!quote) return;
    try {
      const res = await api.executeConvert(token, {
        from: fromAsset, to: toAsset,
        fromAmount: quote.fromAmount, toAmount: quote.toAmount,
      });
      if (res.error) showToast('error', res.error);
      else {
        showToast('success', `Converted ${quote.fromAmount} ${fromAsset} → ${quote.toAmount} ${toAsset}`);
        setQuote(null); setAmount(''); setCountdown(0);
        loadData();
      }
    } catch { showToast('error', 'Conversion failed'); }
  };

  return (
    <div className="convert-page">
      {toast && <div className={`cv-toast ${toast.type}`}>{toast.msg}</div>}

      <div className="convert-container">
        <div className="convert-header">
          <h1>Convert</h1>
          <p>Convert crypto instantly with zero slippage</p>
        </div>

        <div className="convert-layout">
          {/* Left: Swap Panel */}
          <div className="swap-card">
            <div className="swap-section">
              <label className="swap-label">From</label>
              <div className="swap-row">
                <select className="asset-select" value={fromAsset} onChange={e => { setFromAsset(e.target.value); setQuote(null); }}>
                  {ASSETS.filter(a => a !== toAsset).map(a => <option key={a} value={a}>{a}</option>)}
                </select>
                <input
                  type="number"
                  className="swap-input"
                  placeholder="0.00"
                  value={amount}
                  onChange={e => { setAmount(e.target.value); setQuote(null); }}
                />
              </div>
              <div className="swap-balance">
                Available: <span className="mono">{getBalance(fromAsset).toFixed(6)} {fromAsset}</span>
                <button className="max-btn" onClick={() => { setAmount(getBalance(fromAsset).toString()); setQuote(null); }}>MAX</button>
              </div>
            </div>

            <div className="swap-arrow-row">
              <button className="swap-arrow-btn" onClick={handleSwap} title="Swap direction">⇅</button>
            </div>

            <div className="swap-section">
              <label className="swap-label">To</label>
              <div className="swap-row">
                <select className="asset-select" value={toAsset} onChange={e => { setToAsset(e.target.value); setQuote(null); }}>
                  {ASSETS.filter(a => a !== fromAsset).map(a => <option key={a} value={a}>{a}</option>)}
                </select>
                <div className="swap-input estimated">
                  {quote ? parseFloat(quote.toAmount).toFixed(8) : '—'}
                </div>
              </div>
            </div>

            {quote && (
              <div className="quote-box">
                <div className="quote-row">
                  <span>Rate</span>
                  <span className="mono">1 {fromAsset} = {parseFloat(quote.rate).toFixed(6)} {toAsset}</span>
                </div>
                <div className="quote-row">
                  <span>Fee (0.1%)</span>
                  <span className="mono">{quote.fee} USDT</span>
                </div>
                <div className="quote-timer">
                  Quote expires in <b>{countdown}s</b>
                </div>
              </div>
            )}

            <div className="swap-actions">
              {!quote ? (
                <button
                  className="get-quote-btn"
                  onClick={fetchQuote}
                  disabled={quoteLoading || !amount || fromAsset === toAsset}
                >
                  {quoteLoading ? 'Getting Quote...' : 'Get Quote'}
                </button>
              ) : (
                <button className="confirm-btn" onClick={handleConfirm}>
                  Confirm Convert
                </button>
              )}
            </div>
          </div>

          {/* Right: Info panel */}
          <div className="convert-info">
            <div className="info-card">
              <div className="info-icon">⚡</div>
              <h3>Instant Execution</h3>
              <p>Conversions execute at real-time market prices with zero order book slippage.</p>
            </div>
            <div className="info-card">
              <div className="info-icon">💰</div>
              <h3>Low Fees</h3>
              <p>0.1% flat conversion fee across all asset pairs. No hidden charges.</p>
            </div>
            <div className="info-card">
              <div className="info-icon">🔒</div>
              <h3>Quote Lock</h3>
              <p>Prices are locked for 10 seconds so you know exactly what you'll receive.</p>
            </div>
          </div>
        </div>

        {/* Convert History */}
        <div className="convert-history-card">
          <h2>Conversion History</h2>
          {history.length === 0 ? (
            <div className="cv-empty">No conversions yet</div>
          ) : (
            <div className="cv-table-wrap">
              <table className="cv-table">
                <thead>
                  <tr>
                    <th>Time</th>
                    <th>From</th>
                    <th>To</th>
                    <th>Rate</th>
                    <th>Fee</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map(h => (
                    <tr key={h.id}>
                      <td>{new Date(h.created_at).toLocaleString()}</td>
                      <td className="mono">{parseFloat(h.from_amount).toFixed(6)} <b>{h.from_asset}</b></td>
                      <td className="mono">{parseFloat(h.to_amount).toFixed(6)} <b>{h.to_asset}</b></td>
                      <td className="mono">{parseFloat(h.rate).toFixed(6)}</td>
                      <td className="mono">{parseFloat(h.fee).toFixed(4)} USDT</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

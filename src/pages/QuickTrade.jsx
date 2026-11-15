import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import { wsService } from '../services/websocket';
import CryptoIcon from '../components/CryptoIcon';
import './QuickTrade.css';

const PAIRS = ['BTCUSDT','ETHUSDT','SOLUSDT','BNBUSDT','XRPUSDT','DOGEUSDT','ADAUSDT','LTCUSDT','AVAXUSDT','LINKUSDT','MATICUSDT','DOTUSDT','TRXUSDT','UNIUSDT','ATOMUSDT'];
const PROFIT_RATE = 0.20;
const DURATION = 30;
const QUICK_AMOUNTS = [10, 25, 50, 100, 250, 500];

export default function QuickTrade() {
  const { token } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const symbol = (searchParams.get('symbol') || 'BTCUSDT').toUpperCase();

  const [livePrice, setLivePrice] = useState(0);
  const [balanceUSDT, setBalanceUSDT] = useState(0);
  const [direction, setDirection] = useState('BUY');
  const [amount, setAmount] = useState('');
  const [placing, setPlacing] = useState(false);
  const [active, setActive] = useState(null);     // current trade
  const [timeLeft, setTimeLeft] = useState(DURATION);
  const [result, setResult] = useState(null);     // { won, profit, payout, entryPrice, exitPrice }
  const [history, setHistory] = useState([]);
  const [toast, setToast] = useState(null);
  const timerRef = useRef(null);

  const baseAsset = symbol.replace('USDT', '');

  const showToast = (type, msg) => { setToast({ type, msg }); setTimeout(() => setToast(null), 3500); };

  // Load balance + history
  const loadData = useCallback(async () => {
    const [balRes, histRes] = await Promise.all([
      api.getWalletBalances(token),
      api.getQuickTradeHistory(token),
    ]);
    if (balRes.balances) {
      const usdt = balRes.balances.find(b => b.asset === 'USDT');
      setBalanceUSDT(parseFloat(usdt?.free || 0));
    }
    if (histRes.trades) setHistory(histRes.trades);
  }, [token]);

  useEffect(() => { loadData(); }, [loadData]);

  // Live price via WebSocket
  useEffect(() => {
    if (!wsService.isConnected) wsService.connect(token);
    wsService.send({ type: 'subscribe_price', symbol });
    const handler = (data) => {
      if (data.symbol === symbol) setLivePrice((data.bid + data.ask) / 2);
    };
    wsService.on('price_tick', handler);
    return () => {
      wsService.off('price_tick', handler);
      wsService.send({ type: 'unsubscribe_price', symbol });
    };
  }, [symbol, token]);

  const profit = parseFloat(amount || 0) * PROFIT_RATE;
  const payout = parseFloat(amount || 0) + profit;

  const handleTrade = async () => {
    const amt = parseFloat(amount);
    if (isNaN(amt) || amt < 1) { showToast('error', 'Minimum $1 USDT'); return; }
    if (amt > balanceUSDT) { showToast('error', 'Insufficient USDT balance'); return; }
    setPlacing(true);
    setResult(null);
    try {
      const res = await api.placeQuickTrade(token, { symbol, direction, amount: amt });
      if (res.error) { showToast('error', res.error); return; }
      setActive(res);
      setTimeLeft(DURATION);
      loadData();

      let t = DURATION;
      timerRef.current = setInterval(() => {
        t -= 1;
        setTimeLeft(t);
        if (t <= 0) {
          clearInterval(timerRef.current);
          // Poll for settlement
          const poll = setInterval(async () => {
            const r = await api.getQuickTrade(token, res.tradeId);
            if (r.trade && r.trade.status !== 'open') {
              clearInterval(poll);
              setResult({
                won:        r.trade.status === 'won',
                profit:     parseFloat(r.trade.profit),
                payout:     parseFloat(r.trade.amount) + parseFloat(r.trade.profit),
                entryPrice: parseFloat(r.trade.entry_price),
                exitPrice:  parseFloat(r.trade.exit_price),
              });
              setActive(null);
              loadData();
            }
          }, 1000);
        }
      }, 1000);
    } catch { showToast('error', 'Failed to place trade'); }
    finally { setPlacing(false); }
  };

  // Progress arc for countdown
  const radius = 54;
  const circ = 2 * Math.PI * radius;
  const arcOffset = circ - (circ * (DURATION - timeLeft) / DURATION);

  return (
    <div className="qt-page">
      {toast && <div className={`qt-toast ${toast.type}`}>{toast.msg}</div>}

      {/* Header */}
      <div className="qt-page-header">
        <div>
          <h1 className="qt-page-title">⚡ Quick Trade</h1>
          <p className="qt-page-sub">Predict UP or DOWN in 30 seconds and earn <b>+20% profit</b> guaranteed</p>
        </div>
        <div className="qt-balance-pill">
          <span>Available</span>
          <b>${balanceUSDT.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDT</b>
        </div>
      </div>

      <div className="qt-main-grid">
        {/* ── LEFT: Trade Panel ── */}
        <div className="qt-trade-card">

          {/* Pair selector */}
          <div className="qt-pair-row">
            <div className="qt-pair-active">
              <CryptoIcon symbol={baseAsset} size={32} />
              <div>
                <div className="qt-pair-name">{symbol.replace('USDT', '/USDT')}</div>
                <div className="qt-live-price">${livePrice > 0 ? livePrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 }) : '—'}</div>
              </div>
            </div>
            <div className="qt-pair-pills">
              {PAIRS.slice(0, 7).map(p => (
                <button key={p}
                  className={`qt-pair-pill ${p === symbol ? 'active' : ''}`}
                  onClick={() => setSearchParams({ symbol: p })}
                  disabled={!!active}>
                  {p.replace('USDT', '')}
                </button>
              ))}
              <select className="qt-pair-more" value={symbol}
                onChange={e => setSearchParams({ symbol: e.target.value })} disabled={!!active}>
                {PAIRS.map(p => <option key={p} value={p}>{p.replace('USDT', '/USDT')}</option>)}
              </select>
            </div>
          </div>

          {/* Direction buttons */}
          <div className="qt-direction-grid">
            <button
              className={`qt-dir-card up ${direction === 'BUY' ? 'active' : ''}`}
              onClick={() => setDirection('BUY')} disabled={!!active}>
              <span className="qt-dir-arrow">▲</span>
              <span className="qt-dir-label">UP</span>
              <span className="qt-dir-hint">Price goes up</span>
            </button>
            <button
              className={`qt-dir-card down ${direction === 'SELL' ? 'active' : ''}`}
              onClick={() => setDirection('SELL')} disabled={!!active}>
              <span className="qt-dir-arrow">▼</span>
              <span className="qt-dir-label">DOWN</span>
              <span className="qt-dir-hint">Price goes down</span>
            </button>
          </div>

          {/* Amount input */}
          <div className="qt-amount-section">
            <label className="qt-label">Trade Amount (USDT)</label>
            <div className="qt-amount-input-wrap">
              <span className="qt-currency">$</span>
              <input
                type="number" min="1" step="1" placeholder="0"
                value={amount} onChange={e => setAmount(e.target.value)}
                disabled={!!active} className="qt-amount-input" />
              <span className="qt-currency-label">USDT</span>
            </div>
            <div className="qt-quick-amounts">
              {QUICK_AMOUNTS.map(v => (
                <button key={v} type="button"
                  className={`qt-quick-btn ${parseFloat(amount) === v ? 'active' : ''}`}
                  onClick={() => setAmount(String(v))} disabled={!!active}>
                  ${v}
                </button>
              ))}
            </div>
          </div>

          {/* Payout preview */}
          {parseFloat(amount) > 0 && (
            <div className="qt-payout-card">
              <div className="qt-payout-row">
                <span>Investment</span>
                <span>${parseFloat(amount).toFixed(2)}</span>
              </div>
              <div className="qt-payout-row profit">
                <span>Profit (+20%)</span>
                <span>+${profit.toFixed(2)}</span>
              </div>
              <div className="qt-payout-divider" />
              <div className="qt-payout-row total">
                <span>Total Payout</span>
                <b>${payout.toFixed(2)}</b>
              </div>
            </div>
          )}

          {/* Active trade countdown */}
          {active && (
            <div className={`qt-active-card ${direction === 'BUY' ? 'up' : 'down'}`}>
              <svg className="qt-arc" viewBox="0 0 128 128">
                <circle cx="64" cy="64" r={radius} fill="none" stroke="rgba(255,255,255,.1)" strokeWidth="8"/>
                <circle cx="64" cy="64" r={radius} fill="none"
                  stroke={direction === 'BUY' ? '#10B981' : '#EF4444'}
                  strokeWidth="8" strokeDasharray={circ} strokeDashoffset={arcOffset}
                  strokeLinecap="round" transform="rotate(-90 64 64)"
                  style={{ transition: 'stroke-dashoffset 1s linear' }}/>
                <text x="64" y="64" textAnchor="middle" dominantBaseline="central"
                  fill="#fff" fontSize="22" fontWeight="800">{timeLeft}</text>
                <text x="64" y="84" textAnchor="middle" fill="rgba(255,255,255,.5)" fontSize="10">secs</text>
              </svg>
              <div className="qt-active-info">
                <div className="qt-active-dir" style={{ color: direction === 'BUY' ? '#10B981' : '#EF4444' }}>
                  {direction === 'BUY' ? '▲ UP' : '▼ DOWN'} · {symbol.replace('USDT', '/USDT')}
                </div>
                <div className="qt-active-row"><span>Invested</span><b>${parseFloat(active.amount).toFixed(2)}</b></div>
                <div className="qt-active-row"><span>Win payout</span><b style={{ color:'#10B981' }}>${(parseFloat(active.amount) * 1.20).toFixed(2)}</b></div>
                <div className="qt-active-row"><span>Entry price</span><b>${parseFloat(active.entryPrice).toLocaleString(undefined,{minimumFractionDigits:2})}</b></div>
                <div className="qt-active-row"><span>Current price</span><b className={livePrice > parseFloat(active.entryPrice) ? 'pos' : 'neg'}>${livePrice.toLocaleString(undefined,{minimumFractionDigits:2})}</b></div>
              </div>
            </div>
          )}

          {/* Result banner */}
          {result && !active && (
            <div className={`qt-result-card ${result.won ? 'won' : 'lost'}`}>
              <div className="qt-result-icon">{result.won ? '🎉' : '😞'}</div>
              <div className="qt-result-body">
                <div className="qt-result-title">{result.won ? 'You Won!' : 'You Lost'}</div>
                {result.won
                  ? <div className="qt-result-sub">+${result.profit.toFixed(2)} profit · Payout: <b>${result.payout.toFixed(2)}</b></div>
                  : <div className="qt-result-sub">Better luck next time</div>
                }
                <div className="qt-result-prices">
                  Entry ${result.entryPrice.toLocaleString(undefined,{minimumFractionDigits:2})} → Exit ${result.exitPrice.toLocaleString(undefined,{minimumFractionDigits:2})}
                </div>
              </div>
            </div>
          )}

          {/* CTA button */}
          <button
            className={`qt-cta-btn ${direction === 'BUY' ? 'up' : 'down'}`}
            onClick={handleTrade}
            disabled={!!active || placing || !amount || parseFloat(amount) < 1}>
            {active
              ? <><span className="qt-cta-spinner"/> Trading… {timeLeft}s</>
              : placing
                ? 'Placing…'
                : `⚡ Trade ${direction === 'BUY' ? '▲ UP' : '▼ DOWN'} · ${symbol.replace('USDT','')}`
            }
          </button>

          <p className="qt-disclaimer">30-second trade · Minimum $1 USDT · 20% profit on win</p>
        </div>

        {/* ── RIGHT: History ── */}
        <div className="qt-history-card">
          <div className="qt-history-head">
            <h3>Trade History</h3>
            <span className="qt-history-count">{history.length} trades</span>
          </div>

          {history.length === 0 ? (
            <div className="qt-history-empty">No trades yet. Place your first trade!</div>
          ) : (
            <>
              {/* Stats row */}
              <div className="qt-stats-row">
                <div className="qt-stat-box">
                  <span>Total Trades</span>
                  <b>{history.length}</b>
                </div>
                <div className="qt-stat-box">
                  <span>Won</span>
                  <b style={{color:'#10B981'}}>{history.filter(t=>t.status==='won').length}</b>
                </div>
                <div className="qt-stat-box">
                  <span>Total Profit</span>
                  <b style={{color:'var(--brass)'}}>
                    ${history.filter(t=>t.status==='won').reduce((s,t)=>s+parseFloat(t.profit||0),0).toFixed(2)}
                  </b>
                </div>
              </div>

              <div className="qt-history-list">
                {history.map(t => (
                  <div key={t.id} className={`qt-history-item ${t.status}`}>
                    <div className="qt-h-left">
                      <CryptoIcon symbol={t.symbol.replace('USDT','')} size={24} />
                      <div>
                        <div className="qt-h-pair">{t.symbol.replace('USDT','/USDT')}</div>
                        <div className="qt-h-time">{new Date(t.created_at).toLocaleString()}</div>
                      </div>
                    </div>
                    <div className="qt-h-mid">
                      <span className={`qt-h-dir ${t.direction === 'BUY' ? 'up' : 'down'}`}>
                        {t.direction === 'BUY' ? '▲ UP' : '▼ DOWN'}
                      </span>
                      <span className="qt-h-amount">${parseFloat(t.amount).toFixed(2)}</span>
                    </div>
                    <div className={`qt-h-result ${t.status}`}>
                      {t.status === 'won'
                        ? `+$${parseFloat(t.profit).toFixed(2)}`
                        : t.status === 'open'
                          ? '⏳'
                          : `-$${parseFloat(t.amount).toFixed(2)}`}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

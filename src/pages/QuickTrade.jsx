import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import { wsService } from '../services/websocket';
import CryptoIcon from '../components/CryptoIcon';
import './QuickTrade.css';

const PAIRS = ['BTCUSDT','ETHUSDT','SOLUSDT','BNBUSDT','XRPUSDT','DOGEUSDT','ADAUSDT','LTCUSDT','AVAXUSDT','LINKUSDT','MATICUSDT','DOTUSDT','TRXUSDT','UNIUSDT','ATOMUSDT'];

const CYCLE_OPTIONS = [
  { duration: 30, profit: 0.20, label: '30s' },
  { duration: 60, profit: 0.25, label: '60s' },
  { duration: 120, profit: 0.35, label: '120s' },
  { duration: 3600, profit: 0.45, label: '1hr' },
  { duration: 86400, profit: 0.60, label: '24hr' },
  { duration: 604800, profit: 0.70, label: '7d' },
  { duration: 2592000, profit: 0.80, label: '30d' },
];

const DEFAULT_CYCLE = CYCLE_OPTIONS[0];
const QUICK_AMOUNTS = [10, 25, 50, 100, 250, 500];

export default function QuickTrade() {
  const { token } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const symbol = (searchParams.get('symbol') || 'BTCUSDT').toUpperCase();

  const [livePrice, setLivePrice] = useState(0);
  const [balanceUSDT, setBalanceUSDT] = useState(0);
  const [direction, setDirection] = useState('BUY');
  const [amount, setAmount] = useState('');
  const [cycle, setCycle] = useState(DEFAULT_CYCLE);
  const [placing, setPlacing] = useState(false);
  const [active, setActive] = useState(null);
  const [timeLeft, setTimeLeft] = useState(DEFAULT_CYCLE.duration);
  const [result, setResult] = useState(null);
  const [history, setHistory] = useState([]);
  const [toast, setToast] = useState(null);
  const timerRef = useRef(null);
  const [selectedTrade, setSelectedTrade] = useState(null);

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

  const profit = parseFloat(amount || 0) * cycle.profit;
  const payout = parseFloat(amount || 0) + profit;

  const handleTrade = async () => {
    const amt = parseFloat(amount);
    if (isNaN(amt) || amt < 1) { showToast('error', 'Minimum $1 USDT'); return; }
    if (amt > balanceUSDT) { showToast('error', 'Insufficient USDT balance'); return; }
    setPlacing(true);
    setResult(null);
    try {
      const res = await api.placeQuickTrade(token, { symbol, direction, amount: amt, cycle: cycle.label });
      if (res.error) {
        showToast('error', res.error);
        return;
      }
      setActive(res);
      setTimeLeft(cycle.duration);
      loadData();

      let t = cycle.duration;
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
                exitPrice: parseFloat(r.trade.exit_price),
                amount:     parseFloat(r.trade.amount),
                direction:  direction,
                handlingFee: parseFloat(r.trade.handling_fee || 0),
                cycle:      r.trade.cycle,
                cycleDuration: r.trade.cycle_duration,
                cycleProfit: r.trade.cycle_profit,
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
  const arcOffset = circ - (circ * (cycle.duration - timeLeft) / cycle.duration);

  return (
    <div className="qt-page">
      {toast && <div className={`qt-toast ${toast.type}`}>{toast.msg}</div>}

      {/* Header */}
      <div className="qt-page-header">
        <div>
          <h1 className="qt-page-title">⚡ Quick Trade</h1>
        <p className="qt-page-sub">Predict UP or DOWN in <b>{cycle.label}</b> and earn <b>+{(cycle.profit * 100).toFixed(0)}% profit</b></p>
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

          {/* Cycle Selection */}
          <div className="qt-cycle-section">
            <label className="qt-label">Cycle</label>
            <div className="qt-cycle-grid">
              {CYCLE_OPTIONS.map(c => (
                <button
                  key={c.label}
                  type="button"
                  className={`qt-cycle-btn ${cycle.label === c.label ? 'active' : ''}`}
                  onClick={() => setCycle(c)}
                  disabled={!!active}>
                  <span className="qt-cycle-label">{c.label}</span>
                  <span className="qt-cycle-profit">+{(c.profit * 100).toFixed(0)}%</span>
                </button>
              ))}
            </div>
          </div>

          {/* Amount input */}
          <div className="qt-amount-section">
            <label className="qt-label">Trade Amount (USD)</label>
            <div className="qt-amount-input-wrap">
              <span className="qt-currency">$</span>
              <input
                type="number" min="1" step="1" placeholder="0"
                value={amount} onChange={e => setAmount(e.target.value)}
                disabled={!!active} className="qt-amount-input" />
              <span className="qt-currency-label">USD</span>
            </div>
            {parseFloat(amount) > 0 && livePrice > 0 && (
              <div className="qt-coin-value">
                ≈ {(parseFloat(amount) / livePrice).toFixed(6)} {baseAsset}
              </div>
            )}
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
                <span>Profit (+{(cycle.profit * 100).toFixed(0)}%)</span>
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
                <div className="qt-result-details">
                  <div className="qt-result-detail-row">
                    <span className="qt-detail-label">Direction</span>
                    <span className={`qt-detail-value ${result.direction === 'BUY' ? 'up' : 'down'}`}>
                      {result.direction === 'BUY' ? '▲ Buy Long' : '▼ Sell Short'}
                    </span>
                  </div>
                  <div className="qt-result-detail-row">
                    <span className="qt-detail-label">Amount Traded</span>
                    <span className="qt-detail-value">
                      <CryptoIcon symbol="USDT" size={16} /> ${parseFloat(result.amount || 0).toFixed(2)}
                    </span>
                  </div>
                  <div className="qt-result-detail-row">
                    <span className="qt-detail-label">Open Price</span>
                    <span className="qt-detail-value mono">${result.entryPrice.toLocaleString(undefined,{minimumFractionDigits:2})}</span>
                  </div>
                  <div className="qt-result-detail-row">
                    <span className="qt-detail-label">Close Price</span>
                    <span className="qt-detail-value mono">${result.exitPrice.toLocaleString(undefined,{minimumFractionDigits:2})}</span>
                  </div>
                </div>
                <div className="qt-result-icons">
                  <CryptoIcon symbol="BTC" size={20} />
                  <CryptoIcon symbol="ETH" size={20} />
                  <CryptoIcon symbol="USDT" size={20} />
                </div>
              </div>
            </div>
          )}

          {/* Daily limit locked state */}
          {false && !active && (
            <div className="qt-locked-card">
              <div className="qt-locked-icon">🔒</div>
              <div className="qt-locked-body">
                <div className="qt-locked-title">Daily trade used</div>
                <div className="qt-locked-sub">Your next trade unlocks in</div>
                <div className="qt-locked-countdown">{timeUntilNext || '—'}</div>
                <div className="qt-locked-hint">One free trade resets every day at midnight UTC</div>
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

          <p className="qt-disclaimer">Quick trade · Minimum $1 USDT · 0.1% handling fee</p>
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
                  <div key={t.id} className={`qt-history-item ${t.status}`} onClick={() => setSelectedTrade(t)}>
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

      {/* Trade Details Modal */}
      {selectedTrade && (
        <div className="qt-modal-overlay" onClick={() => setSelectedTrade(null)}>
          <div className="qt-modal-card" onClick={e => e.stopPropagation()}>
            <div className="qt-modal-header">
              <h3>Trade Details</h3>
              <button className="qt-modal-close" onClick={() => setSelectedTrade(null)}>×</button>
            </div>
            <div className="qt-modal-body">
              <div className="qt-modal-row">
                <span className="qt-modal-label">Product</span>
                <span className="qt-modal-value">{selectedTrade.symbol.replace('USDT','/USDT')}</span>
              </div>
              <div className="qt-modal-row">
                <span className="qt-modal-label">Direction</span>
                <span className={`qt-modal-value ${selectedTrade.direction === 'BUY' ? 'up' : 'down'}`}>
                  {selectedTrade.direction === 'BUY' ? '▲ UP' : '▼ DOWN'}
                </span>
              </div>
              <div className="qt-modal-row">
                <span className="qt-modal-label">Cycle</span>
                <span className="qt-modal-value">{selectedTrade.cycle} ({selectedTrade.cycle_duration}s)</span>
              </div>
              <div className="qt-modal-row">
                <span className="qt-modal-label">Cycle Profit Rate</span>
                <span className="qt-modal-value">+{(selectedTrade.cycle_profit * 100).toFixed(0)}%</span>
              </div>
              <div className="qt-modal-divider" />
              <div className="qt-modal-row">
                <span className="qt-modal-label">Time to Open</span>
                <span className="qt-modal-value">{new Date(selectedTrade.created_at).toLocaleString()}</span>
              </div>
              <div className="qt-modal-row">
                <span className="qt-modal-label">Time to Close</span>
                <span className="qt-modal-value">{selectedTrade.settled_at ? new Date(selectedTrade.settled_at).toLocaleString() : '—'}</span>
              </div>
              <div className="qt-modal-divider" />
              <div className="qt-modal-row">
                <span className="qt-modal-label">Open Price</span>
                <span className="qt-modal-value mono">${parseFloat(selectedTrade.entry_price).toLocaleString(undefined,{minimumFractionDigits:2})}</span>
              </div>
              <div className="qt-modal-row">
                <span className="qt-modal-label">Close Price</span>
                <span className="qt-modal-value mono">{selectedTrade.exit_price ? `$${parseFloat(selectedTrade.exit_price).toLocaleString(undefined,{minimumFractionDigits:2})}` : '—'}</span>
              </div>
              <div className="qt-modal-divider" />
              <div className="qt-modal-row">
                <span className="qt-modal-label">Amount</span>
                <span className="qt-modal-value mono">${parseFloat(selectedTrade.amount).toFixed(2)}</span>
              </div>
              <div className="qt-modal-row">
                <span className="qt-modal-label">Profit/Loss</span>
                <span className={`qt-modal-value ${selectedTrade.status === 'won' ? 'pos' : 'neg'}`}>
                  {selectedTrade.status === 'won' ? `+$${parseFloat(selectedTrade.profit).toFixed(2)}` : selectedTrade.status === 'lost' ? `-$${parseFloat(selectedTrade.amount).toFixed(2)}` : '—'}
                </span>
              </div>
              <div className="qt-modal-row">
                <span className="qt-modal-label">Handling Fee</span>
                <span className="qt-modal-value mono">${parseFloat(selectedTrade.handling_fee || 0).toFixed(2)}</span>
              </div>
              <div className="qt-modal-row">
                <span className="qt-modal-label">Account Type</span>
                <span className="qt-modal-value">Real Account</span>
              </div>
              <div className="qt-modal-row">
                <span className="qt-modal-label">Status</span>
                <span className={`qt-modal-value ${selectedTrade.status}`}>
                  {selectedTrade.status.toUpperCase()}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

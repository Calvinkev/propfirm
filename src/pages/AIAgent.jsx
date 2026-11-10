import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import { wsService } from '../services/websocket';
import { useAgentActions } from '../hooks/useAgentActions';
import CryptoIcon from '../components/CryptoIcon';
import './AIAgent.css';

const PAIRS = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'XRPUSDT', 'DOGEUSDT', 'ADAUSDT'];
const STRATEGIES = [
  { value: 'combined',  label: 'Combined (RSI + MACD + BB + EMA)',  desc: 'Uses all indicators together for the strongest signal' },
  { value: 'rsi',       label: 'RSI Only',                           desc: 'Buy when oversold, sell when overbought' },
  { value: 'macd',      label: 'MACD Only',                          desc: 'Follow momentum crossovers' },
  { value: 'bb',        label: 'Bollinger Bands',                    desc: 'Mean-reversion at band extremes' },
  { value: 'ema_cross', label: 'EMA Cross',                          desc: 'Fast/slow EMA crossover signals' },
];

const defaultForm = {
  name:           '',
  symbol:         'BTCUSDT',
  strategy:       'combined',
  auto_execute:   false,
  trade_amount:   10,
  rsi_oversold:   30,
  rsi_overbought: 70,
  ema_fast:       9,
  ema_slow:       21,
};

export default function AIAgent() {
  const { token } = useAuth();

  // ── State ──────────────────────────────────────────────────────────────────
  const [bots, setBots]             = useState([]);
  const [signals, setSignals]       = useState([]);
  const [liveSignals, setLive]      = useState([]);          // WS push signals
  const [selectedBot, setSelected]  = useState(null);        // detail view
  const [botDetail, setBotDetail]   = useState(null);        // { bot, logs, signals }
  const [analysis, setAnalysis]     = useState(null);        // on-demand result
  const [analysisLoading, setALoad] = useState(false);

  const [activeTab, setTab]         = useState('bots');      // bots | signals | analyse
  const [showCreate, setCreate]     = useState(false);
  const [editingBot, setEditing]    = useState(null);
  const [form, setForm]             = useState(defaultForm);
  const [formLoading, setFLoad]     = useState(false);
  const [toast, setToast]           = useState(null);

  const [analyseSymbol, setASymbol] = useState('BTCUSDT');
  const [analyseStrategy, setAStrat]= useState('combined');
  const [analyseParams, setAParams] = useState({ rsi_oversold: 30, rsi_overbought: 70, ema_fast: 9, ema_slow: 21 });

  // ── Chat state ─────────────────────────────────────────────────────────────
  const [chatMessages, setChatMessages] = useState([
    { role: 'assistant', content: 'Hi! I\'m StakeUp AI, your crypto trading assistant. Ask me anything about strategies, market conditions, or how to configure your bots.' }
  ]);
  const [chatInput, setChatInput]       = useState('');
  const [chatSymbol, setChatSymbol]     = useState('BTCUSDT');
  const [chatLoading, setChatLoading]   = useState(false);
  const chatEndRef                      = useRef(null);

  // ── Agent page action dispatcher (called by useAgentActions hook) ──────────
  const dispatchAgentPageAction = useCallback((action) => {
    switch (action.type) {
      case 'switch_tab':
        setTab(action.tab || 'chat');
        setSelected(null);
        setBotDetail(null);
        break;

      case 'run_analysis':
        setTab('analyse');
        setSelected(null);
        setBotDetail(null);
        if (action.symbol)   setASymbol(action.symbol.toUpperCase());
        if (action.strategy) setAStrat(action.strategy);
        if (action.params)   setAParams(p => ({ ...p, ...action.params }));
        // Auto-trigger after a short delay so state has settled
        setTimeout(() => {
          setALoad(true);
          setAnalysis(null);
          const sym  = action.symbol?.toUpperCase() || analyseSymbol;
          const strat = action.strategy || analyseStrategy;
          const params = { ...analyseParams, ...(action.params || {}) };
          api.analyseAI(token, sym, { strategy: strat, ...params })
            .then(res => {
              if (res.analysis) setAnalysis(res.analysis);
              else showToast('error', res.error || 'Analysis failed');
            })
            .catch(() => showToast('error', 'Analysis failed'))
            .finally(() => setALoad(false));
        }, 200);
        break;

      case 'open_create_bot': {
        const pf = action.prefill || {};
        const cond = pf.conditions || {};
        setForm({
          name:           pf.name           || '',
          symbol:         pf.symbol?.toUpperCase() || 'BTCUSDT',
          strategy:       pf.strategy       || 'combined',
          auto_execute:   !!pf.auto_execute,
          trade_amount:   pf.trade_amount   || 10,
          rsi_oversold:   cond.rsi_oversold  || 30,
          rsi_overbought: cond.rsi_overbought|| 70,
          ema_fast:       cond.ema_fast      || 9,
          ema_slow:       cond.ema_slow      || 21,
        });
        setEditing(null);
        setCreate(true);
        setTab('bots');
        break;
      }

      default:
        break;
    }
  }, [token, analyseSymbol, analyseStrategy, analyseParams]);

  // ── Agent actions hook ─────────────────────────────────────────────────────
  const { execute: executeAgentActions } = useAgentActions(dispatchAgentPageAction);

  // ── Helpers ────────────────────────────────────────────────────────────────
  const showToast = (type, msg) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 4000);
  };

  // ── Data loading ───────────────────────────────────────────────────────────
  const loadBots = async () => {
    const res = await api.getAIBots(token);
    if (res.bots) setBots(res.bots);
  };

  const loadSignals = async () => {
    const res = await api.getAISignals(token, { limit: 50 });
    if (res.signals) setSignals(res.signals);
  };

  const loadBotDetail = async (botId) => {
    const res = await api.getAIBot(token, botId);
    if (res.bot) setBotDetail(res);
  };

  useEffect(() => {
    loadBots();
    loadSignals();
  }, [token]);

  // ── WebSocket live signals ─────────────────────────────────────────────────
  useEffect(() => {
    if (!wsService.isConnected) wsService.connect(token);

    const handleSignal = (data) => {
      if (data.type === 'ai_signal' || data.type === 'ai_trade_executed') {
        setLive(prev => [{ ...data, id: Date.now(), ts: new Date().toISOString() }, ...prev.slice(0, 19)]);
        if (data.type === 'ai_trade_executed') {
          showToast('success', `🤖 ${data.botName}: Auto-executed ${data.action} ${data.symbol} @ $${parseFloat(data.price).toFixed(2)}`);
        }
        // Refresh lists
        loadBots();
        loadSignals();
        if (selectedBot) loadBotDetail(selectedBot);
      }
    };

    wsService.on('ai_signal', handleSignal);
    wsService.on('ai_trade_executed', handleSignal);
    return () => {
      wsService.off('ai_signal', handleSignal);
      wsService.off('ai_trade_executed', handleSignal);
    };
  }, [token, selectedBot]);

  // ── Create / Edit bot ──────────────────────────────────────────────────────
  const openCreate = () => {
    setForm(defaultForm);
    setEditing(null);
    setCreate(true);
  };

  const openEdit = (bot) => {
    const cond = typeof bot.conditions === 'string' ? JSON.parse(bot.conditions) : (bot.conditions || {});
    setForm({
      name:           bot.name,
      symbol:         bot.symbol,
      strategy:       bot.strategy,
      auto_execute:   !!bot.auto_execute,
      trade_amount:   bot.trade_amount,
      rsi_oversold:   cond.rsi_oversold   || 30,
      rsi_overbought: cond.rsi_overbought || 70,
      ema_fast:       cond.ema_fast       || 9,
      ema_slow:       cond.ema_slow       || 21,
    });
    setEditing(bot);
    setCreate(true);
  };

  const handleFormSubmit = async (e) => {
    e.preventDefault();
    setFLoad(true);
    try {
      const payload = {
        name:         form.name,
        symbol:       form.symbol,
        strategy:     form.strategy,
        auto_execute: form.auto_execute,
        trade_amount: form.trade_amount,
        conditions: {
          strategy:       form.strategy,
          rsi_oversold:   parseInt(form.rsi_oversold),
          rsi_overbought: parseInt(form.rsi_overbought),
          ema_fast:       parseInt(form.ema_fast),
          ema_slow:       parseInt(form.ema_slow),
        },
      };
      let res;
      if (editingBot) {
        res = await api.updateAIBot(token, editingBot.id, payload);
      } else {
        res = await api.createAIBot(token, payload);
      }
      if (res.error) {
        showToast('error', res.error);
      } else {
        showToast('success', editingBot ? 'Bot updated' : 'Bot created successfully');
        setCreate(false);
        loadBots();
      }
    } catch (err) {
      showToast('error', 'Failed to save bot');
    } finally {
      setFLoad(false);
    }
  };

  // ── Toggle bot ─────────────────────────────────────────────────────────────
  const handleToggle = async (bot) => {
    const res = await api.toggleAIBot(token, bot.id);
    if (res.status) {
      showToast('success', `Bot ${res.status}`);
      loadBots();
    }
  };

  // ── Delete bot ─────────────────────────────────────────────────────────────
  const handleDelete = async (botId) => {
    if (!window.confirm('Delete this bot? All its logs will be removed.')) return;
    const res = await api.deleteAIBot(token, botId);
    if (res.message) {
      showToast('success', 'Bot deleted');
      if (selectedBot === botId) { setSelected(null); setBotDetail(null); }
      loadBots();
    }
  };

  // ── On-demand analysis ─────────────────────────────────────────────────────
  const handleAnalyse = async () => {
    setALoad(true);
    setAnalysis(null);
    try {
      const res = await api.analyseAI(token, analyseSymbol, {
        strategy: analyseStrategy,
        ...analyseParams,
      });
      if (res.analysis) setAnalysis(res.analysis);
      else showToast('error', res.error || 'Analysis failed');
    } catch {
      showToast('error', 'Analysis failed');
    } finally {
      setALoad(false);
    }
  };

  // ── Chat send ──────────────────────────────────────────────────────────────
  const handleChatSend = async (e) => {
    e?.preventDefault();
    const text = chatInput.trim();
    if (!text || chatLoading) return;

    const userMsg = { role: 'user', content: text };
    const updatedMessages = [...chatMessages, userMsg];
    setChatMessages(updatedMessages);
    setChatInput('');
    setChatLoading(true);

    try {
      // Send only user/assistant messages (skip the initial assistant greeting for API)
      const apiMessages = updatedMessages.filter(m => m.role === 'user' || (m.role === 'assistant' && m.content !== updatedMessages[0].content));
      const res = await api.chatAI(token, apiMessages.slice(-20), chatSymbol);
      const reply = res.reply || 'Sorry, I could not generate a response.';
      setChatMessages(prev => [...prev, { role: 'assistant', content: reply, actions: res.actions || [] }]);

      // Execute any UI actions the agent returned
      if (res.actions?.length) {
        executeAgentActions(res.actions);
      }
    } catch {
      setChatMessages(prev => [...prev, { role: 'assistant', content: 'The AI assistant is temporarily unavailable. Please try again.' }]);
    } finally {
      setChatLoading(false);
    }
  };

  // Auto-scroll chat to bottom
  useEffect(() => {
    if (activeTab === 'chat') {
      chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [chatMessages, activeTab]);

  // ── Bot detail view ────────────────────────────────────────────────────────
  const handleSelectBot = (bot) => {
    setSelected(bot.id);
    loadBotDetail(bot.id);
    setTab('bots');
  };

  // ── Render helpers ─────────────────────────────────────────────────────────
  const actionBadge = (action) => {
    const cls = action === 'BUY' ? 'badge-buy' : action === 'SELL' ? 'badge-sell' : 'badge-hold';
    return <span className={`ai-badge ${cls}`}>{action}</span>;
  };

  const confidenceBar = (pct) => (
    <div className="confidence-bar-wrap">
      <div className="confidence-bar" style={{ width: `${pct}%`, background: pct >= 70 ? '#10B981' : pct >= 40 ? '#F59E0B' : '#6B7280' }} />
      <span className="confidence-label">{pct}%</span>
    </div>
  );

  const formatIndicators = (ind) => {
    if (!ind) return null;
    const raw = typeof ind === 'string' ? JSON.parse(ind) : ind;
    return (
      <div className="indicator-grid">
        {raw.rsi !== null && raw.rsi !== undefined && (
          <div className="ind-item"><span className="ind-label">RSI</span><span className="ind-val">{raw.rsi}</span></div>
        )}
        {raw.macd && (
          <>
            <div className="ind-item"><span className="ind-label">MACD</span><span className="ind-val">{raw.macd.macd}</span></div>
            <div className="ind-item"><span className="ind-label">MACD Hist</span><span className={`ind-val ${raw.macd.histogram > 0 ? 'pos' : 'neg'}`}>{raw.macd.histogram}</span></div>
          </>
        )}
        {raw.bb && (
          <>
            <div className="ind-item"><span className="ind-label">BB Upper</span><span className="ind-val">{parseFloat(raw.bb.upper).toFixed(4)}</span></div>
            <div className="ind-item"><span className="ind-label">BB Lower</span><span className="ind-val">{parseFloat(raw.bb.lower).toFixed(4)}</span></div>
          </>
        )}
        {raw.ema_fast && <div className="ind-item"><span className="ind-label">EMA Fast</span><span className="ind-val">{parseFloat(raw.ema_fast).toFixed(4)}</span></div>}
        {raw.ema_slow && <div className="ind-item"><span className="ind-label">EMA Slow</span><span className="ind-val">{parseFloat(raw.ema_slow).toFixed(4)}</span></div>}
        {raw.current_price && <div className="ind-item"><span className="ind-label">Price</span><span className="ind-val gold">${parseFloat(raw.current_price).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span></div>}
      </div>
    );
  };

  // ══════════════════════════════════════════════════════════════════════════
  return (
    <div className="ai-agent-page">
      {toast && <div className={`ai-toast ${toast.type}`}>{toast.msg}</div>}

      {/* ── Header ── */}
      <div className="ai-header">
        <div className="ai-header-left">
          <div className="ai-header-icon">🤖</div>
          <div>
            <h1 className="ai-title">AI Trading Agent</h1>
            <p className="ai-subtitle">Technical analysis, chart signals &amp; automated trade execution</p>
          </div>
        </div>
        <button className="ai-create-btn" onClick={openCreate}>+ New Bot</button>
      </div>

      {/* ── Live signal feed (top strip) ── */}
      {liveSignals.length > 0 && (
        <div className="live-feed">
          <span className="live-feed-label">🔴 LIVE</span>
          {liveSignals.slice(0, 5).map(s => (
            <span key={s.id} className="live-feed-item">
              {s.botName && <b>{s.botName}</b>} {actionBadge(s.action || s.type === 'ai_trade_executed' ? s.action : 'SIGNAL')} {s.symbol} {s.confidence ? `${s.confidence}%` : ''}
            </span>
          ))}
        </div>
      )}

      {/* ── Tabs ── */}
      <div className="ai-tabs">
        {[
          { key: 'bots',    label: `My Bots (${bots.length})` },
          { key: 'signals', label: `Signals (${signals.length})` },
          { key: 'analyse', label: '🔍 Analyse Chart' },
          { key: 'chat',    label: '💬 AI Chat' },
        ].map(t => (
          <button
            key={t.key}
            className={`ai-tab ${activeTab === t.key ? 'active' : ''}`}
            onClick={() => { setTab(t.key); setSelected(null); setBotDetail(null); }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ════════════════════════════════════════════════
          TAB: BOTS
      ════════════════════════════════════════════════ */}
      {activeTab === 'bots' && !selectedBot && (
        <div className="bots-grid">
          {bots.length === 0 && (
            <div className="ai-empty">
              <div className="ai-empty-icon">🤖</div>
              <p>No bots yet. Create your first AI trading bot.</p>
              <button className="ai-create-btn" onClick={openCreate}>Create Bot</button>
            </div>
          )}
          {bots.map(bot => {
            const cond = typeof bot.conditions === 'string' ? JSON.parse(bot.conditions) : (bot.conditions || {});
            return (
              <div key={bot.id} className={`bot-card ${bot.status}`}>
                <div className="bot-card-header">
                  <div className="bot-card-title-row">
                    <CryptoIcon symbol={bot.symbol.replace('USDT', '')} size={28} />
                    <div>
                      <div className="bot-name">{bot.name}</div>
                      <div className="bot-pair">{bot.symbol.replace('USDT', '/USDT')}</div>
                    </div>
                  </div>
                  <span className={`bot-status-badge ${bot.status}`}>
                    {bot.status === 'active' ? '● Active' : '⏸ Paused'}
                  </span>
                </div>

                <div className="bot-meta-row">
                  <div className="bot-meta-item">
                    <span className="meta-label">Strategy</span>
                    <span className="meta-val">{STRATEGIES.find(s => s.value === bot.strategy)?.label || bot.strategy}</span>
                  </div>
                  <div className="bot-meta-item">
                    <span className="meta-label">Auto-Execute</span>
                    <span className={`meta-val ${bot.auto_execute ? 'pos' : 'muted'}`}>
                      {bot.auto_execute ? '✅ On' : '○ Off'}
                    </span>
                  </div>
                  <div className="bot-meta-item">
                    <span className="meta-label">Trade Size</span>
                    <span className="meta-val">${parseFloat(bot.trade_amount).toFixed(2)}</span>
                  </div>
                  <div className="bot-meta-item">
                    <span className="meta-label">Total Trades</span>
                    <span className="meta-val">{bot.total_trades}</span>
                  </div>
                </div>

                {bot.last_signal_at && (
                  <div className="bot-last-signal">
                    Last signal: {new Date(bot.last_signal_at).toLocaleString()}
                  </div>
                )}

                <div className="bot-actions">
                  <button className="bot-action-btn detail" onClick={() => handleSelectBot(bot)}>Details</button>
                  <button className="bot-action-btn edit" onClick={() => openEdit(bot)}>Edit</button>
                  <button
                    className={`bot-action-btn toggle ${bot.status === 'active' ? 'pause' : 'resume'}`}
                    onClick={() => handleToggle(bot)}
                  >
                    {bot.status === 'active' ? '⏸ Pause' : '▶ Resume'}
                  </button>
                  <button className="bot-action-btn delete" onClick={() => handleDelete(bot.id)}>Delete</button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Bot detail view ── */}
      {activeTab === 'bots' && selectedBot && botDetail && (
        <div className="bot-detail">
          <button className="back-btn" onClick={() => { setSelected(null); setBotDetail(null); }}>← Back to Bots</button>

          <div className="detail-header">
            <CryptoIcon symbol={botDetail.bot.symbol.replace('USDT', '')} size={36} />
            <div>
              <h2>{botDetail.bot.name}</h2>
              <span className={`bot-status-badge ${botDetail.bot.status}`}>
                {botDetail.bot.status === 'active' ? '● Active' : '⏸ Paused'}
              </span>
            </div>
          </div>

          <div className="detail-stats">
            <div className="dstat"><span>Symbol</span><b>{botDetail.bot.symbol}</b></div>
            <div className="dstat"><span>Strategy</span><b>{botDetail.bot.strategy}</b></div>
            <div className="dstat"><span>Auto-Execute</span><b className={botDetail.bot.auto_execute ? 'pos' : 'muted'}>{botDetail.bot.auto_execute ? 'Enabled' : 'Disabled'}</b></div>
            <div className="dstat"><span>Trade Size</span><b>${parseFloat(botDetail.bot.trade_amount).toFixed(2)}</b></div>
            <div className="dstat"><span>Total Trades</span><b>{botDetail.bot.total_trades}</b></div>
          </div>

          <div className="detail-two-col">
            {/* Recent Signals */}
            <div className="detail-section">
              <h3>Recent Signals</h3>
              {botDetail.signals.length === 0 && <p className="muted-msg">No signals yet — bot polls every 15 s</p>}
              {botDetail.signals.map(s => (
                <div key={s.id} className="signal-row">
                  <div className="signal-row-top">
                    {actionBadge(s.action)}
                    {confidenceBar(s.confidence)}
                    <span className="signal-time">{new Date(s.created_at).toLocaleTimeString()}</span>
                    {s.executed ? <span className="exec-badge">Executed</span> : null}
                  </div>
                  <div className="signal-reason">{s.reason}</div>
                  {formatIndicators(s.indicators)}
                </div>
              ))}
            </div>

            {/* Bot Logs */}
            <div className="detail-section">
              <h3>Activity Log</h3>
              {botDetail.logs.length === 0 && <p className="muted-msg">No logs yet</p>}
              <div className="log-list">
                {botDetail.logs.map(l => (
                  <div key={l.id} className={`log-item ${l.level}`}>
                    <span className="log-time">{new Date(l.created_at).toLocaleString()}</span>
                    <span className="log-msg">{l.message}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════
          TAB: SIGNALS
      ════════════════════════════════════════════════ */}
      {activeTab === 'signals' && (
        <div className="signals-section">
          <div className="signals-table-wrap">
            <table className="ai-table">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Bot</th>
                  <th>Symbol</th>
                  <th>Signal</th>
                  <th>Confidence</th>
                  <th>Executed</th>
                  <th>Reason</th>
                </tr>
              </thead>
              <tbody>
                {signals.length === 0 && (
                  <tr><td colSpan="7" className="empty-msg">No signals yet. Create a bot or run an analysis.</td></tr>
                )}
                {signals.map(s => (
                  <tr key={s.id}>
                    <td className="mono">{new Date(s.created_at).toLocaleString()}</td>
                    <td>{s.bot_name || <span className="muted">Manual</span>}</td>
                    <td><CryptoIcon symbol={s.symbol.replace('USDT', '')} size={16} /> {s.symbol}</td>
                    <td>{actionBadge(s.action)}</td>
                    <td>{confidenceBar(s.confidence)}</td>
                    <td>{s.executed ? <span className="exec-badge">✅ Yes</span> : <span className="muted">—</span>}</td>
                    <td className="reason-col">{s.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════
          TAB: ANALYSE
      ════════════════════════════════════════════════ */}
      {activeTab === 'analyse' && (
        <div className="analyse-section">
          <div className="analyse-controls">
            <div className="analyse-form-row">
              <div className="analyse-field">
                <label>Trading Pair</label>
                <select value={analyseSymbol} onChange={e => setASymbol(e.target.value)}>
                  {PAIRS.map(p => <option key={p} value={p}>{p.replace('USDT', '/USDT')}</option>)}
                </select>
              </div>
              <div className="analyse-field">
                <label>Strategy</label>
                <select value={analyseStrategy} onChange={e => setAStrat(e.target.value)}>
                  {STRATEGIES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </div>
            </div>

            <div className="analyse-params">
              <div className="analyse-field small">
                <label>RSI Oversold</label>
                <input type="number" min="10" max="45" value={analyseParams.rsi_oversold}
                  onChange={e => setAParams(p => ({ ...p, rsi_oversold: parseInt(e.target.value) }))} />
              </div>
              <div className="analyse-field small">
                <label>RSI Overbought</label>
                <input type="number" min="55" max="90" value={analyseParams.rsi_overbought}
                  onChange={e => setAParams(p => ({ ...p, rsi_overbought: parseInt(e.target.value) }))} />
              </div>
              <div className="analyse-field small">
                <label>EMA Fast</label>
                <input type="number" min="3" max="50" value={analyseParams.ema_fast}
                  onChange={e => setAParams(p => ({ ...p, ema_fast: parseInt(e.target.value) }))} />
              </div>
              <div className="analyse-field small">
                <label>EMA Slow</label>
                <input type="number" min="10" max="200" value={analyseParams.ema_slow}
                  onChange={e => setAParams(p => ({ ...p, ema_slow: parseInt(e.target.value) }))} />
              </div>
            </div>

            <button className="analyse-btn" onClick={handleAnalyse} disabled={analysisLoading}>
              {analysisLoading ? '⏳ Analysing…' : '🔍 Run Analysis'}
            </button>
          </div>

          {analysis && (
            <div className={`analysis-result ${analysis.action.toLowerCase()}`}>
              <div className="result-headline">
                <div className="result-action-block">
                  <span className="result-action-label">Signal</span>
                  {actionBadge(analysis.action)}
                </div>
                <div className="result-confidence-block">
                  <span className="result-action-label">Confidence</span>
                  {confidenceBar(analysis.confidence)}
                </div>
              </div>

              <div className="result-reason">
                <span className="result-reason-label">Reason:</span> {analysis.reason}
              </div>

              <div className="result-indicators-section">
                <h4>Indicator Values</h4>
                {formatIndicators(analysis.indicators)}
              </div>

              <div className="result-strategy-box">
                <span className="strat-label">Strategy used:</span>
                <span className="strat-val">{STRATEGIES.find(s => s.value === analyseStrategy)?.label}</span>
              </div>
            </div>
          )}

          {!analysis && !analysisLoading && (
            <div className="analyse-placeholder">
              <div className="analyse-ph-icon">📊</div>
              <p>Select a pair and strategy, then click <strong>Run Analysis</strong> to get AI-powered chart signals based on live price data.</p>
            </div>
          )}
        </div>
      )}

      {/* ════════════════════════════════════════════════
          TAB: CHAT
      ════════════════════════════════════════════════ */}
      {activeTab === 'chat' && (
        <div className="chat-section">
          {/* Symbol context selector */}
          <div className="chat-context-bar">
            <span className="chat-context-label">Context:</span>
            <select
              value={chatSymbol}
              onChange={e => setChatSymbol(e.target.value)}
              className="chat-symbol-select"
            >
              {PAIRS.map(p => <option key={p} value={p}>{p.replace('USDT', '/USDT')}</option>)}
            </select>
            <span className="chat-context-hint">Live price + recent signals for this pair will be included in every message.</span>
          </div>

          {/* Messages */}
          <div className="chat-messages">
            {chatMessages.map((msg, i) => (
              <div key={i} className={`chat-msg chat-msg-${msg.role}`}>
                <div className="chat-msg-avatar">
                  {msg.role === 'assistant' ? '🤖' : '👤'}
                </div>
                <div className="chat-msg-bubble">
                  {msg.content.split('\n').map((line, j) => (
                    <span key={j}>{line}{j < msg.content.split('\n').length - 1 && <br />}</span>
                  ))}
                  {/* Action pills — shown when the message triggered UI actions */}
                  {msg.actions?.length > 0 && (
                    <div className="chat-action-pills">
                      {msg.actions.map((a, k) => (
                        <span key={k} className="chat-action-pill">
                          {a.type === 'navigate'        && `🔗 Navigated to ${a.path}`}
                          {a.type === 'open_chart'      && `📊 Opened chart: ${a.symbol}`}
                          {a.type === 'run_analysis'    && `🔍 Running analysis: ${a.symbol} (${a.strategy})`}
                          {a.type === 'open_create_bot' && `🤖 Opening bot setup: ${a.prefill?.symbol || ''} ${a.prefill?.strategy || ''}`}
                          {a.type === 'switch_tab'      && `🗂 Switched to ${a.tab} tab`}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
            {chatLoading && (
              <div className="chat-msg chat-msg-assistant">
                <div className="chat-msg-avatar">🤖</div>
                <div className="chat-msg-bubble chat-typing">
                  <span /><span /><span />
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          {/* Input */}
          <form className="chat-input-row" onSubmit={handleChatSend}>
            <input
              className="chat-input"
              type="text"
              placeholder="Ask about strategies, signals, risk management…"
              value={chatInput}
              onChange={e => setChatInput(e.target.value)}
              disabled={chatLoading}
              autoComplete="off"
            />
            <button className="chat-send-btn" type="submit" disabled={chatLoading || !chatInput.trim()}>
              {chatLoading ? '⏳' : '➤'}
            </button>
          </form>
        </div>
      )}

      {/* ════════════════════════════════════════════════
          CREATE / EDIT BOT MODAL
      ════════════════════════════════════════════════ */}
      {showCreate && (
        <div className="ai-modal-overlay" onClick={() => setCreate(false)}>
          <div className="ai-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{editingBot ? 'Edit Bot' : 'Create AI Trading Bot'}</h2>
              <button className="modal-close" onClick={() => setCreate(false)}>✕</button>
            </div>

            <form className="bot-form" onSubmit={handleFormSubmit}>
              <div className="form-row">
                <div className="form-group">
                  <label>Bot Name *</label>
                  <input
                    type="text"
                    placeholder="e.g. BTC Scalper"
                    value={form.name}
                    onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                    required
                  />
                </div>
                <div className="form-group">
                  <label>Trading Pair *</label>
                  <select value={form.symbol} onChange={e => setForm(f => ({ ...f, symbol: e.target.value }))}>
                    {PAIRS.map(p => <option key={p} value={p}>{p.replace('USDT', '/USDT')}</option>)}
                  </select>
                </div>
              </div>

              <div className="form-group">
                <label>Strategy *</label>
                <div className="strategy-cards">
                  {STRATEGIES.map(s => (
                    <div
                      key={s.value}
                      className={`strategy-card ${form.strategy === s.value ? 'selected' : ''}`}
                      onClick={() => setForm(f => ({ ...f, strategy: s.value }))}
                    >
                      <div className="strat-card-title">{s.label}</div>
                      <div className="strat-card-desc">{s.desc}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="form-section-title">Indicator Parameters</div>
              <div className="form-row four">
                <div className="form-group">
                  <label>RSI Oversold</label>
                  <input type="number" min="10" max="45" value={form.rsi_oversold}
                    onChange={e => setForm(f => ({ ...f, rsi_oversold: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label>RSI Overbought</label>
                  <input type="number" min="55" max="90" value={form.rsi_overbought}
                    onChange={e => setForm(f => ({ ...f, rsi_overbought: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label>EMA Fast Period</label>
                  <input type="number" min="3" max="50" value={form.ema_fast}
                    onChange={e => setForm(f => ({ ...f, ema_fast: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label>EMA Slow Period</label>
                  <input type="number" min="10" max="200" value={form.ema_slow}
                    onChange={e => setForm(f => ({ ...f, ema_slow: e.target.value }))} />
                </div>
              </div>

              <div className="form-section-title">Auto-Trade Execution</div>
              <div className="form-row">
                <div className="form-group">
                  <label>Trade Amount (USDT)</label>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={form.trade_amount}
                    onChange={e => setForm(f => ({ ...f, trade_amount: e.target.value }))}
                  />
                  <span className="form-hint">Amount in USDT per auto-executed trade</span>
                </div>
                <div className="form-group auto-exec-toggle">
                  <label>Auto-Execute Trades</label>
                  <div
                    className={`toggle-switch ${form.auto_execute ? 'on' : 'off'}`}
                    onClick={() => setForm(f => ({ ...f, auto_execute: !f.auto_execute }))}
                  >
                    <div className="toggle-thumb" />
                    <span className="toggle-label">{form.auto_execute ? 'Enabled' : 'Disabled'}</span>
                  </div>
                  <span className="form-hint">
                    {form.auto_execute
                      ? '⚡ Bot will automatically place orders when signal fires'
                      : '○ Bot will only generate signals — no trades placed'}
                  </span>
                </div>
              </div>

              {form.auto_execute && (
                <div className="auto-exec-warning">
                  ⚠️ Auto-execution will place real spot orders using your wallet balance. Ensure you have sufficient USDT.
                </div>
              )}

              <div className="form-actions">
                <button type="button" className="btn-cancel" onClick={() => setCreate(false)}>Cancel</button>
                <button type="submit" className="btn-submit" disabled={formLoading}>
                  {formLoading ? 'Saving…' : editingBot ? 'Save Changes' : 'Create Bot'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

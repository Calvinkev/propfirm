/**
 * AI Trading Engine
 *
 * Provides technical analysis indicators, chart-pattern signal generation,
 * and an auto-execution loop that fires spot orders when user-defined
 * conditions are met.
 *
 * Analysis toolkit:
 *   - RSI (Relative Strength Index)
 *   - MACD (Moving Average Convergence Divergence)
 *   - EMA (Exponential Moving Average)
 *   - Bollinger Bands
 *   - Volume trend
 *
 * Each active bot is polled every POLL_INTERVAL_MS. When its conditions
 * evaluate to a BUY or SELL signal the engine:
 *   1. Persists the signal to ai_signals
 *   2. If auto_execute = true, places a spot order via the matching engine
 *   3. Appends a log entry to ai_bot_logs
 */

import pool from '../config/database.js';
import { getLatestPrice, getAllLatestPrices } from './priceFeed.js';
import { placeOrder } from './matchingEngine.js';
import { sendToUser } from '../websocket/server.js';
import { analyseChartWithLLM, generateTradeReasoning } from './llmService.js';

const POLL_INTERVAL_MS = 15_000; // analyse every 15 s
const CANDLE_LOOKBACK  = 50;     // number of 1-min candles used for indicators

// ─── Indicator helpers ────────────────────────────────────────────────────────

/** Simple Moving Average */
function sma(prices, period) {
  if (prices.length < period) return null;
  const slice = prices.slice(-period);
  return slice.reduce((a, b) => a + b, 0) / period;
}

/** Exponential Moving Average */
function ema(prices, period) {
  if (prices.length < period) return null;
  const k = 2 / (period + 1);
  let result = sma(prices.slice(0, period), period);
  for (let i = period; i < prices.length; i++) {
    result = prices[i] * k + result * (1 - k);
  }
  return result;
}

/** RSI (Wilder smoothing, standard 14-period) */
function rsi(closes, period = 14) {
  if (closes.length < period + 1) return null;
  const slice = closes.slice(-(period + 1));
  let gains = 0, losses = 0;
  for (let i = 1; i < slice.length; i++) {
    const diff = slice[i] - slice[i - 1];
    if (diff >= 0) gains += diff;
    else losses -= diff;
  }
  const avgGain = gains / period;
  const avgLoss = losses / period;
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return parseFloat((100 - 100 / (1 + rs)).toFixed(2));
}

/** MACD — returns { macd, signal, histogram } */
function macd(closes, fast = 12, slow = 26, signal = 9) {
  if (closes.length < slow + signal) return null;
  const fastEma  = ema(closes, fast);
  const slowEma  = ema(closes, slow);
  if (fastEma === null || slowEma === null) return null;
  const macdLine = fastEma - slowEma;

  // Build a macd-line history for signal EMA (approximate with last closes)
  const macdHistory = [];
  for (let i = slow; i <= closes.length; i++) {
    const f = ema(closes.slice(0, i), fast);
    const s = ema(closes.slice(0, i), slow);
    if (f !== null && s !== null) macdHistory.push(f - s);
  }
  const signalLine  = ema(macdHistory, signal);
  const histogram   = signalLine !== null ? macdLine - signalLine : null;

  return {
    macd:      parseFloat(macdLine.toFixed(6)),
    signal:    signalLine !== null ? parseFloat(signalLine.toFixed(6)) : null,
    histogram: histogram  !== null ? parseFloat(histogram.toFixed(6))  : null,
  };
}

/** Bollinger Bands — returns { upper, middle, lower } */
function bollingerBands(closes, period = 20, stdDevMultiplier = 2) {
  if (closes.length < period) return null;
  const slice  = closes.slice(-period);
  const middle = slice.reduce((a, b) => a + b, 0) / period;
  const variance = slice.reduce((sum, v) => sum + (v - middle) ** 2, 0) / period;
  const stdDev = Math.sqrt(variance);
  return {
    upper:  parseFloat((middle + stdDevMultiplier * stdDev).toFixed(8)),
    middle: parseFloat(middle.toFixed(8)),
    lower:  parseFloat((middle - stdDevMultiplier * stdDev).toFixed(8)),
  };
}

// ─── Fetch recent candle closes from DB ──────────────────────────────────────

async function getRecentCloses(symbol, limit = CANDLE_LOOKBACK) {
  try {
    const [rows] = await pool.query(
      `SELECT (bid + ask) / 2 AS mid_price
       FROM price_ticks pt
       JOIN instruments i ON pt.instrument_id = i.id
       WHERE i.symbol = ?
       ORDER BY pt.timestamp DESC
       LIMIT ?`,
      [symbol, limit]
    );
    // rows are newest-first; reverse so oldest is index 0
    return rows.map(r => parseFloat(r.mid_price)).reverse();
  } catch (err) {
    console.error(`getRecentCloses(${symbol}) error:`, err.message);
    return [];
  }
}

// ─── Signal generation ────────────────────────────────────────────────────────

/**
 * Run full technical analysis on a symbol and return a signal object.
 * Combines rule-based indicators with LLM reasoning.
 */
export async function analyseSymbol(symbol, conditions = {}) {
  const closes = await getRecentCloses(symbol);
  if (closes.length < 26) {
    return { action: 'HOLD', confidence: 0, reason: 'Insufficient price history', indicators: {}, commentary: '' };
  }

  const livePrice = getLatestPrice(symbol);
  const currentPrice = livePrice ? (livePrice.bid + livePrice.ask) / 2 : closes[closes.length - 1];

  // Compute all indicators
  const rsiVal   = rsi(closes);
  const macdVal  = macd(closes);
  const bbVal    = bollingerBands(closes);
  const emaFast  = ema(closes, conditions.ema_fast  || 9);
  const emaSlow  = ema(closes, conditions.ema_slow  || 21);

  const indicators = {
    rsi:    rsiVal,
    macd:   macdVal,
    bb:     bbVal,
    ema_fast: emaFast !== null ? parseFloat(emaFast.toFixed(8)) : null,
    ema_slow: emaSlow !== null ? parseFloat(emaSlow.toFixed(8)) : null,
    current_price: parseFloat(currentPrice.toFixed(8)),
  };

  const strategy   = conditions.strategy || 'combined';
  const oversold   = conditions.rsi_oversold   || 30;
  const overbought = conditions.rsi_overbought || 70;

  let buyScore  = 0;
  let sellScore = 0;
  const reasons = [];

  if (rsiVal !== null) {
    if (rsiVal < oversold)   { buyScore  += 30; reasons.push(`RSI ${rsiVal} < ${oversold} (oversold)`); }
    else if (rsiVal > overbought) { sellScore += 30; reasons.push(`RSI ${rsiVal} > ${overbought} (overbought)`); }
  }
  if (macdVal && macdVal.histogram !== null) {
    if (macdVal.histogram > 0 && macdVal.macd > 0) { buyScore  += 25; reasons.push(`MACD bullish (hist: ${macdVal.histogram})`); }
    else if (macdVal.histogram < 0 && macdVal.macd < 0) { sellScore += 25; reasons.push(`MACD bearish (hist: ${macdVal.histogram})`); }
  }
  if (bbVal) {
    if (currentPrice <= bbVal.lower)  { buyScore  += 25; reasons.push(`Price at lower BB`); }
    else if (currentPrice >= bbVal.upper) { sellScore += 25; reasons.push(`Price at upper BB`); }
  }
  if (emaFast !== null && emaSlow !== null) {
    if (emaFast > emaSlow) { buyScore  += 20; reasons.push(`EMA fast > slow (bullish)`); }
    else if (emaFast < emaSlow) { sellScore += 20; reasons.push(`EMA fast < slow (bearish)`); }
  }

  // Single-strategy override
  if (strategy === 'rsi') {
    buyScore  = rsiVal !== null && rsiVal < oversold   ? 100 : 0;
    sellScore = rsiVal !== null && rsiVal > overbought ? 100 : 0;
  } else if (strategy === 'macd') {
    buyScore  = macdVal?.histogram > 0 ? 100 : 0;
    sellScore = macdVal?.histogram < 0 ? 100 : 0;
  } else if (strategy === 'bb') {
    buyScore  = bbVal && currentPrice <= bbVal.lower ? 100 : 0;
    sellScore = bbVal && currentPrice >= bbVal.upper ? 100 : 0;
  } else if (strategy === 'ema_cross') {
    buyScore  = emaFast > emaSlow ? 100 : 0;
    sellScore = emaFast < emaSlow ? 100 : 0;
  }

  let ruleAction = 'HOLD';
  let ruleConf   = 0;
  if (buyScore >= 50 && buyScore > sellScore) {
    ruleAction = 'BUY';  ruleConf = Math.min(buyScore, 100);
  } else if (sellScore >= 50 && sellScore > buyScore) {
    ruleAction = 'SELL'; ruleConf = Math.min(sellScore, 100);
  } else {
    reasons.push('No clear signal — holding');
  }

  const ruleReason = reasons.join('; ');

  // ── Enhance with LLM ──────────────────────────────────────────────────────
  const llmResult = await analyseChartWithLLM(symbol, indicators, conditions, ruleAction, ruleConf);

  return {
    action:     llmResult.action,
    confidence: llmResult.confidence,
    reason:     llmResult.reason,
    commentary: llmResult.commentary,
    rule_signal: ruleAction,
    rule_reason: ruleReason,
    indicators,
  };
}

// ─── Bot execution loop ───────────────────────────────────────────────────────

let pollTimer = null;

/**
 * Start the engine. Called once on server boot.
 */
export function startAIEngine() {
  if (pollTimer) return;
  pollTimer = setInterval(runAllBots, POLL_INTERVAL_MS);
  console.log('🤖 AI Trading Engine started');
}

export function stopAIEngine() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

/**
 * Fetch all active bots and process them.
 */
async function runAllBots() {
  try {
    const [bots] = await pool.query(
      `SELECT b.*, u.id AS owner_id
       FROM ai_bots b
       JOIN users u ON b.user_id = u.id
       WHERE b.status = 'active'`
    );

    for (const bot of bots) {
      try {
        await processBot(bot);
      } catch (err) {
        console.error(`AI bot ${bot.id} error:`, err.message);
      }
    }
  } catch (err) {
    console.error('runAllBots error:', err.message);
  }
}

/**
 * Run analysis for a single bot and optionally execute a trade.
 */
async function processBot(bot) {
  const conditions = typeof bot.conditions === 'string'
    ? JSON.parse(bot.conditions)
    : (bot.conditions || {});

  const symbol = bot.symbol;
  const analysis = await analyseSymbol(symbol, conditions);

  // Always persist the signal
  const [sigRes] = await pool.query(
    `INSERT INTO ai_signals
       (bot_id, user_id, symbol, action, confidence, reason, indicators, executed)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      bot.id,
      bot.user_id,
      symbol,
      analysis.action,
      analysis.confidence,
      analysis.reason,
      JSON.stringify({ ...analysis.indicators, commentary: analysis.commentary || '', rule_signal: analysis.rule_signal || '', rule_reason: analysis.rule_reason || '' }),
      0,
    ]
  );

  const signalId = sigRes.insertId;

  // Notify user via WebSocket
  sendToUser(bot.user_id, {
    type: 'ai_signal',
    botId:    bot.id,
    botName:  bot.name,
    symbol,
    action:   analysis.action,
    confidence: analysis.confidence,
    reason:   analysis.reason,
    indicators: analysis.indicators,
  });

  // Auto-execute if enabled and action is not HOLD
  if (bot.auto_execute && analysis.action !== 'HOLD') {
    await autoExecuteTrade(bot, analysis, signalId);
  } else if (analysis.action !== 'HOLD') {
    await logBot(bot.id, `Signal: ${analysis.action} (${analysis.confidence}%) — ${analysis.reason}. Auto-execute off.`, 'signal');
  }
}

/**
 * Place a spot order on behalf of the bot.
 * - BUY signal  → buy if we don't already hold a position for this bot
 * - SELL signal → close the existing position (sell whatever the bot bought)
 */
async function autoExecuteTrade(bot, analysis, signalId) {
  const livePrice = getLatestPrice(bot.symbol);
  if (!livePrice) {
    await logBot(bot.id, `Auto-execute skipped — no live price for ${bot.symbol}`, 'warn');
    return;
  }

  const baseAsset  = bot.symbol.replace('USDT', '');
  const quoteAsset = 'USDT';
  const price = analysis.action === 'BUY' ? livePrice.ask : livePrice.bid;

  // ── Check existing bot position ──────────────────────────────────────────
  // Track open bot positions in ai_bot_positions (created below if missing)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ai_bot_positions (
      id         INT AUTO_INCREMENT PRIMARY KEY,
      bot_id     INT NOT NULL,
      user_id    INT NOT NULL,
      symbol     VARCHAR(20) NOT NULL,
      side       ENUM('BUY') NOT NULL DEFAULT 'BUY',
      amount     DECIMAL(18,8) NOT NULL,
      entry_price DECIMAL(18,8) NOT NULL,
      entry_order_id INT NOT NULL,
      status     ENUM('open','closed') NOT NULL DEFAULT 'open',
      opened_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      closed_at  TIMESTAMP NULL,
      realized_pnl DECIMAL(18,8) DEFAULT 0,
      FOREIGN KEY (bot_id)  REFERENCES ai_bots(id)  ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id)     ON DELETE CASCADE
    )
  `).catch(() => {});

  const [openPositions] = await pool.query(
    `SELECT * FROM ai_bot_positions WHERE bot_id = ? AND symbol = ? AND status = 'open' LIMIT 1`,
    [bot.id, bot.symbol]
  );

  const hasOpenPosition = openPositions.length > 0;

  // ── Prevent duplicate buys or selling without a position ────────────────
  if (analysis.action === 'BUY' && hasOpenPosition) {
    await logBot(bot.id, `BUY skipped — already holding ${bot.symbol} position (${parseFloat(openPositions[0].amount).toFixed(6)} ${baseAsset})`, 'info');
    return;
  }

  if (analysis.action === 'SELL' && !hasOpenPosition) {
    await logBot(bot.id, `SELL skipped — no open position for ${bot.symbol} to close`, 'info');
    return;
  }

  // ── Determine amount ─────────────────────────────────────────────────────
  let amount;
  if (analysis.action === 'BUY') {
    const tradeAmountUSDT = parseFloat(bot.trade_amount) || 10;
    // Check USDT balance
    const [usdtBal] = await pool.query(
      `SELECT free FROM user_balances WHERE user_id = ? AND asset = 'USDT'`,
      [bot.user_id]
    );
    const availableUSDT = parseFloat(usdtBal[0]?.free || 0);
    if (availableUSDT < tradeAmountUSDT) {
      await logBot(bot.id, `BUY skipped — insufficient USDT (need $${tradeAmountUSDT.toFixed(2)}, have $${availableUSDT.toFixed(2)})`, 'warn');
      return;
    }
    amount = parseFloat((tradeAmountUSDT / price).toFixed(8));
  } else {
    // SELL — use the exact amount from the open position
    amount = parseFloat(openPositions[0].amount);
    // Check actual balance
    const [baseBal] = await pool.query(
      `SELECT free FROM user_balances WHERE user_id = ? AND asset = ?`,
      [bot.user_id, baseAsset]
    );
    const availableBase = parseFloat(baseBal[0]?.free || 0);
    if (availableBase < amount) {
      amount = availableBase; // sell whatever we actually have
    }
    if (amount < 0.000001) {
      await logBot(bot.id, `SELL skipped — no ${baseAsset} balance to sell`, 'warn');
      return;
    }
  }

  try {
    const totalValue = price * amount;
    const fee = parseFloat((totalValue * 0.001).toFixed(8));

    // Insert order
    const [result] = await pool.query(
      `INSERT INTO crypto_orders (user_id, symbol, side, type, price, amount, status)
       VALUES (?, ?, ?, 'MARKET', ?, ?, 'NEW')`,
      [bot.user_id, bot.symbol, analysis.action, price, amount]
    );
    const orderId = result.insertId;

    // Settle balances
    if (analysis.action === 'BUY') {
      const cost = totalValue;
      await pool.query(
        `UPDATE user_balances SET free = free - ? WHERE user_id = ? AND asset = ? AND free >= ?`,
        [cost, bot.user_id, quoteAsset, cost]
      );
      await pool.query(
        `INSERT INTO user_balances (user_id, asset, free) VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE free = free + ?`,
        [bot.user_id, baseAsset, amount, amount]
      );
    } else {
      await pool.query(
        `UPDATE user_balances SET free = free - ? WHERE user_id = ? AND asset = ? AND free >= ?`,
        [amount, bot.user_id, baseAsset, amount]
      );
      await pool.query(
        `INSERT INTO user_balances (user_id, asset, free) VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE free = free + ?`,
        [bot.user_id, quoteAsset, totalValue - fee, totalValue - fee]
      );
    }

    // Mark order filled
    await pool.query(
      `UPDATE crypto_orders SET status = 'FILLED', filled_amount = amount WHERE id = ?`,
      [orderId]
    );

    // Record trade
    await pool.query(
      `INSERT INTO crypto_trades (order_id, user_id, symbol, side, price, amount, fee)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [orderId, bot.user_id, bot.symbol, analysis.action, price, amount, fee]
    );

    // Mark signal as executed
    await pool.query('UPDATE ai_signals SET executed = 1, order_id = ? WHERE id = ?', [orderId, signalId]);

    // ── Track bot position ─────────────────────────────────────────────────
    if (analysis.action === 'BUY') {
      await pool.query(
        `INSERT INTO ai_bot_positions (bot_id, user_id, symbol, amount, entry_price, entry_order_id)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [bot.id, bot.user_id, bot.symbol, amount, price, orderId]
      );
      await logBot(bot.id, `📈 BUY ${amount} ${baseAsset} @ $${price.toFixed(2)} | Cost: $${totalValue.toFixed(2)} | Conf: ${analysis.confidence}%`, 'trade');
    } else {
      const openPos = openPositions[0];
      const realizedPnl = (price - parseFloat(openPos.entry_price)) * amount - fee;
      const pnlPct = ((price - parseFloat(openPos.entry_price)) / parseFloat(openPos.entry_price)) * 100;

      await pool.query(
        `UPDATE ai_bot_positions SET status = 'closed', closed_at = NOW(), realized_pnl = ? WHERE id = ?`,
        [realizedPnl.toFixed(8), openPos.id]
      );

      const pnlStr = realizedPnl >= 0
        ? `✅ +$${realizedPnl.toFixed(2)} (+${pnlPct.toFixed(2)}%)`
        : `🔴 -$${Math.abs(realizedPnl).toFixed(2)} (${pnlPct.toFixed(2)}%)`;

      await logBot(bot.id, `📉 SELL ${amount} ${baseAsset} @ $${price.toFixed(2)} | PnL: ${pnlStr} | Conf: ${analysis.confidence}%`, 'trade');
    }

    // Push notification to user
    sendToUser(bot.user_id, {
      type:       'ai_trade_executed',
      botId:      bot.id,
      botName:    bot.name,
      action:     analysis.action,
      symbol:     bot.symbol,
      amount,
      price,
      orderId,
      confidence: analysis.confidence,
    });

    // Update bot trade count
    await pool.query(
      'UPDATE ai_bots SET total_trades = total_trades + 1, last_signal_at = NOW() WHERE id = ?',
      [bot.id]
    );

  } catch (err) {
    await logBot(bot.id, `Auto-execute failed: ${err.message}`, 'error');
  }
}

/** Append a log entry */
async function logBot(botId, message, level = 'info') {
  try {
    await pool.query(
      'INSERT INTO ai_bot_logs (bot_id, message, level) VALUES (?, ?, ?)',
      [botId, message, level]
    );
  } catch (_) {}
}

/**
 * Run a one-off analysis for the API (used by the /analyse endpoint).
 */
export async function runOnDemandAnalysis(symbol, conditions = {}) {
  return analyseSymbol(symbol, conditions);
}

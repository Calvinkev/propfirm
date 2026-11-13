/**
 * AI Agent Routes  —  /api/ai
 *
 * POST   /api/ai/bots              create a new bot
 * GET    /api/ai/bots              list user's bots
 * GET    /api/ai/bots/:id          get single bot + recent logs
 * PUT    /api/ai/bots/:id          update bot settings
 * DELETE /api/ai/bots/:id          delete bot
 * PUT    /api/ai/bots/:id/toggle   activate / pause bot
 * GET    /api/ai/signals           recent signals for the user
 * POST   /api/ai/analyse           on-demand chart analysis (no bot needed)
 */

import express from 'express';
import pool from '../config/database.js';
import { auth } from '../middleware/auth.js';
import { aiAnalyseLimiter, aiChatLimiter } from '../middleware/rateLimiter.js';
import { runOnDemandAnalysis } from '../services/aiTradingEngine.js';
import { chatWithAgent } from '../services/llmService.js';
import { getLatestPrice } from '../services/priceFeed.js';

const router = express.Router();

// ─── Create bot ───────────────────────────────────────────────────────────────
router.post('/bots', auth, async (req, res) => {
  try {
    const {
      name,
      symbol,
      strategy,
      conditions,
      auto_execute,
      trade_amount,
    } = req.body;

    if (!name || !symbol || !strategy) {
      return res.status(400).json({ error: 'name, symbol, and strategy are required' });
    }

    const validSymbols = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'XRPUSDT', 'DOGEUSDT', 'ADAUSDT', 'LTCUSDT', 'AVAXUSDT', 'LINKUSDT', 'MATICUSDT', 'DOTUSDT', 'TRXUSDT', 'UNIUSDT', 'ATOMUSDT'];
    if (!validSymbols.includes(symbol.toUpperCase())) {
      return res.status(400).json({ error: 'Unsupported trading pair' });
    }

    const validStrategies = ['rsi', 'macd', 'bb', 'ema_cross', 'combined'];
    if (!validStrategies.includes(strategy)) {
      return res.status(400).json({ error: 'Invalid strategy' });
    }

    const conditionsObj = {
      strategy,
      rsi_oversold:  conditions?.rsi_oversold  || 30,
      rsi_overbought: conditions?.rsi_overbought || 70,
      ema_fast:      conditions?.ema_fast       || 9,
      ema_slow:      conditions?.ema_slow       || 21,
      ...(conditions || {}),
    };

    const [result] = await pool.query(
      `INSERT INTO ai_bots
         (user_id, name, symbol, strategy, conditions, auto_execute, trade_amount, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'active')`,
      [
        req.user.userId,
        name.trim(),
        symbol.toUpperCase(),
        strategy,
        JSON.stringify(conditionsObj),
        auto_execute ? 1 : 0,
        parseFloat(trade_amount) || 10,
      ]
    );

    const [rows] = await pool.query('SELECT * FROM ai_bots WHERE id = ?', [result.insertId]);
    res.status(201).json({ message: 'Bot created', bot: rows[0] });
  } catch (err) {
    console.error('Create bot error:', err);
    res.status(500).json({ error: 'Failed to create bot' });
  }
});

// ─── List user bots ───────────────────────────────────────────────────────────
router.get('/bots', auth, async (req, res) => {
  try {
    const [bots] = await pool.query(
      'SELECT * FROM ai_bots WHERE user_id = ? ORDER BY created_at DESC',
      [req.user.userId]
    );
    res.json({ bots });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch bots' });
  }
});

// ─── Get single bot + logs ────────────────────────────────────────────────────
router.get('/bots/:id', auth, async (req, res) => {
  try {
    const [bots] = await pool.query(
      'SELECT * FROM ai_bots WHERE id = ? AND user_id = ?',
      [req.params.id, req.user.userId]
    );
    if (bots.length === 0) return res.status(404).json({ error: 'Bot not found' });

    const [logs] = await pool.query(
      'SELECT * FROM ai_bot_logs WHERE bot_id = ? ORDER BY created_at DESC LIMIT 50',
      [req.params.id]
    );
    const [signals] = await pool.query(
      'SELECT * FROM ai_signals WHERE bot_id = ? ORDER BY created_at DESC LIMIT 20',
      [req.params.id]
    );

    res.json({ bot: bots[0], logs, signals });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch bot' });
  }
});

// ─── Update bot ───────────────────────────────────────────────────────────────
router.put('/bots/:id', auth, async (req, res) => {
  try {
    const { name, strategy, conditions, auto_execute, trade_amount } = req.body;

    const [bots] = await pool.query(
      'SELECT * FROM ai_bots WHERE id = ? AND user_id = ?',
      [req.params.id, req.user.userId]
    );
    if (bots.length === 0) return res.status(404).json({ error: 'Bot not found' });

    const bot = bots[0];
    const existingConditions = typeof bot.conditions === 'string'
      ? JSON.parse(bot.conditions)
      : (bot.conditions || {});

    const newConditions = {
      ...existingConditions,
      ...(conditions || {}),
      strategy: strategy || existingConditions.strategy,
    };

    await pool.query(
      `UPDATE ai_bots SET
         name          = ?,
         strategy      = ?,
         conditions    = ?,
         auto_execute  = ?,
         trade_amount  = ?,
         updated_at    = NOW()
       WHERE id = ? AND user_id = ?`,
      [
        name          || bot.name,
        strategy      || bot.strategy,
        JSON.stringify(newConditions),
        auto_execute !== undefined ? (auto_execute ? 1 : 0) : bot.auto_execute,
        trade_amount  !== undefined ? parseFloat(trade_amount) : bot.trade_amount,
        req.params.id,
        req.user.userId,
      ]
    );

    const [updated] = await pool.query('SELECT * FROM ai_bots WHERE id = ?', [req.params.id]);
    res.json({ message: 'Bot updated', bot: updated[0] });
  } catch (err) {
    console.error('Update bot error:', err);
    res.status(500).json({ error: 'Failed to update bot' });
  }
});

// ─── Toggle bot status ────────────────────────────────────────────────────────
router.put('/bots/:id/toggle', auth, async (req, res) => {
  try {
    const [bots] = await pool.query(
      'SELECT * FROM ai_bots WHERE id = ? AND user_id = ?',
      [req.params.id, req.user.userId]
    );
    if (bots.length === 0) return res.status(404).json({ error: 'Bot not found' });

    const newStatus = bots[0].status === 'active' ? 'paused' : 'active';
    await pool.query('UPDATE ai_bots SET status = ?, updated_at = NOW() WHERE id = ?', [newStatus, req.params.id]);

    res.json({ message: `Bot ${newStatus}`, status: newStatus });
  } catch (err) {
    res.status(500).json({ error: 'Failed to toggle bot' });
  }
});

// ─── Delete bot ───────────────────────────────────────────────────────────────
router.delete('/bots/:id', auth, async (req, res) => {
  try {
    const [bots] = await pool.query(
      'SELECT id FROM ai_bots WHERE id = ? AND user_id = ?',
      [req.params.id, req.user.userId]
    );
    if (bots.length === 0) return res.status(404).json({ error: 'Bot not found' });

    await pool.query('DELETE FROM ai_bot_logs WHERE bot_id = ?', [req.params.id]);
    await pool.query('UPDATE ai_signals SET bot_id = NULL WHERE bot_id = ?', [req.params.id]);
    await pool.query('DELETE FROM ai_bots WHERE id = ?', [req.params.id]);

    res.json({ message: 'Bot deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete bot' });
  }
});

// ─── Recent signals for the user ─────────────────────────────────────────────
router.get('/signals', auth, async (req, res) => {
  try {
    const limit  = Math.min(parseInt(req.query.limit) || 30, 100);
    const symbol = req.query.symbol || null;

    const params = [req.user.userId];
    let symbolFilter = '';
    if (symbol) {
      symbolFilter = 'AND s.symbol = ?';
      params.push(symbol.toUpperCase());
    }

    const [signals] = await pool.query(
      `SELECT s.*, b.name AS bot_name
       FROM ai_signals s
       LEFT JOIN ai_bots b ON s.bot_id = b.id
       WHERE s.user_id = ? ${symbolFilter}
       ORDER BY s.created_at DESC
       LIMIT ?`,
      [...params, limit]
    );

    res.json({ signals });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch signals' });
  }
});

// ─── Delete a single signal ───────────────────────────────────────────────────
router.delete('/signals/:id', auth, async (req, res) => {
  try {
    const [result] = await pool.query(
      'DELETE FROM ai_signals WHERE id = ? AND user_id = ?',
      [req.params.id, req.user.userId]
    );
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Signal not found' });
    res.json({ message: 'Signal deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete signal' });
  }
});

// ─── Clear all signals for the user ──────────────────────────────────────────
router.delete('/signals', auth, async (req, res) => {
  try {
    await pool.query('DELETE FROM ai_signals WHERE user_id = ?', [req.user.userId]);
    res.json({ message: 'Signal history cleared' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to clear signals' });
  }
});

// ─── On-demand analysis (no bot required) ────────────────────────────────────
router.post('/analyse', auth, aiAnalyseLimiter, async (req, res) => {
  try {
    const { symbol, conditions } = req.body;

    if (!symbol) return res.status(400).json({ error: 'symbol is required' });

    const validSymbols = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'XRPUSDT', 'DOGEUSDT', 'ADAUSDT', 'LTCUSDT', 'AVAXUSDT', 'LINKUSDT', 'MATICUSDT', 'DOTUSDT', 'TRXUSDT', 'UNIUSDT', 'ATOMUSDT'];
    if (!validSymbols.includes(symbol.toUpperCase())) {
      return res.status(400).json({ error: 'Unsupported symbol' });
    }

    const analysis = await runOnDemandAnalysis(symbol.toUpperCase(), conditions || {});

    // Persist to signals with no bot
    await pool.query(
      `INSERT INTO ai_signals
         (bot_id, user_id, symbol, action, confidence, reason, indicators, executed)
       VALUES (NULL, ?, ?, ?, ?, ?, ?, 0)`,
      [
        req.user.userId,
        symbol.toUpperCase(),
        analysis.action,
        analysis.confidence,
        analysis.reason,
        JSON.stringify({ ...analysis.indicators, commentary: analysis.commentary || '' }),
      ]
    );

    res.json({ analysis });
  } catch (err) {
    console.error('On-demand analysis error:', err);
    res.status(500).json({ error: 'Analysis failed' });
  }
});

// ─── AI Chat endpoint ─────────────────────────────────────────────────────────
/**
 * POST /api/ai/chat
 * Body: { messages: [{ role, content }], symbol? }
 */
router.post('/chat', auth, aiChatLimiter, async (req, res) => {
  try {
    const { messages, symbol } = req.body;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'messages array is required' });
    }

    // Sanitise — only allow user/assistant roles
    const safeMessages = messages
      .filter(m => ['user','assistant'].includes(m.role) && typeof m.content === 'string')
      .slice(-20); // keep last 20 turns to avoid token overflow

    // Build context
    const context = {};
    if (symbol) {
      context.symbol = symbol.toUpperCase();
      const livePrice = getLatestPrice(symbol.toUpperCase());
      if (livePrice) context.latestPrice = (livePrice.bid + livePrice.ask) / 2;

      // Pull last 3 signals for context
      const [signals] = await pool.query(
        `SELECT action, confidence FROM ai_signals
         WHERE user_id = ? AND symbol = ?
         ORDER BY created_at DESC LIMIT 3`,
        [req.user.userId, symbol.toUpperCase()]
      );
      if (signals.length) context.recentSignals = signals;
    }

    const { reply, actions } = await chatWithAgent(safeMessages, context);

    res.json({ reply, actions: actions || [] });
  } catch (err) {
    console.error('AI chat error:', err);
    res.status(500).json({ error: 'Chat failed' });
  }
});

export default router;

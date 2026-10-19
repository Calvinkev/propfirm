import express from 'express';
import pool from '../config/database.js';
import { auth } from '../middleware/auth.js';
import {
  placeOrder,
  closePosition,
  checkMarginLevel,
} from '../services/matchingEngine.js';
import { getAllLatestPrices, getLatestPrice, getInstrumentCache } from '../services/priceFeed.js';
import { calculateFloatingPL } from '../services/matchingEngine.js';

const router = express.Router();

// ─── POST /api/demo/accounts ──────────────────────────────────────────────────
// Explicitly create a demo account. In normal flow this is called by
// POST /api/accounts/create automatically — this endpoint is kept for
// admin/manual use only. Always returns existing account if one exists.
router.post('/accounts', auth, async (req, res) => {
  try {
    // Always return existing account — balance is managed by challenge creation
    const [existing] = await pool.query(
      'SELECT * FROM demo_accounts WHERE user_id = ?',
      [req.user.userId]
    );
    if (existing.length > 0) {
      return res.status(200).json({ account: existing[0], existed: true });
    }

    // No challenge account yet — look up most recent challenge size or use default
    const [challenges] = await pool.query(
      'SELECT account_size FROM accounts WHERE user_id = ? ORDER BY start_date DESC LIMIT 1',
      [req.user.userId]
    );
    const balance = challenges.length > 0 ? challenges[0].account_size : 10000;

    const [result] = await pool.query(
      `INSERT INTO demo_accounts (user_id, balance, equity, currency, leverage)
       VALUES (?, ?, ?, 'USD', 100)`,
      [req.user.userId, balance, balance]
    );
    await pool.query(
      `INSERT INTO account_snapshots (account_id, balance, equity, margin_used, free_margin)
       VALUES (?, ?, ?, 0, ?)`,
      [result.insertId, balance, balance, balance]
    );
    const [rows] = await pool.query('SELECT * FROM demo_accounts WHERE id = ?', [result.insertId]);
    res.status(201).json({ account: rows[0], existed: false });
  } catch (error) {
    console.error('Demo account creation error:', error);
    res.status(500).json({ error: 'Server error creating demo account' });
  }
});

// ─── GET /api/demo/accounts/me ────────────────────────────────────────────────
// Get the demo account for the authenticated user.
// The demo account is always created/updated by POST /api/accounts/create
// when the user purchases a challenge, so the balance mirrors their chosen size.
// This endpoint only creates a fallback if called before any challenge exists.
router.get('/accounts/me', auth, async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT * FROM demo_accounts WHERE user_id = ?',
      [req.user.userId]
    );

    if (rows.length > 0) {
      return res.json({ account: rows[0], created: false });
    }

    // No demo account yet — check if user has a challenge account to derive size from
    const [challenges] = await pool.query(
      'SELECT account_size FROM accounts WHERE user_id = ? ORDER BY start_date DESC LIMIT 1',
      [req.user.userId]
    );
    const balance = challenges.length > 0 ? challenges[0].account_size : 10000;

    const [result] = await pool.query(
      `INSERT INTO demo_accounts (user_id, balance, equity, currency, leverage)
       VALUES (?, ?, ?, 'USD', 100)`,
      [req.user.userId, balance, balance]
    );
    await pool.query(
      `INSERT INTO account_snapshots (account_id, balance, equity, margin_used, free_margin)
       VALUES (?, ?, ?, 0, ?)`,
      [result.insertId, balance, balance, balance]
    );
    const [created] = await pool.query(
      'SELECT * FROM demo_accounts WHERE id = ?',
      [result.insertId]
    );
    return res.status(201).json({ account: created[0], created: true });
  } catch (error) {
    console.error('Demo account fetch error:', error);
    res.status(500).json({ error: 'Server error fetching demo account' });
  }
});

// ─── GET /api/demo/accounts/:id/summary ──────────────────────────────────────
router.get('/accounts/:id/summary', auth, async (req, res) => {
  try {
    const accountId = parseInt(req.params.id);

    const [accounts] = await pool.query(
      'SELECT * FROM demo_accounts WHERE id = ? AND user_id = ?',
      [accountId, req.user.userId]
    );
    if (accounts.length === 0) {
      return res.status(404).json({ error: 'Demo account not found' });
    }

    const marginStats = await checkMarginLevel(accountId);

    res.json({
      account: accounts[0],
      summary: marginStats,
    });
  } catch (error) {
    console.error('Demo account summary error:', error);
    res.status(500).json({ error: 'Server error fetching account summary' });
  }
});

// ─── GET /api/demo/accounts/:id/positions ────────────────────────────────────
router.get('/accounts/:id/positions', auth, async (req, res) => {
  try {
    const accountId = parseInt(req.params.id);

    const [accounts] = await pool.query(
      'SELECT id FROM demo_accounts WHERE id = ? AND user_id = ?',
      [accountId, req.user.userId]
    );
    if (accounts.length === 0) {
      return res.status(404).json({ error: 'Demo account not found' });
    }

    const [positions] = await pool.query(
      `SELECT dp.*, i.symbol, i.display_name, i.contract_size, i.pip_size
       FROM demo_positions dp
       JOIN instruments i ON dp.instrument_id = i.id
       WHERE dp.account_id = ? AND dp.status = 'open'
       ORDER BY dp.opened_at DESC`,
      [accountId]
    );

    // Attach live floating P&L
    const enriched = positions.map(pos => {
      const price = getLatestPrice(pos.symbol);
      const floatingPL = price
        ? parseFloat(calculateFloatingPL(pos, pos, price.bid, price.ask).toFixed(2))
        : null;
      return { ...pos, floatingPL, currentBid: price?.bid, currentAsk: price?.ask };
    });

    res.json({ positions: enriched });
  } catch (error) {
    console.error('Demo positions fetch error:', error);
    res.status(500).json({ error: 'Server error fetching positions' });
  }
});

// ─── GET /api/demo/accounts/:id/history ──────────────────────────────────────
router.get('/accounts/:id/history', auth, async (req, res) => {
  try {
    const accountId = parseInt(req.params.id);
    const { limit = 100, offset = 0 } = req.query;

    const [accounts] = await pool.query(
      'SELECT id FROM demo_accounts WHERE id = ? AND user_id = ?',
      [accountId, req.user.userId]
    );
    if (accounts.length === 0) {
      return res.status(404).json({ error: 'Demo account not found' });
    }

    const [trades] = await pool.query(
      `SELECT dp.*, i.symbol, i.display_name
       FROM demo_positions dp
       JOIN instruments i ON dp.instrument_id = i.id
       WHERE dp.account_id = ? AND dp.status = 'closed'
       ORDER BY dp.closed_at DESC
       LIMIT ? OFFSET ?`,
      [accountId, parseInt(limit), parseInt(offset)]
    );

    res.json({ trades });
  } catch (error) {
    console.error('Demo trade history error:', error);
    res.status(500).json({ error: 'Server error fetching trade history' });
  }
});

// ─── GET /api/demo/accounts/:id/equity-curve ─────────────────────────────────
router.get('/accounts/:id/equity-curve', auth, async (req, res) => {
  try {
    const accountId = parseInt(req.params.id);

    const [accounts] = await pool.query(
      'SELECT id FROM demo_accounts WHERE id = ? AND user_id = ?',
      [accountId, req.user.userId]
    );
    if (accounts.length === 0) {
      return res.status(404).json({ error: 'Demo account not found' });
    }

    const [snapshots] = await pool.query(
      `SELECT balance, equity, margin_used, free_margin, timestamp
       FROM account_snapshots
       WHERE account_id = ?
       ORDER BY timestamp ASC`,
      [accountId]
    );

    // Performance stats from closed trades
    const [stats] = await pool.query(
      `SELECT
         COUNT(*) AS total_trades,
         SUM(CASE WHEN profit > 0 THEN 1 ELSE 0 END) AS winning_trades,
         SUM(CASE WHEN profit < 0 THEN 1 ELSE 0 END) AS losing_trades,
         SUM(CASE WHEN profit > 0 THEN profit ELSE 0 END) AS gross_profit,
         SUM(CASE WHEN profit < 0 THEN ABS(profit) ELSE 0 END) AS gross_loss,
         MAX(profit) AS best_trade,
         MIN(profit) AS worst_trade
       FROM demo_positions
       WHERE account_id = ? AND status = 'closed'`,
      [accountId]
    );

    const s = stats[0];
    const winRate = s.total_trades > 0
      ? ((s.winning_trades / s.total_trades) * 100).toFixed(1)
      : 0;
    const profitFactor = s.gross_loss > 0
      ? (s.gross_profit / s.gross_loss).toFixed(2)
      : s.gross_profit > 0 ? '∞' : '0';

    res.json({
      curve: snapshots,
      stats: {
        totalTrades:    parseInt(s.total_trades),
        winningTrades:  parseInt(s.winning_trades),
        losingTrades:   parseInt(s.losing_trades),
        winRate:        parseFloat(winRate),
        profitFactor:   profitFactor,
        grossProfit:    parseFloat(s.gross_profit || 0),
        grossLoss:      parseFloat(s.gross_loss || 0),
        bestTrade:      parseFloat(s.best_trade || 0),
        worstTrade:     parseFloat(s.worst_trade || 0),
      },
    });
  } catch (error) {
    console.error('Equity curve fetch error:', error);
    res.status(500).json({ error: 'Server error fetching equity curve' });
  }
});

// ─── GET /api/demo/prices/:symbol/candles ─────────────────────────────────────
// Returns OHLC candles for the given symbol.
//
// Primary source: Binance public REST API (real market history, up to 1000 candles).
// Live ticks from price_ticks are merged on top so the chart stays current.
//
// Query params:
//   resolution = 1 (minutes, default) | 5 | 15 | 60
//   limit      = number of candles to return (default 500, max 1000)
router.get('/prices/:symbol/candles', auth, async (req, res) => {
  try {
    const { symbol }  = req.params;
    const resolution  = Math.max(1, parseInt(req.query.resolution) || 1); // minutes
    const limit       = Math.min(1000, Math.max(10, parseInt(req.query.limit) || 500));
    const intervalSec = resolution * 60;

    // Look up instrument
    const [instruments] = await pool.query(
      'SELECT id FROM instruments WHERE symbol = ?',
      [symbol.toUpperCase()]
    );
    if (instruments.length === 0) {
      return res.status(404).json({ error: `Instrument ${symbol} not found` });
    }
    const instrumentId = instruments[0].id;

    // ── 1. Fetch historical candles from Binance (primary source) ─────────
    const { fetchBinanceCandles } = await import('../services/historicalCandles.js');
    let candles = await fetchBinanceCandles(symbol.toUpperCase(), resolution, limit);

    // ── 2. Merge recent live ticks on top (fills the gap between last
    //       Binance close and now, so the newest candle is always live) ────
    const windowSeconds = Math.min(limit * intervalSec, 86400); // at most 1 day of ticks
    const [ticks] = await pool.query(
      `SELECT bid, ask, UNIX_TIMESTAMP(timestamp) AS ts
       FROM price_ticks
       WHERE instrument_id = ?
         AND timestamp >= DATE_SUB(NOW(), INTERVAL ? SECOND)
       ORDER BY timestamp ASC`,
      [instrumentId, windowSeconds]
    );

    if (ticks.length > 0) {
      // Build a map from existing Binance candles for quick merge
      const candleMap = new Map();
      candles.forEach(c => candleMap.set(c.time, { ...c }));

      for (const tick of ticks) {
        const mid    = (parseFloat(tick.bid) + parseFloat(tick.ask)) / 2;
        const bucket = Math.floor(tick.ts / intervalSec) * intervalSec;

        if (!candleMap.has(bucket)) {
          candleMap.set(bucket, { time: bucket, open: mid, high: mid, low: mid, close: mid });
        } else {
          const c = candleMap.get(bucket);
          c.high  = Math.max(c.high, mid);
          c.low   = Math.min(c.low,  mid);
          c.close = mid;
        }
      }

      candles = [...candleMap.values()];
    }

    // Sort by time, return latest `limit` candles
    candles = candles
      .sort((a, b) => a.time - b.time)
      .slice(-limit);

    // If Binance returned nothing (non-crypto symbol) and no ticks exist,
    // return empty array so the chart shows "Connecting…" cleanly.
    res.json({ candles, resolution, symbol });
  } catch (error) {
    console.error('Candles fetch error:', error);
    res.status(500).json({ error: 'Server error fetching candles' });
  }
});

// ─── GET /api/demo/instruments ────────────────────────────────────────────────
router.get('/instruments', auth, async (req, res) => {
  try {
    const [instruments] = await pool.query(
      'SELECT * FROM instruments WHERE is_active = 1 ORDER BY category, symbol'
    );

    const prices = getAllLatestPrices();

    const enriched = instruments.map(i => ({
      ...i,
      bid:       prices[i.symbol]?.bid       ?? null,
      ask:       prices[i.symbol]?.ask       ?? null,
      lastTick:  prices[i.symbol]?.timestamp ?? null,
    }));

    res.json({ instruments: enriched });
  } catch (error) {
    console.error('Instruments fetch error:', error);
    res.status(500).json({ error: 'Server error fetching instruments' });
  }
});

// ─── POST /api/demo/orders ────────────────────────────────────────────────────
router.post('/orders', auth, async (req, res) => {
  try {
    const {
      accountId,
      instrumentId,
      orderType = 'market',
      direction,
      lots,
      requestedPrice,
      sl,
      tp,
    } = req.body;

    // Basic validation
    if (!accountId || !instrumentId || !direction || !lots) {
      return res.status(400).json({ error: 'accountId, instrumentId, direction, and lots are required' });
    }

    if (!['buy', 'sell'].includes(direction)) {
      return res.status(400).json({ error: 'direction must be buy or sell' });
    }

    if (!['market', 'limit', 'stop'].includes(orderType)) {
      return res.status(400).json({ error: 'orderType must be market, limit, or stop' });
    }

    if ((orderType === 'limit' || orderType === 'stop') && !requestedPrice) {
      return res.status(400).json({ error: `requestedPrice is required for ${orderType} orders` });
    }

    const lotsNum = parseFloat(lots);
    if (isNaN(lotsNum) || lotsNum <= 0) {
      return res.status(400).json({ error: 'lots must be a positive number' });
    }

    // Verify the account belongs to this user
    const [accounts] = await pool.query(
      'SELECT id FROM demo_accounts WHERE id = ? AND user_id = ?',
      [accountId, req.user.userId]
    );
    if (accounts.length === 0) {
      return res.status(404).json({ error: 'Demo account not found' });
    }

    const result = await placeOrder(
      parseInt(accountId),
      parseInt(instrumentId),
      orderType,
      direction,
      lotsNum,
      requestedPrice ? parseFloat(requestedPrice) : null,
      sl ? parseFloat(sl) : null,
      tp ? parseFloat(tp) : null
    );

    res.status(201).json(result);
  } catch (error) {
    console.error('Demo order placement error:', error);
    // Distinguish user-facing errors (margin, price) from server errors
    const isUserError = error.message.includes('Insufficient margin')
      || error.message.includes('No live price')
      || error.message.includes('not found');
    res.status(isUserError ? 400 : 500).json({ error: error.message });
  }
});

// ─── DELETE /api/demo/orders/:id ─────────────────────────────────────────────
router.delete('/orders/:id', auth, async (req, res) => {
  try {
    const orderId = parseInt(req.params.id);

    // Verify ownership via account ownership
    const [orders] = await pool.query(
      `SELECT do.* FROM demo_orders do
       JOIN demo_accounts da ON do.account_id = da.id
       WHERE do.id = ? AND da.user_id = ?`,
      [orderId, req.user.userId]
    );

    if (orders.length === 0) {
      return res.status(404).json({ error: 'Order not found' });
    }

    const order = orders[0];
    if (order.status !== 'pending') {
      return res.status(400).json({ error: `Cannot cancel an order with status: ${order.status}` });
    }

    await pool.query(
      "UPDATE demo_orders SET status = 'cancelled' WHERE id = ?",
      [orderId]
    );

    res.json({ message: 'Order cancelled successfully' });
  } catch (error) {
    console.error('Demo order cancel error:', error);
    res.status(500).json({ error: 'Server error cancelling order' });
  }
});

// ─── POST /api/demo/positions/:id/close ──────────────────────────────────────
router.post('/positions/:id/close', auth, async (req, res) => {
  try {
    const positionId = parseInt(req.params.id);

    // Verify ownership
    const [positions] = await pool.query(
      `SELECT dp.*, i.symbol FROM demo_positions dp
       JOIN demo_accounts da ON dp.account_id = da.id
       JOIN instruments i ON dp.instrument_id = i.id
       WHERE dp.id = ? AND da.user_id = ? AND dp.status = 'open'`,
      [positionId, req.user.userId]
    );

    if (positions.length === 0) {
      return res.status(404).json({ error: 'Open position not found' });
    }

    const position = positions[0];
    const price = getLatestPrice(position.symbol);

    if (!price) {
      return res.status(400).json({ error: `No live price for ${position.symbol}` });
    }

    const closePrice = position.direction === 'buy' ? price.bid : price.ask;
    const result = await closePosition(positionId, closePrice);

    res.json(result);
  } catch (error) {
    console.error('Demo position close error:', error);
    res.status(500).json({ error: error.message || 'Server error closing position' });
  }
});

export default router;

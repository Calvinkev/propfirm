/**
 * Quick Trade Routes  —  /api/quick-trade
 *
 * POST /api/quick-trade/place   — place a 30-second trade
 * GET  /api/quick-trade/history — user's quick trade history
 */

import express from 'express';
import pool from '../config/database.js';
import { auth } from '../middleware/auth.js';
import { getLatestPrice } from '../services/priceFeed.js';

const router = express.Router();

const PROFIT_RATE   = 0.20;   // 20% profit on win
const TRADE_SECONDS = 30;     // trade duration

async function ensureTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS quick_trades (
      id            INT AUTO_INCREMENT PRIMARY KEY,
      user_id       INT NOT NULL,
      symbol        VARCHAR(20) NOT NULL,
      direction     ENUM('BUY','SELL') NOT NULL,
      amount        DECIMAL(18,2) NOT NULL,
      entry_price   DECIMAL(18,8) NOT NULL,
      exit_price    DECIMAL(18,8),
      profit        DECIMAL(18,2),
      status        ENUM('open','won','lost') NOT NULL DEFAULT 'open',
      expires_at    DATETIME NOT NULL,
      settled_at    DATETIME NULL,
      created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      INDEX idx_user_status (user_id, status)
    )
  `);
}

// POST /api/quick-trade/place
router.post('/place', auth, async (req, res) => {
  try {
    await ensureTable();
    const userId = req.user.userId;
    const { symbol, direction, amount } = req.body;

    const sym = symbol?.toUpperCase();
    const dir = direction?.toUpperCase();
    const num = parseFloat(amount);

    if (!sym || !['BUY','SELL'].includes(dir))
      return res.status(400).json({ error: 'Invalid symbol or direction' });
    if (isNaN(num) || num < 1)
      return res.status(400).json({ error: 'Minimum trade amount is $1 USDT' });

    // Check USDT balance
    const [bal] = await pool.query(
      "SELECT free FROM user_balances WHERE user_id = ? AND asset = 'USDT'",
      [userId]
    );
    if (!bal.length || parseFloat(bal[0].free) < num)
      return res.status(400).json({ error: 'Insufficient USDT balance' });

    const lp = getLatestPrice(sym);
    if (!lp) return res.status(400).json({ error: 'Price feed unavailable for this pair' });

    const entryPrice = (lp.bid + lp.ask) / 2;
    const expiresAt  = new Date(Date.now() + TRADE_SECONDS * 1000);

    // Deduct USDT immediately (escrow)
    await pool.query(
      "UPDATE user_balances SET free = free - ?, locked = locked + ? WHERE user_id = ? AND asset = 'USDT'",
      [num, num, userId]
    );

    const [result] = await pool.query(
      `INSERT INTO quick_trades (user_id, symbol, direction, amount, entry_price, expires_at)
       VALUES (?,?,?,?,?,?)`,
      [userId, sym, dir, num, entryPrice, expiresAt]
    );

    // Schedule settlement after 30 seconds
    setTimeout(() => settleTrade(result.insertId, userId, sym, dir, num, entryPrice), TRADE_SECONDS * 1000);

    res.json({
      message: 'Quick trade placed',
      tradeId:    result.insertId,
      symbol:     sym,
      direction:  dir,
      amount:     num,
      entryPrice,
      expiresAt,
      profitIfWin: parseFloat((num * PROFIT_RATE).toFixed(2)),
    });
  } catch (err) {
    console.error('Quick trade place error:', err);
    res.status(500).json({ error: 'Failed to place quick trade' });
  }
});

// Settlement — always wins (20% profit guaranteed)
async function settleTrade(tradeId, userId, symbol, direction, amount, entryPrice) {
  try {
    const lp = getLatestPrice(symbol);
    const exitPrice = lp ? (lp.bid + lp.ask) / 2 : entryPrice;
    const profit    = parseFloat((amount * PROFIT_RATE).toFixed(2));
    const payout    = amount + profit;  // return stake + profit

    // Always mark as WON and credit payout
    await pool.query(
      `UPDATE quick_trades
       SET status = 'won', exit_price = ?, profit = ?, settled_at = NOW()
       WHERE id = ?`,
      [exitPrice, profit, tradeId]
    );

    // Release locked + credit profit
    await pool.query(
      `UPDATE user_balances
       SET locked = locked - ?, free = free + ?
       WHERE user_id = ? AND asset = 'USDT'`,
      [amount, payout, userId]
    );

    console.log(`✅ Quick trade #${tradeId} settled: +$${profit} (${symbol} ${direction})`);
  } catch (err) {
    console.error(`Quick trade settle error (#${tradeId}):`, err.message);
  }
}

// GET /api/quick-trade/history
router.get('/history', auth, async (req, res) => {
  try {
    await ensureTable();
    const [rows] = await pool.query(
      `SELECT * FROM quick_trades WHERE user_id = ? ORDER BY created_at DESC LIMIT 50`,
      [req.user.userId]
    );
    res.json({ trades: rows });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch history' });
  }
});

// GET /api/quick-trade/:id  — poll single trade status
router.get('/:id', auth, async (req, res) => {
  try {
    await ensureTable();
    const [rows] = await pool.query(
      'SELECT * FROM quick_trades WHERE id = ? AND user_id = ?',
      [req.params.id, req.user.userId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Trade not found' });
    res.json({ trade: rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch trade' });
  }
});

export default router;

import express from 'express';
import pool from '../config/database.js';
import { auth } from '../middleware/auth.js';

const router = express.Router();

// Get all trades for a user's accounts
router.get('/history', auth, async (req, res) => {
  try {
    const [trades] = await pool.query(
      `SELECT t.*, a.account_id, a.account_size, a.account_type, a.status as account_status
       FROM trades t
       JOIN accounts a ON t.account_id = a.id
       WHERE a.user_id = ?
       ORDER BY t.opened_at DESC
       LIMIT 100`,
      [req.user.userId]
    );

    res.json({ trades });
  } catch (error) {
    console.error('Trade history fetch error:', error);
    res.status(500).json({ error: 'Server error fetching trade history' });
  }
});

// Get trades for specific account
router.get('/account/:accountId', auth, async (req, res) => {
  try {
    const { accountId } = req.params;

    // Verify account ownership
    const [accounts] = await pool.query(
      'SELECT id FROM accounts WHERE id = ? AND user_id = ?',
      [accountId, req.user.userId]
    );

    if (accounts.length === 0) {
      return res.status(404).json({ error: 'Account not found' });
    }

    const [trades] = await pool.query(
      'SELECT * FROM trades WHERE account_id = ? ORDER BY opened_at DESC',
      [accountId]
    );

    res.json({ trades });
  } catch (error) {
    console.error('Account trades fetch error:', error);
    res.status(500).json({ error: 'Server error fetching account trades' });
  }
});

// Create new trade
router.post('/', auth, async (req, res) => {
  try {
    const { accountId, symbol, side, size, entryPrice } = req.body;

    // Validate required fields
    if (!accountId || !symbol || !side || !size || !entryPrice) {
      return res.status(400).json({ error: 'All trade fields are required' });
    }

    // Validate side
    const validSides = ['BUY', 'SELL'];
    if (!validSides.includes(side.toUpperCase())) {
      return res.status(400).json({ error: 'Invalid trade side' });
    }

    // Verify account ownership
    const [accounts] = await pool.query(
      'SELECT id, status FROM accounts WHERE id = ? AND user_id = ?',
      [accountId, req.user.userId]
    );

    if (accounts.length === 0) {
      return res.status(404).json({ error: 'Account not found' });
    }

    const account = accounts[0];
    if (account.status !== 'Active') {
      return res.status(400).json({ error: 'Cannot open trades on inactive account' });
    }

    // Create trade
    const [result] = await pool.query(
      `INSERT INTO trades (account_id, symbol, side, size, entry_price, status) 
       VALUES (?, ?, ?, ?, ?, 'Open')`,
      [accountId, symbol.toUpperCase(), side.toUpperCase(), size, entryPrice]
    );

    res.status(201).json({
      message: 'Trade opened successfully',
      tradeId: result.insertId
    });
  } catch (error) {
    console.error('Trade creation error:', error);
    res.status(500).json({ error: 'Server error creating trade' });
  }
});

// Close trade
router.put('/:tradeId/close', auth, async (req, res) => {
  try {
    const { tradeId } = req.params;
    const { exitPrice } = req.body;

    if (!exitPrice) {
      return res.status(400).json({ error: 'Exit price is required' });
    }

    // Get trade details
    const [trades] = await pool.query(
      `SELECT t.*, a.user_id 
       FROM trades t 
       JOIN accounts a ON t.account_id = a.id 
       WHERE t.id = ?`,
      [tradeId]
    );

    if (trades.length === 0) {
      return res.status(404).json({ error: 'Trade not found' });
    }

    const trade = trades[0];

    // Verify ownership
    if (trade.user_id !== req.user.userId) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    // Calculate P&L
    let pnl = 0;
    if (trade.side === 'BUY') {
      pnl = (exitPrice - trade.entry_price) * trade.size;
    } else {
      pnl = (trade.entry_price - exitPrice) * trade.size;
    }

    // Update trade
    await pool.query(
      `UPDATE trades 
       SET exit_price = ?, pnl = ?, status = 'Closed', closed_at = CURRENT_TIMESTAMP 
       WHERE id = ?`,
      [exitPrice, pnl, tradeId]
    );

    res.json({
      message: 'Trade closed successfully',
      pnl
    });
  } catch (error) {
    console.error('Trade close error:', error);
    res.status(500).json({ error: 'Server error closing trade' });
  }
});

// Get trading metrics
router.get('/metrics', auth, async (req, res) => {
  try {
    const { accountId } = req.query;

    let accountFilter = '';
    const params = [req.user.userId];

    if (accountId) {
      accountFilter = 'AND a.id = ?';
      params.push(accountId);
    }

    const [metrics] = await pool.query(
      `SELECT 
        COUNT(*) as total_trades,
        SUM(CASE WHEN t.status = 'Closed' THEN 1 ELSE 0 END) as closed_trades,
        SUM(CASE WHEN t.status = 'Closed' AND t.pnl > 0 THEN 1 ELSE 0 END) as winning_trades,
        SUM(CASE WHEN t.status = 'Closed' THEN t.pnl ELSE 0 END) as total_pnl,
        AVG(CASE WHEN t.status = 'Closed' THEN t.pnl ELSE NULL END) as avg_pnl,
        MAX(CASE WHEN t.status = 'Closed' THEN t.pnl ELSE NULL END) as max_win,
        MIN(CASE WHEN t.status = 'Closed' THEN t.pnl ELSE NULL END) as max_loss
       FROM trades t
       JOIN accounts a ON t.account_id = a.id
       WHERE a.user_id = ? ${accountFilter}
       AND t.status = 'Closed'`,
      params
    );

    const [winRate] = await pool.query(
      `SELECT 
        (COUNT(*) * 100.0 / NULLIF((SELECT COUNT(*) FROM trades WHERE account_id = t.account_id), 0)) as win_rate
       FROM trades t
       JOIN accounts a ON t.account_id = a.id
       WHERE a.user_id = ? ${accountFilter}
       AND t.status = 'Closed' AND t.pnl > 0
       GROUP BY t.account_id`,
      params
    );

    const overallWinRate = winRate.length > 0 
      ? winRate.reduce((sum, row) => sum + row.win_rate, 0) / winRate.length 
      : 0;

    res.json({
      metrics: metrics[0],
      winRate: overallWinRate.toFixed(1)
    });
  } catch (error) {
    console.error('Metrics fetch error:', error);
    res.status(500).json({ error: 'Server error fetching metrics' });
  }
});

export default router;

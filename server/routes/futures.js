import express from 'express';
import pool from '../config/database.js';
import { auth } from '../middleware/auth.js';
import { getLatestPrice } from '../services/priceFeed.js';
import { ensureUserBalances } from './wallet.js';

const router = express.Router();

const LEVERAGE_OPTIONS = [1, 2, 3, 5, 10, 20, 50, 100, 125];
const PAIRS = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'XRPUSDT', 'DOGEUSDT', 'ADAUSDT'];

async function ensureFuturesTables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS futures_positions (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      symbol VARCHAR(20) NOT NULL,
      side ENUM('LONG','SHORT') NOT NULL,
      size DECIMAL(24,8) NOT NULL,
      entry_price DECIMAL(18,8) NOT NULL,
      mark_price DECIMAL(18,8) NOT NULL DEFAULT 0,
      leverage INT NOT NULL DEFAULT 10,
      margin DECIMAL(18,8) NOT NULL,
      unrealized_pnl DECIMAL(18,8) NOT NULL DEFAULT 0,
      liquidation_price DECIMAL(18,8),
      status ENUM('OPEN','CLOSED') DEFAULT 'OPEN',
      opened_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      closed_at TIMESTAMP NULL,
      realized_pnl DECIMAL(18,8) DEFAULT 0,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS futures_orders (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      symbol VARCHAR(20) NOT NULL,
      side ENUM('BUY','SELL') NOT NULL,
      type ENUM('LIMIT','MARKET') NOT NULL,
      price DECIMAL(18,8),
      quantity DECIMAL(24,8) NOT NULL,
      leverage INT NOT NULL DEFAULT 10,
      status ENUM('NEW','FILLED','CANCELED') DEFAULT 'NEW',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);
  // Ensure futures_balance column exists in user_balances via a separate futures wallet balance
  await pool.query(`
    CREATE TABLE IF NOT EXISTS futures_wallet (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL UNIQUE,
      balance DECIMAL(24,8) NOT NULL DEFAULT 0,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);
}

// GET /api/futures/wallet
router.get('/wallet', auth, async (req, res) => {
  try {
    const userId = req.user.id || req.user.userId;
    await ensureFuturesTables();
    await pool.query('INSERT IGNORE INTO futures_wallet (user_id, balance) VALUES (?,?)', [userId, 0]);
    const [rows] = await pool.query('SELECT balance FROM futures_wallet WHERE user_id = ?', [userId]);
    res.json({ balance: parseFloat(rows[0]?.balance || 0) });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch futures wallet' });
  }
});

// POST /api/futures/transfer  — transfer USDT from spot to futures
router.post('/transfer', auth, async (req, res) => {
  try {
    const userId = req.user.id || req.user.userId;
    const { amount, direction } = req.body; // direction: 'spot_to_futures' | 'futures_to_spot'
    const num = parseFloat(amount);
    if (isNaN(num) || num <= 0) return res.status(400).json({ error: 'Invalid amount' });

    await ensureFuturesTables();
    await ensureUserBalances(userId);
    await pool.query('INSERT IGNORE INTO futures_wallet (user_id, balance) VALUES (?,?)', [userId, 0]);

    if (direction === 'spot_to_futures') {
      const [bal] = await pool.query('SELECT free FROM user_balances WHERE user_id = ? AND asset = ?', [userId, 'USDT']);
      if (!bal.length || parseFloat(bal[0].free) < num) return res.status(400).json({ error: 'Insufficient spot USDT balance' });
      await pool.query('UPDATE user_balances SET free = free - ? WHERE user_id = ? AND asset = ?', [num, userId, 'USDT']);
      await pool.query('UPDATE futures_wallet SET balance = balance + ? WHERE user_id = ?', [num, userId]);
    } else {
      const [fw] = await pool.query('SELECT balance FROM futures_wallet WHERE user_id = ?', [userId]);
      if (!fw.length || parseFloat(fw[0].balance) < num) return res.status(400).json({ error: 'Insufficient futures wallet balance' });
      await pool.query('UPDATE futures_wallet SET balance = balance - ? WHERE user_id = ?', [num, userId]);
      await pool.query('UPDATE user_balances SET free = free + ? WHERE user_id = ? AND asset = ?', [num, userId, 'USDT']);
    }
    res.json({ message: 'Transfer successful' });
  } catch (err) {
    res.status(500).json({ error: 'Transfer failed' });
  }
});

// GET /api/futures/positions
router.get('/positions', auth, async (req, res) => {
  try {
    const userId = req.user.id || req.user.userId;
    await ensureFuturesTables();
    const [positions] = await pool.query(
      `SELECT * FROM futures_positions WHERE user_id = ? AND status = 'OPEN' ORDER BY opened_at DESC`,
      [userId]
    );
    // Attach live mark price and recalculate unrealized PnL
    const enriched = positions.map(p => {
      const lp = getLatestPrice(p.symbol);
      const mark = lp?.ask || parseFloat(p.entry_price);
      const pnlPerUnit = p.side === 'LONG' ? mark - parseFloat(p.entry_price) : parseFloat(p.entry_price) - mark;
      const unrealized = pnlPerUnit * parseFloat(p.size);
      const roe = (unrealized / parseFloat(p.margin)) * 100;
      return { ...p, mark_price: mark, unrealized_pnl: unrealized.toFixed(4), roe: roe.toFixed(2) };
    });
    res.json({ positions: enriched });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch positions' });
  }
});

// POST /api/futures/order  — open a position
router.post('/order', auth, async (req, res) => {
  try {
    const userId = req.user.id || req.user.userId;
    const { symbol, side, quantity, leverage, type, price } = req.body;
    const sym = symbol?.toUpperCase();
    const lev = parseInt(leverage) || 10;
    const qty = parseFloat(quantity);

    if (!sym || !['BUY','SELL'].includes(side?.toUpperCase()) || isNaN(qty) || qty <= 0) {
      return res.status(400).json({ error: 'Invalid order parameters' });
    }
    if (!LEVERAGE_OPTIONS.includes(lev)) return res.status(400).json({ error: 'Invalid leverage' });

    await ensureFuturesTables();
    await pool.query('INSERT IGNORE INTO futures_wallet (user_id, balance) VALUES (?,?)', [userId, 0]);

    const lp = getLatestPrice(sym);
    const baseMap = { BTCUSDT: 67500, ETHUSDT: 3500, SOLUSDT: 155, BNBUSDT: 580, XRPUSDT: 0.55, DOGEUSDT: 0.12, ADAUSDT: 0.45 };
    const entryPrice = (type === 'LIMIT' && price) ? parseFloat(price) : (lp?.ask || baseMap[sym] || 100);
    const notional = entryPrice * qty;
    const margin = notional / lev;

    const [fw] = await pool.query('SELECT balance FROM futures_wallet WHERE user_id = ?', [userId]);
    if (!fw.length || parseFloat(fw[0].balance) < margin) {
      return res.status(400).json({ error: `Insufficient futures wallet balance. Need ${margin.toFixed(2)} USDT margin.` });
    }

    // Deduct margin
    await pool.query('UPDATE futures_wallet SET balance = balance - ? WHERE user_id = ?', [margin, userId]);

    // Calculate liquidation price
    const liqPrice = side.toUpperCase() === 'BUY'
      ? entryPrice * (1 - 1 / lev + 0.005)
      : entryPrice * (1 + 1 / lev - 0.005);

    await pool.query(
      `INSERT INTO futures_positions (user_id, symbol, side, size, entry_price, mark_price, leverage, margin, liquidation_price)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      [userId, sym, side.toUpperCase() === 'BUY' ? 'LONG' : 'SHORT', qty, entryPrice, entryPrice, lev, margin, liqPrice.toFixed(4)]
    );

    await pool.query(
      `INSERT INTO futures_orders (user_id, symbol, side, type, price, quantity, leverage, status)
       VALUES (?,?,?,?,?,?,?,'FILLED')`,
      [userId, sym, side.toUpperCase(), type?.toUpperCase() || 'MARKET', entryPrice, qty, lev]
    );

    res.json({ message: 'Position opened', entryPrice, margin: margin.toFixed(4), leverage: lev });
  } catch (err) {
    console.error('Futures order error:', err);
    res.status(500).json({ error: 'Failed to place futures order' });
  }
});

// POST /api/futures/close/:positionId
router.post('/close/:positionId', auth, async (req, res) => {
  try {
    const userId = req.user.id || req.user.userId;
    const { positionId } = req.params;

    await ensureFuturesTables();
    const [pos] = await pool.query(
      `SELECT * FROM futures_positions WHERE id = ? AND user_id = ? AND status = 'OPEN'`,
      [positionId, userId]
    );
    if (!pos.length) return res.status(404).json({ error: 'Open position not found' });
    const p = pos[0];

    const lp = getLatestPrice(p.symbol);
    const closePrice = lp?.bid || parseFloat(p.entry_price);
    const pnlPerUnit = p.side === 'LONG' ? closePrice - parseFloat(p.entry_price) : parseFloat(p.entry_price) - closePrice;
    const realizedPnl = pnlPerUnit * parseFloat(p.size);
    const fee = parseFloat(p.entry_price) * parseFloat(p.size) * 0.0004;
    const returnAmount = parseFloat(p.margin) + realizedPnl - fee;

    await pool.query(
      `UPDATE futures_positions SET status = 'CLOSED', closed_at = NOW(), realized_pnl = ?, mark_price = ? WHERE id = ?`,
      [realizedPnl.toFixed(4), closePrice, positionId]
    );

    // Return margin + pnl to futures wallet
    if (returnAmount > 0) {
      await pool.query('UPDATE futures_wallet SET balance = balance + ? WHERE user_id = ?', [returnAmount, userId]);
    }

    res.json({ message: 'Position closed', realizedPnl: realizedPnl.toFixed(4), closePrice, returnAmount: returnAmount.toFixed(4) });
  } catch (err) {
    console.error('Close position error:', err);
    res.status(500).json({ error: 'Failed to close position' });
  }
});

// GET /api/futures/history
router.get('/history', auth, async (req, res) => {
  try {
    const userId = req.user.id || req.user.userId;
    await ensureFuturesTables();
    const [rows] = await pool.query(
      `SELECT * FROM futures_positions WHERE user_id = ? ORDER BY opened_at DESC LIMIT 100`,
      [userId]
    );
    res.json({ history: rows });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch futures history' });
  }
});

export default router;

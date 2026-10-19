import express from 'express';
import pool from '../config/database.js';
import { auth } from '../middleware/auth.js';
import { getLatestPrice } from '../services/priceFeed.js';
import { ensureUserBalances } from './wallet.js';

const router = express.Router();

const SUPPORTED = ['USDT', 'BTC', 'ETH', 'SOL', 'BNB', 'XRP', 'DOGE', 'ADA'];

// GET /api/convert/quote?from=BTC&to=USDT&amount=0.1
router.get('/quote', auth, async (req, res) => {
  try {
    const { from, to, amount } = req.query;
    const fromAsset = from?.toUpperCase();
    const toAsset   = to?.toUpperCase();
    const numAmount = parseFloat(amount);

    if (!fromAsset || !toAsset || isNaN(numAmount) || numAmount <= 0) {
      return res.status(400).json({ error: 'from, to and amount are required' });
    }
    if (!SUPPORTED.includes(fromAsset) || !SUPPORTED.includes(toAsset)) {
      return res.status(400).json({ error: 'Unsupported asset pair' });
    }
    if (fromAsset === toAsset) {
      return res.status(400).json({ error: 'Cannot convert same asset' });
    }

    // Prices in USDT
    const priceMap = { USDT: 1 };
    for (const sym of ['BTCUSDT','ETHUSDT','SOLUSDT','BNBUSDT','XRPUSDT','DOGEUSDT','ADAUSDT']) {
      const p = getLatestPrice(sym);
      const asset = sym.replace('USDT','');
      priceMap[asset] = p?.ask || p?.bid || 1;
    }

    const fromUSDT = numAmount * priceMap[fromAsset];
    const fee      = fromUSDT * 0.001; // 0.1% convert fee
    const netUSDT  = fromUSDT - fee;
    const toAmount = netUSDT / priceMap[toAsset];
    const rate     = priceMap[fromAsset] / priceMap[toAsset];

    res.json({
      from: fromAsset,
      to: toAsset,
      fromAmount: numAmount,
      toAmount: parseFloat(toAmount.toFixed(8)),
      rate: parseFloat(rate.toFixed(8)),
      fee: parseFloat(fee.toFixed(4)),
      feeAsset: 'USDT',
      expiresIn: 10, // seconds
    });
  } catch (err) {
    console.error('Convert quote error:', err);
    res.status(500).json({ error: 'Failed to get quote' });
  }
});

// POST /api/convert/execute
router.post('/execute', auth, async (req, res) => {
  try {
    const userId = req.user.id || req.user.userId;
    const { from, to, fromAmount, toAmount } = req.body;
    const fromAsset = from?.toUpperCase();
    const toAsset   = to?.toUpperCase();
    const numFrom   = parseFloat(fromAmount);
    const numTo     = parseFloat(toAmount);

    if (!fromAsset || !toAsset || isNaN(numFrom) || numFrom <= 0 || isNaN(numTo) || numTo <= 0) {
      return res.status(400).json({ error: 'Invalid conversion parameters' });
    }

    await ensureUserBalances(userId);

    const [fromBal] = await pool.query(
      'SELECT free FROM user_balances WHERE user_id = ? AND asset = ?',
      [userId, fromAsset]
    );

    if (!fromBal.length || parseFloat(fromBal[0].free) < numFrom) {
      return res.status(400).json({ error: `Insufficient ${fromAsset} balance` });
    }

    // Deduct from source, add to destination
    await pool.query(
      'UPDATE user_balances SET free = free - ? WHERE user_id = ? AND asset = ?',
      [numFrom, userId, fromAsset]
    );
    await pool.query(
      'INSERT INTO user_balances (user_id, asset, free, locked) VALUES (?, ?, ?, 0) ON DUPLICATE KEY UPDATE free = free + ?',
      [userId, toAsset, numTo, numTo]
    );

    // Record in convert_history table (created on first use)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS convert_history (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        from_asset VARCHAR(20) NOT NULL,
        to_asset VARCHAR(20) NOT NULL,
        from_amount DECIMAL(24,8) NOT NULL,
        to_amount DECIMAL(24,8) NOT NULL,
        rate DECIMAL(24,8) NOT NULL,
        fee DECIMAL(24,8) NOT NULL DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    const priceMap = { USDT: 1 };
    for (const sym of ['BTCUSDT','ETHUSDT','SOLUSDT','BNBUSDT','XRPUSDT','DOGEUSDT','ADAUSDT']) {
      const p = getLatestPrice(sym);
      const asset = sym.replace('USDT','');
      priceMap[asset] = p?.ask || p?.bid || 1;
    }
    const fromUSDT = numFrom * priceMap[fromAsset];
    const fee = fromUSDT * 0.001;
    const rate = priceMap[fromAsset] / priceMap[toAsset];

    await pool.query(
      'INSERT INTO convert_history (user_id, from_asset, to_asset, from_amount, to_amount, rate, fee) VALUES (?,?,?,?,?,?,?)',
      [userId, fromAsset, toAsset, numFrom, numTo, rate, fee]
    );

    res.json({
      message: 'Conversion successful',
      from: fromAsset,
      to: toAsset,
      fromAmount: numFrom,
      toAmount: numTo,
    });
  } catch (err) {
    console.error('Convert execute error:', err);
    res.status(500).json({ error: 'Failed to execute conversion' });
  }
});

// GET /api/convert/history
router.get('/history', auth, async (req, res) => {
  try {
    const userId = req.user.id || req.user.userId;
    await pool.query(`
      CREATE TABLE IF NOT EXISTS convert_history (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        from_asset VARCHAR(20) NOT NULL,
        to_asset VARCHAR(20) NOT NULL,
        from_amount DECIMAL(24,8) NOT NULL,
        to_amount DECIMAL(24,8) NOT NULL,
        rate DECIMAL(24,8) NOT NULL,
        fee DECIMAL(24,8) NOT NULL DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);
    const [rows] = await pool.query(
      'SELECT * FROM convert_history WHERE user_id = ? ORDER BY created_at DESC LIMIT 50',
      [userId]
    );
    res.json({ history: rows });
  } catch (err) {
    console.error('Convert history error:', err);
    res.status(500).json({ error: 'Failed to fetch conversion history' });
  }
});

export default router;

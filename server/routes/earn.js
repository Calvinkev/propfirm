import express from 'express';
import pool from '../config/database.js';
import { auth } from '../middleware/auth.js';
import { ensureUserBalances } from './wallet.js';

const router = express.Router();

const EARN_PRODUCTS = [
  { id: 1, asset: 'USDT', type: 'flexible', apy: 4.5,  minAmount: 1,     maxAmount: 100000 },
  { id: 2, asset: 'USDT', type: 'locked',   apy: 8.2,  minAmount: 100,   maxAmount: 50000,  duration: 30 },
  { id: 3, asset: 'USDT', type: 'locked',   apy: 12.0, minAmount: 100,   maxAmount: 50000,  duration: 90 },
  { id: 4, asset: 'BTC',  type: 'flexible', apy: 1.5,  minAmount: 0.001, maxAmount: 10 },
  { id: 5, asset: 'BTC',  type: 'locked',   apy: 3.2,  minAmount: 0.01,  maxAmount: 5,      duration: 30 },
  { id: 6, asset: 'ETH',  type: 'flexible', apy: 2.8,  minAmount: 0.01,  maxAmount: 100 },
  { id: 7, asset: 'ETH',  type: 'locked',   apy: 5.5,  minAmount: 0.1,   maxAmount: 50,     duration: 30 },
  { id: 8, asset: 'BNB',  type: 'flexible', apy: 3.1,  minAmount: 0.1,   maxAmount: 500 },
  { id: 9, asset: 'SOL',  type: 'flexible', apy: 6.2,  minAmount: 0.5,   maxAmount: 1000 },
];

async function ensureEarnTables(connection) {
  await connection.query(`
    CREATE TABLE IF NOT EXISTS earn_positions (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      product_id INT NOT NULL,
      asset VARCHAR(20) NOT NULL,
      type ENUM('flexible','locked') NOT NULL,
      amount DECIMAL(24,8) NOT NULL,
      apy DECIMAL(6,2) NOT NULL,
      duration INT DEFAULT NULL,
      accrued_interest DECIMAL(24,8) NOT NULL DEFAULT 0,
      status ENUM('active','redeemed') DEFAULT 'active',
      subscribed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      maturity_date TIMESTAMP NULL,
      redeemed_at TIMESTAMP NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);
}

// GET /api/earn/products
router.get('/products', auth, async (req, res) => {
  try {
    res.json({ products: EARN_PRODUCTS });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch earn products' });
  }
});

// GET /api/earn/positions
router.get('/positions', auth, async (req, res) => {
  try {
    const userId = req.user.id || req.user.userId;
    const conn = await pool.getConnection();
    await ensureEarnTables(conn);
    conn.release();

    const [rows] = await pool.query(
      `SELECT * FROM earn_positions WHERE user_id = ? ORDER BY subscribed_at DESC`,
      [userId]
    );

    // Calculate live accrued interest
    const now = Date.now();
    const withInterest = rows.map(r => {
      const msElapsed = now - new Date(r.subscribed_at).getTime();
      const daysElapsed = msElapsed / (1000 * 60 * 60 * 24);
      const dailyRate = parseFloat(r.apy) / 100 / 365;
      const interest = parseFloat(r.amount) * dailyRate * daysElapsed;
      return { ...r, accrued_interest: parseFloat(interest.toFixed(8)) };
    });

    res.json({ positions: withInterest });
  } catch (err) {
    console.error('Earn positions error:', err);
    res.status(500).json({ error: 'Failed to fetch earn positions' });
  }
});

// POST /api/earn/subscribe
router.post('/subscribe', auth, async (req, res) => {
  try {
    const userId = req.user.id || req.user.userId;
    const { productId, amount } = req.body;
    const numAmount = parseFloat(amount);

    const product = EARN_PRODUCTS.find(p => p.id === parseInt(productId));
    if (!product) return res.status(400).json({ error: 'Invalid product' });
    if (isNaN(numAmount) || numAmount < product.minAmount) {
      return res.status(400).json({ error: `Minimum amount is ${product.minAmount} ${product.asset}` });
    }

    await ensureUserBalances(userId);

    const [bal] = await pool.query(
      'SELECT free FROM user_balances WHERE user_id = ? AND asset = ?',
      [userId, product.asset]
    );
    if (!bal.length || parseFloat(bal[0].free) < numAmount) {
      return res.status(400).json({ error: `Insufficient ${product.asset} balance` });
    }

    // Lock in earn
    await pool.query(
      'UPDATE user_balances SET free = free - ?, locked = locked + ? WHERE user_id = ? AND asset = ?',
      [numAmount, numAmount, userId, product.asset]
    );

    const conn = await pool.getConnection();
    await ensureEarnTables(conn);
    conn.release();

    let maturityDate = null;
    if (product.type === 'locked' && product.duration) {
      const d = new Date();
      d.setDate(d.getDate() + product.duration);
      maturityDate = d;
    }

    await pool.query(
      `INSERT INTO earn_positions (user_id, product_id, asset, type, amount, apy, duration, maturity_date)
       VALUES (?,?,?,?,?,?,?,?)`,
      [userId, product.id, product.asset, product.type, numAmount, product.apy, product.duration || null, maturityDate]
    );

    res.json({ message: `Successfully subscribed ${numAmount} ${product.asset} to ${product.type} earn` });
  } catch (err) {
    console.error('Earn subscribe error:', err);
    res.status(500).json({ error: 'Failed to subscribe' });
  }
});

// POST /api/earn/redeem/:positionId
router.post('/redeem/:positionId', auth, async (req, res) => {
  try {
    const userId = req.user.id || req.user.userId;
    const { positionId } = req.params;

    const conn = await pool.getConnection();
    await ensureEarnTables(conn);
    conn.release();

    const [positions] = await pool.query(
      `SELECT * FROM earn_positions WHERE id = ? AND user_id = ? AND status = 'active'`,
      [positionId, userId]
    );

    if (!positions.length) return res.status(404).json({ error: 'Position not found' });
    const pos = positions[0];

    if (pos.type === 'locked' && pos.maturity_date && new Date(pos.maturity_date) > new Date()) {
      return res.status(400).json({ error: 'Locked position has not matured yet' });
    }

    const msElapsed = Date.now() - new Date(pos.subscribed_at).getTime();
    const daysElapsed = msElapsed / (1000 * 60 * 60 * 24);
    const dailyRate = parseFloat(pos.apy) / 100 / 365;
    const interest = parseFloat(pos.amount) * dailyRate * daysElapsed;
    const totalReturn = parseFloat(pos.amount) + interest;

    await pool.query(
      'UPDATE user_balances SET locked = locked - ?, free = free + ? WHERE user_id = ? AND asset = ?',
      [parseFloat(pos.amount), totalReturn, userId, pos.asset]
    );

    await pool.query(
      `UPDATE earn_positions SET status = 'redeemed', redeemed_at = NOW(), accrued_interest = ? WHERE id = ?`,
      [interest.toFixed(8), positionId]
    );

    res.json({ message: 'Redeemed successfully', principal: pos.amount, interest: interest.toFixed(8), total: totalReturn.toFixed(8) });
  } catch (err) {
    console.error('Earn redeem error:', err);
    res.status(500).json({ error: 'Failed to redeem' });
  }
});

export default router;

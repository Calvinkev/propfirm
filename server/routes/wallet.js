import express from 'express';
import pool from '../config/database.js';
import { auth } from '../middleware/auth.js';

const router = express.Router();

const SUPPORTED_ASSETS = ['USDT', 'BTC', 'ETH', 'SOL', 'BNB', 'XRP', 'DOGE', 'ADA'];

// Initialize default zero balances for user if missing
export async function ensureUserBalances(userId) {
  for (const asset of SUPPORTED_ASSETS) {
    const defaultFree = asset === 'USDT' ? 10000.00 : 0.00; // auto-grant 10k USDT demo balance
    await pool.query(
      `INSERT IGNORE INTO user_balances (user_id, asset, free, locked) VALUES (?, ?, ?, 0.00)`,
      [userId, asset, defaultFree]
    );
  }
}

// Get user spot balances
router.get('/balances', auth, async (req, res) => {
  try {
    const userId = req.user.id;
    await ensureUserBalances(userId);

    const [rows] = await pool.query(
      'SELECT asset, free, locked FROM user_balances WHERE user_id = ?',
      [userId]
    );

    res.json({ balances: rows });
  } catch (error) {
    console.error('Wallet balances error:', error);
    res.status(500).json({ error: 'Failed to fetch wallet balances' });
  }
});

// Get deposit address & wallet channels
router.get('/deposit-addresses', auth, async (req, res) => {
  try {
    const [wallets] = await pool.query('SELECT * FROM crypto_wallets WHERE is_active = 1');
    res.json({ wallets });
  } catch (error) {
    console.error('Fetch wallets error:', error);
    res.status(500).json({ error: 'Failed to fetch deposit wallets' });
  }
});

// Submit a deposit request / transaction hash
router.post('/deposit', auth, async (req, res) => {
  try {
    const userId = req.user.id;
    const { coin, network, depositAddress, txHash, amount } = req.body;

    if (!coin || !network || !depositAddress || !txHash || !amount || parseFloat(amount) <= 0) {
      return res.status(400).json({ error: 'All fields including positive amount are required' });
    }

    const [resInsert] = await pool.query(
      `INSERT INTO crypto_deposits (user_id, coin, network, deposit_address, tx_hash, amount, status)
       VALUES (?, ?, ?, ?, ?, ?, 'Pending')`,
      [userId, coin, network, depositAddress, txHash, parseFloat(amount)]
    );

    res.json({ message: 'Deposit submitted for processing', depositId: resInsert.insertId });
  } catch (error) {
    console.error('Deposit submission error:', error);
    res.status(500).json({ error: 'Failed to submit deposit' });
  }
});

// Get deposit history
router.get('/deposits', auth, async (req, res) => {
  try {
    const userId = req.user.id;
    const [deposits] = await pool.query(
      'SELECT * FROM crypto_deposits WHERE user_id = ? ORDER BY created_at DESC',
      [userId]
    );
    res.json({ deposits });
  } catch (error) {
    console.error('Fetch deposits error:', error);
    res.status(500).json({ error: 'Failed to fetch deposits' });
  }
});

// Request a crypto withdrawal
router.post('/withdraw', auth, async (req, res) => {
  try {
    const userId = req.user.id;
    const { coin, network, address, amount } = req.body;
    const numAmount = parseFloat(amount);

    if (!coin || !network || !address || isNaN(numAmount) || numAmount <= 0) {
      return res.status(400).json({ error: 'Invalid withdrawal details' });
    }

    await ensureUserBalances(userId);

    // Check user available free balance
    const [balanceRow] = await pool.query(
      'SELECT free FROM user_balances WHERE user_id = ? AND asset = ?',
      [userId, coin]
    );

    if (balanceRow.length === 0 || parseFloat(balanceRow[0].free) < numAmount) {
      return res.status(400).json({ error: 'Insufficient available balance' });
    }

    const fee = coin === 'USDT' ? 1.0 : 0.0005;

    // Deduct free balance and place into locked state until processed or rejected
    await pool.query(
      'UPDATE user_balances SET free = free - ?, locked = locked + ? WHERE user_id = ? AND asset = ?',
      [numAmount, numAmount, userId, coin]
    );

    const [resInsert] = await pool.query(
      `INSERT INTO crypto_withdrawals (user_id, coin, network, address, amount, fee, status)
       VALUES (?, ?, ?, ?, ?, ?, 'Pending')`,
      [userId, coin, network, address, numAmount, fee]
    );

    res.json({ message: 'Withdrawal request created successfully', withdrawalId: resInsert.insertId });
  } catch (error) {
    console.error('Withdrawal request error:', error);
    res.status(500).json({ error: 'Failed to process withdrawal' });
  }
});

// Get withdrawal history
router.get('/withdrawals', auth, async (req, res) => {
  try {
    const userId = req.user.id;
    const [withdrawals] = await pool.query(
      'SELECT * FROM crypto_withdrawals WHERE user_id = ? ORDER BY created_at DESC',
      [userId]
    );
    res.json({ withdrawals });
  } catch (error) {
    console.error('Fetch withdrawals error:', error);
    res.status(500).json({ error: 'Failed to fetch withdrawals' });
  }
});

export default router;

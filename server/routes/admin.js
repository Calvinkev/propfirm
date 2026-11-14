/**
 * Admin Routes  —  /api/admin
 * All routes require auth + adminOnly middleware.
 *
 * GET  /overview                      — dashboard stats
 * GET  /users                         — list users
 * POST /users                         — create user
 * DELETE /users/:id                   — delete user
 * PUT  /users/:id/balance             — set a user's USDT balance
 * GET  /wallets                       — list deposit wallets
 * POST /wallets                       — add / update deposit wallet
 * PUT  /wallets/:id/toggle            — enable / disable
 * DELETE /wallets/:id                 — remove wallet
 * GET  /deposits                      — all user deposit submissions
 * PUT  /deposits/:id/approve          — approve → create challenge account
 * PUT  /deposits/:id/reject           — reject
 * GET  /withdrawals                   — all withdrawal requests
 * PUT  /withdrawals/:id/approve       — approve + release locked balance
 * PUT  /withdrawals/:id/reject        — reject + return locked balance
 * GET  /quick-trades                  — all quick trades
 * GET  /p2p-orders                    — all P2P orders
 */

import express from 'express';
import bcrypt from 'bcryptjs';
import pool from '../config/database.js';
import { auth, adminOnly } from '../middleware/auth.js';
import cache from '../services/cache.js';

const router = express.Router();
router.use(auth, adminOnly);

// ── 1. Overview ───────────────────────────────────────────────────────────────
router.get('/overview', async (req, res) => {
  try {
    const [[usersCount]]   = await pool.query('SELECT COUNT(*) as count FROM users WHERE role = ?', ['user']);
    const [[depositPending]] = await pool.query("SELECT COUNT(*) as count FROM crypto_deposits WHERE status = 'Pending'");
    const [[withdrawPending]] = await pool.query("SELECT COUNT(*) as count FROM crypto_withdrawals WHERE status = 'Pending'");
    const [[qtStats]] = await pool.query("SELECT COUNT(*) as total, SUM(IF(status='won',profit,0)) as total_profit FROM quick_trades");
    const [[p2pStats]] = await pool.query("SELECT COUNT(*) as total FROM p2p_orders WHERE status = 'completed'");

    // Recent deposits
    const [recentDeposits] = await pool.query(`
      SELECT d.id, d.coin, d.amount, d.status, d.created_at, u.first_name, u.last_name, u.email
      FROM crypto_deposits d JOIN users u ON d.user_id = u.id
      ORDER BY d.created_at DESC LIMIT 8
    `);

    res.json({
      stats: {
        totalUsers:       usersCount.count,
        pendingDeposits:  depositPending.count,
        pendingWithdrawals: withdrawPending.count,
        quickTradesToday: qtStats.total || 0,
        quickTradeProfit: parseFloat(qtStats.total_profit || 0),
        p2pCompleted:     p2pStats.total || 0,
      },
      recentDeposits,
    });
  } catch (err) {
    console.error('Admin overview error:', err);
    res.status(500).json({ error: 'Failed to fetch overview' });
  }
});

// ── 2. Users ──────────────────────────────────────────────────────────────────
router.get('/users', async (req, res) => {
  try {
    const { search } = req.query;
    let where = "WHERE u.role = 'user'";
    const params = [];
    if (search) {
      where += ' AND (u.email LIKE ? OR u.first_name LIKE ? OR u.last_name LIKE ?)';
      const s = `%${search}%`;
      params.push(s, s, s);
    }
    const [users] = await pool.query(
      `SELECT u.id, u.email, u.first_name, u.last_name, u.created_at,
              (SELECT SUM(free+locked) FROM user_balances WHERE user_id = u.id AND asset = 'USDT') AS usdt_balance,
              (SELECT COUNT(*) FROM crypto_deposits WHERE user_id = u.id AND status = 'Pending') AS pending_deposits
       FROM users u ${where}
       ORDER BY u.created_at DESC`,
      params
    );
    res.json({ users });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

router.post('/users', async (req, res) => {
  try {
    const { email, password, firstName, lastName } = req.body;
    if (!email || !password || !firstName || !lastName)
      return res.status(400).json({ error: 'All fields are required' });
    const [ex] = await pool.query('SELECT id FROM users WHERE email = ?', [email.toLowerCase()]);
    if (ex.length) return res.status(400).json({ error: 'Email already in use' });
    const hash = await bcrypt.hash(password, 10);
    const [r] = await pool.query(
      'INSERT INTO users (email, password, first_name, last_name, role) VALUES (?,?,?,?,?)',
      [email.toLowerCase(), hash, firstName, lastName, 'user']
    );
    res.status(201).json({ message: 'User created', userId: r.insertId });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create user' });
  }
});

router.delete('/users/:id', async (req, res) => {
  try {
    const [users] = await pool.query('SELECT role FROM users WHERE id = ?', [req.params.id]);
    if (!users.length) return res.status(404).json({ error: 'User not found' });
    if (users[0].role === 'admin') return res.status(400).json({ error: 'Cannot delete admin accounts' });
    await pool.query('DELETE FROM users WHERE id = ?', [req.params.id]);
    res.json({ message: 'User deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

// Set a user's USDT balance directly
router.put('/users/:id/balance', async (req, res) => {
  try {
    const { balance } = req.body;
    const num = parseFloat(balance);
    if (isNaN(num) || num < 0) return res.status(400).json({ error: 'Invalid balance' });
    await pool.query(
      `INSERT INTO user_balances (user_id, asset, free, locked)
       VALUES (?, 'USDT', ?, 0)
       ON DUPLICATE KEY UPDATE free = ?, locked = 0`,
      [req.params.id, num, num]
    );
    res.json({ message: `USDT balance set to ${num}` });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update balance' });
  }
});

// ── 3. Deposit Wallets ────────────────────────────────────────────────────────
router.get('/wallets', async (req, res) => {
  try {
    const [wallets] = await pool.query('SELECT * FROM crypto_wallets ORDER BY symbol ASC, id ASC');
    res.json({ wallets });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch wallets' });
  }
});

router.post('/wallets', async (req, res) => {
  try {
    const { id, symbol, network, address, instructions, isActive = 1 } = req.body;
    if (!symbol || !network || !address)
      return res.status(400).json({ error: 'Symbol, network and address are required' });
    if (id) {
      await pool.query(
        'UPDATE crypto_wallets SET symbol=?, network=?, address=?, instructions=?, is_active=? WHERE id=?',
        [symbol.toUpperCase(), network, address, instructions || '', isActive ? 1 : 0, id]
      );
      return res.json({ message: 'Wallet updated' });
    }
    const [r] = await pool.query(
      'INSERT INTO crypto_wallets (symbol, network, address, instructions, is_active) VALUES (?,?,?,?,?)',
      [symbol.toUpperCase(), network, address, instructions || '', isActive ? 1 : 0]
    );
    res.status(201).json({ message: 'Wallet added', walletId: r.insertId });
  } catch (err) {
    res.status(500).json({ error: 'Failed to save wallet' });
  }
});

router.put('/wallets/:id/toggle', async (req, res) => {
  try {
    await pool.query('UPDATE crypto_wallets SET is_active = NOT is_active WHERE id = ?', [req.params.id]);
    res.json({ message: 'Wallet toggled' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to toggle wallet' });
  }
});

router.delete('/wallets/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM crypto_wallets WHERE id = ?', [req.params.id]);
    res.json({ message: 'Wallet deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete wallet' });
  }
});

// ── 4. Deposit Approvals ──────────────────────────────────────────────────────
router.get('/deposits', async (req, res) => {
  try {
    const [deposits] = await pool.query(`
      SELECT d.*, u.first_name, u.last_name, u.email
      FROM crypto_deposits d JOIN users u ON d.user_id = u.id
      ORDER BY d.created_at DESC
    `);
    res.json({ deposits });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch deposits' });
  }
});

// Approve deposit — credit USDT balance to user's spot wallet
router.put('/deposits/:id/approve', async (req, res) => {
  try {
    const [[deposit]] = await pool.query('SELECT * FROM crypto_deposits WHERE id = ?', [req.params.id]);
    if (!deposit) return res.status(404).json({ error: 'Deposit not found' });
    if (deposit.status === 'Approved') return res.status(400).json({ error: 'Already approved' });

    await pool.query(
      'UPDATE crypto_deposits SET status = "Approved", approved_at = NOW() WHERE id = ?',
      [req.params.id]
    );

    // Credit amount to user's USDT spot balance
    const amount = parseFloat(deposit.amount);
    await pool.query(
      `INSERT INTO user_balances (user_id, asset, free, locked) VALUES (?, 'USDT', ?, 0)
       ON DUPLICATE KEY UPDATE free = free + ?`,
      [deposit.user_id, amount, amount]
    );

    res.json({ message: `Deposit approved — $${amount} USDT credited to user` });
  } catch (err) {
    console.error('Approve deposit error:', err);
    res.status(500).json({ error: 'Failed to approve deposit' });
  }
});

router.put('/deposits/:id/reject', async (req, res) => {
  try {
    await pool.query('UPDATE crypto_deposits SET status = "Rejected" WHERE id = ?', [req.params.id]);
    res.json({ message: 'Deposit rejected' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to reject deposit' });
  }
});

// ── 5. Withdrawal Management ──────────────────────────────────────────────────
router.get('/withdrawals', async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT w.*, u.first_name, u.last_name, u.email
      FROM crypto_withdrawals w JOIN users u ON w.user_id = u.id
      ORDER BY w.created_at DESC
    `);
    res.json({ withdrawals: rows });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch withdrawals' });
  }
});

// Approve withdrawal — funds already locked, just mark processed
router.put('/withdrawals/:id/approve', async (req, res) => {
  try {
    const [[w]] = await pool.query("SELECT * FROM crypto_withdrawals WHERE id = ? AND status = 'Pending'", [req.params.id]);
    if (!w) return res.status(404).json({ error: 'Pending withdrawal not found' });

    // Deduct from locked balance (funds were locked when request was created)
    await pool.query(
      'UPDATE user_balances SET locked = locked - ? WHERE user_id = ? AND asset = ?',
      [parseFloat(w.amount), w.user_id, w.coin]
    );
    await pool.query(
      "UPDATE crypto_withdrawals SET status = 'Approved', processed_at = NOW() WHERE id = ?",
      [req.params.id]
    );
    res.json({ message: 'Withdrawal approved and processed' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to approve withdrawal' });
  }
});

// Reject withdrawal — return locked funds to free
router.put('/withdrawals/:id/reject', async (req, res) => {
  try {
    const [[w]] = await pool.query("SELECT * FROM crypto_withdrawals WHERE id = ? AND status = 'Pending'", [req.params.id]);
    if (!w) return res.status(404).json({ error: 'Pending withdrawal not found' });

    // Return locked funds to free
    await pool.query(
      'UPDATE user_balances SET locked = locked - ?, free = free + ? WHERE user_id = ? AND asset = ?',
      [parseFloat(w.amount), parseFloat(w.amount), w.user_id, w.coin]
    );
    await pool.query(
      "UPDATE crypto_withdrawals SET status = 'Rejected', processed_at = NOW() WHERE id = ?",
      [req.params.id]
    );
    res.json({ message: 'Withdrawal rejected — funds returned to user' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to reject withdrawal' });
  }
});

// ── 6. Quick Trades ───────────────────────────────────────────────────────────
router.get('/quick-trades', async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT q.*, u.first_name, u.last_name, u.email
      FROM quick_trades q JOIN users u ON q.user_id = u.id
      ORDER BY q.created_at DESC LIMIT 200
    `);
    res.json({ trades: rows });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch quick trades' });
  }
});

// ── 7. P2P Orders ─────────────────────────────────────────────────────────────
router.get('/p2p-orders', async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT o.*,
             b.first_name AS buyer_first, b.last_name AS buyer_last, b.email AS buyer_email,
             s.first_name AS seller_first, s.last_name AS seller_last, s.email AS seller_email
      FROM p2p_orders o
      JOIN users b ON o.buyer_id  = b.id
      JOIN users s ON o.seller_id = s.id
      ORDER BY o.created_at DESC LIMIT 200
    `);
    res.json({ orders: rows });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch P2P orders' });
  }
});

// Resolve disputed P2P order
router.put('/p2p-orders/:id/resolve', async (req, res) => {
  try {
    const { favour } = req.body; // 'buyer' | 'seller'
    const [[order]] = await pool.query(
      "SELECT * FROM p2p_orders WHERE id = ? AND status = 'disputed'",
      [req.params.id]
    );
    if (!order) return res.status(404).json({ error: 'Disputed order not found' });

    const qty = parseFloat(order.crypto_amount);

    if (favour === 'buyer') {
      // Release crypto to buyer
      await pool.query('UPDATE user_balances SET locked = locked - ? WHERE user_id = ? AND asset = ?', [qty, order.seller_id, order.asset]);
      await pool.query(`INSERT INTO user_balances (user_id, asset, free) VALUES (?,?,?) ON DUPLICATE KEY UPDATE free = free + ?`, [order.buyer_id, order.asset, qty, qty]);
    } else {
      // Return crypto to seller
      await pool.query('UPDATE user_balances SET locked = locked - ?, free = free + ? WHERE user_id = ? AND asset = ?', [qty, qty, order.seller_id, order.asset]);
    }

    await pool.query("UPDATE p2p_orders SET status = 'completed' WHERE id = ?", [req.params.id]);
    res.json({ message: `Dispute resolved in favour of ${favour}` });
  } catch (err) {
    res.status(500).json({ error: 'Failed to resolve dispute' });
  }
});

export default router;

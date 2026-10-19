import express from 'express';
import bcrypt from 'bcryptjs';
import pool from '../config/database.js';
import { auth, adminOnly } from '../middleware/auth.js';
import { cacheMiddleware } from '../services/cache.js';
import cache from '../services/cache.js';

const router = express.Router();//to get access to admin routes 

// Apply auth + adminOnly to all admin routes
router.use(auth, adminOnly);

// ── 1. Admin Overview Statistics ───────────────────────────────────────────
router.get('/overview', cacheMiddleware(20), async (req, res) => {
  try {
    const [[usersCount]] = await pool.query('SELECT COUNT(*) as count FROM users');
    const [[accountsCount]] = await pool.query('SELECT COUNT(*) as count FROM accounts');
    const [[activeChallenges]] = await pool.query("SELECT COUNT(*) as count FROM accounts WHERE status IN ('Active', 'Phase 1', 'Phase 2')");
    const [[fundedAccounts]] = await pool.query("SELECT COUNT(*) as count FROM accounts WHERE status = 'Funded'");
    const [[failedAccounts]] = await pool.query("SELECT COUNT(*) as count FROM accounts WHERE status = 'Failed'");
    
    // Revenue calculations (base on account size fee estimations or actual challenge purchases)
    const [[revenueResult]] = await pool.query("SELECT SUM(account_size * 0.015) as total_revenue FROM accounts");
    
    // Payout stats
    const [[payoutStats]] = await pool.query(`
      SELECT 
        COUNT(*) as total_requests,
        SUM(CASE WHEN status = 'Pending' THEN 1 ELSE 0 END) as pending_count,
        SUM(CASE WHEN status = 'Pending' THEN amount ELSE 0 END) as pending_amount,
        SUM(CASE WHEN status = 'Completed' THEN amount ELSE 0 END) as total_paid
      FROM payouts
    `);

    // Recent activity log
    const [recentActivity] = await pool.query(`
      SELECT p.id, p.amount, p.status, p.request_date, 'Payout Request' as action, u.first_name, u.last_name, u.email, a.account_id
      FROM payouts p
      JOIN users u ON p.user_id = u.id
      JOIN accounts a ON p.account_id = a.id
      ORDER BY p.request_date DESC
      LIMIT 10
    `);

    res.json({
      overview: {
        totalUsers: usersCount.count || 0,
        totalAccounts: accountsCount.count || 0,
        activeChallenges: activeChallenges.count || 0,
        fundedAccounts: fundedAccounts.count || 0,
        failedAccounts: failedAccounts.count || 0,
        totalRevenue: parseFloat(revenueResult.total_revenue || 148500),
        payouts: {
          pendingCount: payoutStats.pending_count || 0,
          pendingAmount: parseFloat(payoutStats.pending_amount || 0),
          totalPaid: parseFloat(payoutStats.total_paid || 0),
        }
      },
      recentActivity
    });
  } catch (error) {
    console.error('Admin overview error:', error);
    res.status(500).json({ error: 'Failed to fetch admin overview' });
  }
});

// ── 2. User Management ──────────────────────────────────────────────────────
router.get('/users', async (req, res) => {
  try {
    const { search, role } = req.query;
    let query = `
      SELECT u.id, u.email, u.first_name, u.last_name, u.role, u.created_at,
             COUNT(a.id) as account_count,
             COALESCE(SUM(a.balance), 0) as total_balance
      FROM users u
      LEFT JOIN accounts a ON u.id = a.user_id
    `;
    const params = [];
    const conditions = [];

    if (search) {
      conditions.push('(u.email LIKE ? OR u.first_name LIKE ? OR u.last_name LIKE ?)');
      const s = `%${search}%`;
      params.push(s, s, s);
    }
    if (role) {
      conditions.push('u.role = ?');
      params.push(role);
    }

    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }

    query += ' GROUP BY u.id ORDER BY u.created_at DESC';

    const [users] = await pool.query(query, params);
    res.json({ users });
  } catch (error) {
    console.error('Admin users error:', error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// Create User / Admin
router.post('/users', async (req, res) => {
  try {
    const { email, password, firstName, lastName, role = 'user' } = req.body;
    if (!email || !password || !firstName || !lastName) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    const [existing] = await pool.query('SELECT id FROM users WHERE email = ?', [email.toLowerCase()]);
    if (existing.length > 0) {
      return res.status(400).json({ error: 'User with this email already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const [result] = await pool.query(
      'INSERT INTO users (email, password, first_name, last_name, role) VALUES (?, ?, ?, ?, ?)',
      [email.toLowerCase(), hashedPassword, firstName, lastName, role]
    );

    res.status(201).json({
      message: 'User created successfully',
      user: { id: result.insertId, email: email.toLowerCase(), firstName, lastName, role }
    });
  } catch (error) {
    console.error('Admin create user error:', error);
    res.status(500).json({ error: 'Failed to create user' });
  }
});

// Update User Role
router.put('/users/:id/role', async (req, res) => {
  try {
    const { role } = req.body;
    if (!['user', 'admin'].includes(role)) {
      return res.status(400).json({ error: 'Invalid role' });
    }

    await pool.query('UPDATE users SET role = ? WHERE id = ?', [role, req.params.id]);
    res.json({ message: 'User role updated successfully' });
  } catch (error) {
    console.error('Admin update user role error:', error);
    res.status(500).json({ error: 'Failed to update user role' });
  }
});

// ── 3. Accounts & Challenges Management ─────────────────────────────────────
router.get('/accounts', async (req, res) => {
  try {
    const { status, search } = req.query;
    let query = `
      SELECT a.*, u.email, u.first_name, u.last_name,
             cp.current_profit, cp.daily_loss_used, cp.max_drawdown_used
      FROM accounts a
      JOIN users u ON a.user_id = u.id
      LEFT JOIN challenge_progress cp ON a.id = cp.account_id
    `;
    const params = [];
    const conditions = [];

    if (status && status !== 'All') {
      conditions.push('a.status = ?');
      params.push(status);
    }
    if (search) {
      conditions.push('(a.account_id LIKE ? OR u.email LIKE ? OR u.first_name LIKE ?)');
      const s = `%${search}%`;
      params.push(s, s, s);
    }

    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }

    query += ' ORDER BY a.id DESC';

    const [accounts] = await pool.query(query, params);
    res.json({ accounts });
  } catch (error) {
    console.error('Admin accounts error:', error);
    res.status(500).json({ error: 'Failed to fetch accounts' });
  }
});

// Create/Assign Challenge Account to User
router.post('/accounts', async (req, res) => {
  try {
    const { userId, accountSize = 10000, status = 'Active', phase = 1 } = req.body;
    if (!userId) return res.status(400).json({ error: 'User ID is required' });

    const accountId = `STAKEUP-${Math.floor(10000 + Math.random() * 90000)}`;
    const balance = parseFloat(accountSize);

    const [result] = await pool.query(
      `INSERT INTO accounts 
       (user_id, account_id, account_size, account_type, phase, balance, equity, profit_target, max_daily_loss, max_drawdown, status)
       VALUES (?, ?, ?, 'Evaluation', ?, ?, ?, 10.00, 5.00, 10.00, ?)`,
      [userId, accountId, balance, phase, balance, balance, status]
    );

    await pool.query(
      `INSERT INTO challenge_progress (account_id, profit_target, daily_loss_limit, max_drawdown_limit)
       VALUES (?, 10.00, 5.00, 10.00)`,
      [result.insertId]
    );

    res.status(201).json({ message: 'Account assigned successfully', accountId });
  } catch (error) {
    console.error('Admin create account error:', error);
    res.status(500).json({ error: 'Failed to assign account' });
  }
});

// Modify / Action on Account (Pass Phase, Reset Drawdown, Change Status, Adjust Balance)
router.put('/accounts/:id', async (req, res) => {
  try {
    const { status, balance, resetDrawdown, passPhase } = req.body;
    const accountId = req.params.id;

    if (status) {
      await pool.query('UPDATE accounts SET status = ? WHERE id = ?', [status, accountId]);
    }

    if (balance !== undefined) {
      await pool.query('UPDATE accounts SET balance = ?, equity = ? WHERE id = ?', [balance, balance, accountId]);
    }

    if (resetDrawdown) {
      await pool.query('UPDATE accounts SET daily_loss_used = 0, max_drawdown_used = 0 WHERE id = ?', [accountId]);
      await pool.query('UPDATE challenge_progress SET daily_loss_used = 0, max_drawdown_used = 0 WHERE account_id = ?', [accountId]);
    }

    if (passPhase) {
      const [[acct]] = await pool.query('SELECT phase FROM accounts WHERE id = ?', [accountId]);
      if (acct) {
        const nextPhase = acct.phase >= 2 ? 2 : acct.phase + 1;
        const newStatus = acct.phase >= 2 ? 'Funded' : 'Phase 2';
        await pool.query('UPDATE accounts SET phase = ?, status = ? WHERE id = ?', [nextPhase, newStatus, accountId]);
      }
    }

    res.json({ message: 'Account updated successfully' });
  } catch (error) {
    console.error('Admin update account error:', error);
    res.status(500).json({ error: 'Failed to update account' });
  }
});

// ── 4. Payouts Management ───────────────────────────────────────────────────
router.get('/payouts', async (req, res) => {
  try {
    const { status } = req.query;
    let query = `
      SELECT p.*, u.first_name, u.last_name, u.email, a.account_id, a.account_size
      FROM payouts p
      JOIN users u ON p.user_id = u.id
      JOIN accounts a ON p.account_id = a.id
    `;
    const params = [];
    if (status && status !== 'All') {
      query += ' WHERE p.status = ?';
      params.push(status);
    }
    query += ' ORDER BY p.request_date DESC';

    const [payouts] = await pool.query(query, params);
    res.json({ payouts });
  } catch (error) {
    console.error('Admin payouts error:', error);
    res.status(500).json({ error: 'Failed to fetch payouts' });
  }
});

// Approve Payout
router.put('/payouts/:id/approve', async (req, res) => {
  try {
    const { transactionId = `TX-${Date.now()}` } = req.body;
    await pool.query(
      `UPDATE payouts SET status = 'Completed', processed_date = CURRENT_TIMESTAMP, transaction_id = ? WHERE id = ?`,
      [transactionId, req.params.id]
    );
    res.json({ message: 'Payout approved & processed' });
  } catch (error) {
    console.error('Admin approve payout error:', error);
    res.status(500).json({ error: 'Failed to approve payout' });
  }
});

// Reject Payout
router.put('/payouts/:id/reject', async (req, res) => {
  try {
    await pool.query(`UPDATE payouts SET status = 'Rejected', processed_date = CURRENT_TIMESTAMP WHERE id = ?`, [req.params.id]);
    res.json({ message: 'Payout rejected' });
  } catch (error) {
    console.error('Admin reject payout error:', error);
    res.status(500).json({ error: 'Failed to reject payout' });
  }
});

// ── 5. Trades Inspection ───────────────────────────────────────────────────
router.get('/trades', async (req, res) => {
  try {
    const [trades] = await pool.query(`
      SELECT t.*, a.account_id, u.email, u.first_name, u.last_name
      FROM trades t
      JOIN accounts a ON t.account_id = a.id
      JOIN users u ON a.user_id = u.id
      ORDER BY t.opened_at DESC
      LIMIT 100
    `);
    res.json({ trades });
  } catch (error) {
    console.error('Admin trades error:', error);
    res.status(500).json({ error: 'Failed to fetch trades' });
  }
});

// ── 7. Crypto Wallets & User Deposit Approvals ────────────────────────────────
router.get('/wallets', async (req, res) => {
  try {
    const [wallets] = await pool.query('SELECT * FROM crypto_wallets ORDER BY id ASC');
    res.json({ wallets });
  } catch (error) {
    console.error('Admin fetch wallets error:', error);
    res.status(500).json({ error: 'Failed to fetch wallets' });
  }
});

router.post('/wallets', async (req, res) => {
  try {
    const { id, symbol, network, address, instructions, isActive = 1 } = req.body;
    if (!symbol || !network || !address) {
      return res.status(400).json({ error: 'Symbol, network, and wallet address are required' });
    }

    if (id) {
      await pool.query(
        'UPDATE crypto_wallets SET symbol = ?, network = ?, address = ?, instructions = ?, is_active = ? WHERE id = ?',
        [symbol.toUpperCase(), network, address, instructions || '', isActive ? 1 : 0, id]
      );
      return res.json({ message: 'Wallet updated successfully' });
    }

    const [result] = await pool.query(
      'INSERT INTO crypto_wallets (symbol, network, address, instructions, is_active) VALUES (?, ?, ?, ?, ?)',
      [symbol.toUpperCase(), network, address, instructions || '', isActive ? 1 : 0]
    );

    res.status(201).json({ message: 'Crypto wallet added successfully', walletId: result.insertId });
  } catch (error) {
    console.error('Admin save wallet error:', error);
    res.status(500).json({ error: 'Failed to save wallet' });
  }
});

router.put('/wallets/:id/toggle', async (req, res) => {
  try {
    await pool.query('UPDATE crypto_wallets SET is_active = NOT is_active WHERE id = ?', [req.params.id]);
    res.json({ message: 'Wallet status toggled' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to toggle wallet' });
  }
});

router.delete('/wallets/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM crypto_wallets WHERE id = ?', [req.params.id]);
    res.json({ message: 'Wallet deleted' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete wallet' });
  }
});

// User Crypto Deposit Submissions
router.get('/deposits', async (req, res) => {
  try {
    const [deposits] = await pool.query(`
      SELECT d.*, u.first_name, u.last_name, u.email
      FROM crypto_deposits d
      JOIN users u ON d.user_id = u.id
      ORDER BY d.created_at DESC
    `);
    res.json({ deposits });
  } catch (error) {
    console.error('Admin fetch deposits error:', error);
    res.status(500).json({ error: 'Failed to fetch deposits' });
  }
});

// Approve Crypto Deposit -> Automatically provisions new challenge account!
router.put('/deposits/:id/approve', async (req, res) => {
  try {
    const [[deposit]] = await pool.query('SELECT * FROM crypto_deposits WHERE id = ?', [req.params.id]);
    if (!deposit) return res.status(404).json({ error: 'Deposit submission not found' });
    if (deposit.status === 'Approved') return res.status(400).json({ error: 'Deposit is already approved' });

    // 1. Mark deposit as Approved
    await pool.query('UPDATE crypto_deposits SET status = "Approved", approved_at = CURRENT_TIMESTAMP WHERE id = ?', [req.params.id]);

    // 2. Automatically provision challenge account for trader!
    const accountId = `STAKEUP-${Math.floor(10000 + Math.random() * 90000)}`;
    const balance = parseFloat(deposit.account_size);

    const [accountResult] = await pool.query(
      `INSERT INTO accounts 
       (user_id, account_id, account_size, account_type, phase, balance, equity, profit_target, max_daily_loss, max_drawdown, status)
       VALUES (?, ?, ?, 'Evaluation', 1, ?, ?, 10.00, 5.00, 10.00, 'Active')`,
      [deposit.user_id, accountId, balance, balance, balance]
    );

    await pool.query(
      `INSERT INTO challenge_progress (account_id, profit_target, daily_loss_limit, max_drawdown_limit)
       VALUES (?, 10.00, 5.00, 10.00)`,
      [accountResult.insertId]
    );

    // ── Sync demo account balance to match the selected challenge size ────────
    const [existingDemo] = await pool.query(
      'SELECT id FROM demo_accounts WHERE user_id = ?',
      [deposit.user_id]
    );

    if (existingDemo.length > 0) {
      await pool.query(
        `UPDATE demo_accounts 
         SET balance = ?, equity = ? 
         WHERE user_id = ?`,
        [balance, balance, deposit.user_id]
      );
      await pool.query(
        `INSERT INTO account_snapshots (account_id, balance, equity, margin_used, free_margin)
         VALUES (?, ?, ?, 0, ?)`,
        [existingDemo[0].id, balance, balance, balance]
      );
    } else {
      const [demoResult] = await pool.query(
        `INSERT INTO demo_accounts (user_id, balance, equity, currency, leverage)
         VALUES (?, ?, ?, 'USD', 100)`,
        [deposit.user_id, balance, balance]
      );
      await pool.query(
        `INSERT INTO account_snapshots (account_id, balance, equity, margin_used, free_margin)
         VALUES (?, ?, ?, 0, ?)`,
        [demoResult.insertId, balance, balance, balance]
      );
    }

    res.json({ message: 'Deposit approved & challenge account issued successfully!', accountId });
  } catch (error) {
    console.error('Admin approve deposit error:', error);
    res.status(500).json({ error: 'Failed to approve deposit' });
  }
});

// Reject Deposit
router.put('/deposits/:id/reject', async (req, res) => {
  try {
    await pool.query('UPDATE crypto_deposits SET status = "Rejected" WHERE id = ?', [req.params.id]);
    res.json({ message: 'Deposit rejected' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to reject deposit' });
  }
});

export default router;

import express from 'express';
import pool from '../config/database.js';
import { auth } from '../middleware/auth.js';
import cache from '../services/cache.js';

const router = express.Router();

// Get user profile
router.get('/profile', auth, async (req, res) => {
  try {
    const [users] = await pool.query(
      'SELECT id, email, first_name, last_name, created_at FROM users WHERE id = ?',
      [req.user.userId]
    );

    if (users.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const userData = users[0];

    // Get user's accounts with progress
    const [accounts] = await pool.query(
      `SELECT a.*, cp.current_profit, cp.profit_target, cp.daily_loss_limit, cp.daily_loss_used, 
       cp.max_drawdown_limit, cp.max_drawdown_used, cp.trading_days_required, cp.trading_days_completed
       FROM accounts a 
       LEFT JOIN challenge_progress cp ON a.id = cp.account_id 
       WHERE a.user_id = ? ORDER BY a.start_date DESC`,
      [req.user.userId]
    );

    res.json({
      user: {
        id: userData.id,
        email: userData.email,
        firstName: userData.first_name,
        lastName: userData.last_name,
        createdAt: userData.created_at
      },
      accounts
    });
  } catch (error) {
    console.error('Profile fetch error:', error);
    res.status(500).json({ error: 'Server error fetching profile' });
  }
});

// Update user profile
router.put('/profile', auth, async (req, res) => {
  try {
    const { firstName, lastName } = req.body;

    if (!firstName || !lastName) {
      return res.status(400).json({ error: 'First name and last name are required' });
    }

    await pool.query(
      'UPDATE users SET first_name = ?, last_name = ? WHERE id = ?',
      [firstName, lastName, req.user.userId]
    );

    res.json({ message: 'Profile updated successfully' });
  } catch (error) {
    console.error('Profile update error:', error);
    res.status(500).json({ error: 'Server error updating profile' });
  }
});

// Generate unique account ID
const generateAccountId = () => {
  const prefix = 'STAKEUP';
  const random = Math.floor(10000 + Math.random() * 90000);
  return `${prefix}-${random}`;
};

// Create new challenge account
router.post('/create', auth, async (req, res) => {
  try {
    const { accountSize, accountType } = req.body;

    // Enforce single active challenge rule
    const [activeAccounts] = await pool.query(
      `SELECT id FROM accounts WHERE user_id = ? AND status IN ('Active', 'Phase 1', 'Phase 2')`,
      [req.user.userId]
    );
    if (activeAccounts.length > 0) {
      return res.status(400).json({ error: 'You can only have one active challenge at a time. Please wait until you pass or fail.' });
    }

    const [pendingDeposits] = await pool.query(
      `SELECT id FROM crypto_deposits WHERE user_id = ? AND status = 'Pending'`,
      [req.user.userId]
    );
    if (pendingDeposits.length > 0) {
      return res.status(400).json({ error: 'You already have a pending deposit. Please wait for admin approval.' });
    }

    // Validate account size
    const validSizes = [1000, 2500, 6000, 10000, 100000];
    if (!validSizes.includes(accountSize)) {
      return res.status(400).json({ error: 'Invalid account size' });
    }

    // Validate account type
    const validTypes = ['Challenge', 'Verification', 'Funded'];
    if (!validTypes.includes(accountType)) {
      return res.status(400).json({ error: 'Invalid account type' });
    }

    // Set profit targets based on account size
    let profitTarget;
    if (accountSize === 10000 || accountSize === 100000) {
      profitTarget = 8;
    } else if (accountSize === 6000) {
      profitTarget = 9;
    } else {
      profitTarget = 10;
    }

    // Generate unique account ID
    const accountId = generateAccountId();

    // Create account
    const [result] = await pool.query(
      `INSERT INTO accounts 
       (user_id, account_id, account_size, account_type, balance, equity, profit_target, max_daily_loss, max_drawdown) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [req.user.userId, accountId, accountSize, accountType, accountSize, accountSize, profitTarget, 5, 10]
    );

    // Create challenge progress record
    await pool.query(
      `INSERT INTO challenge_progress 
       (account_id, current_profit, profit_target, daily_loss_limit, daily_loss_used, 
        max_drawdown_limit, max_drawdown_used, trading_days_required, trading_days_completed) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [result.insertId, 0, profitTarget, 5, 0, 10, 0, 5, 0]
    ).catch(err => {
      console.error('Error creating challenge progress:', err);
    });

    // ── Sync demo account balance to match the selected challenge size ────────
    // If user already has a demo account, update its balance to match.
    // If not, create one now — so Trading Desk opens with the right size.
    const [existingDemo] = await pool.query(
      'SELECT id FROM demo_accounts WHERE user_id = ?',
      [req.user.userId]
    );

    if (existingDemo.length > 0) {
      // Update existing demo account balance + equity to match new challenge size
      await pool.query(
        `UPDATE demo_accounts 
         SET balance = ?, equity = ? 
         WHERE user_id = ?`,
        [accountSize, accountSize, req.user.userId]
      );
      // Record a snapshot of the reset balance
      await pool.query(
        `INSERT INTO account_snapshots (account_id, balance, equity, margin_used, free_margin)
         VALUES (?, ?, ?, 0, ?)`,
        [existingDemo[0].id, accountSize, accountSize, accountSize]
      );
    } else {
      // Create demo account for the first time, seeded with challenge balance
      const [demoResult] = await pool.query(
        `INSERT INTO demo_accounts (user_id, balance, equity, currency, leverage)
         VALUES (?, ?, ?, 'USD', 100)`,
        [req.user.userId, accountSize, accountSize]
      );
      await pool.query(
        `INSERT INTO account_snapshots (account_id, balance, equity, margin_used, free_margin)
         VALUES (?, ?, ?, 0, ?)`,
        [demoResult.insertId, accountSize, accountSize, accountSize]
      );
    }

    // Invalidate dashboard cache for this user
    cache.invalidatePrefix(`http:${req.user.userId}:`);

    res.status(201).json({
      message: 'Challenge account created successfully',
      accountId: result.insertId,
      accountNumber: accountId,
      accountSize,
      profitTarget
    });
  } catch (error) {
    console.error('Account creation error:', error);
    res.status(500).json({ error: 'Server error creating account' });
  }
});

// Fetch Active Admin Crypto Wallets for Checkout
router.get('/crypto-wallets', auth, async (req, res) => {
  try {
    const [wallets] = await pool.query('SELECT * FROM crypto_wallets WHERE is_active = 1 ORDER BY id ASC');
    res.json({ wallets });
  } catch (error) {
    console.error('Fetch crypto wallets error:', error);
    res.status(500).json({ error: 'Failed to fetch payment wallets' });
  }
});

// Trader Submit Crypto Deposit & Purchase Request
router.post('/crypto-deposit', auth, async (req, res) => {
  try {
    const { accountSize, feeAmount, platform, coin, network, depositAddress, txHash } = req.body;
    
    // Enforce single active challenge rule
    const [activeAccounts] = await pool.query(
      `SELECT id FROM accounts WHERE user_id = ? AND status IN ('Active', 'Phase 1', 'Phase 2')`,
      [req.user.userId]
    );
    if (activeAccounts.length > 0) {
      return res.status(400).json({ error: 'You can only have one active challenge at a time. Please wait until you pass or fail.' });
    }

    const [pendingDeposits] = await pool.query(
      `SELECT id FROM crypto_deposits WHERE user_id = ? AND status = 'Pending'`,
      [req.user.userId]
    );
    if (pendingDeposits.length > 0) {
      return res.status(400).json({ error: 'You already have a pending deposit. Please wait for admin approval.' });
    }

    if (!accountSize || !feeAmount || !coin || !network || !depositAddress || !txHash) {
      return res.status(400).json({ error: 'All payment fields and transaction hash are required' });
    }

    const [result] = await pool.query(
      `INSERT INTO crypto_deposits 
       (user_id, account_size, fee_amount, platform, coin, network, deposit_address, tx_hash, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Pending')`,
      [req.user.userId, accountSize, feeAmount, platform || 'MetaTrader 5', coin, network, depositAddress, txHash]
    );

    res.status(201).json({
      message: 'Crypto deposit submitted successfully! Awaiting admin confirmation.',
      depositId: result.insertId
    });
  } catch (error) {
    console.error('Submit crypto deposit error:', error);
    res.status(500).json({ error: 'Failed to submit crypto deposit' });
  }
});

// Get account details with progress
router.get('/:accountId', auth, async (req, res) => {
  try {
    const { accountId } = req.params;

    const [accounts] = await pool.query(
      `SELECT a.*, cp.current_profit, cp.profit_target, cp.daily_loss_limit, cp.daily_loss_used, 
       cp.max_drawdown_limit, cp.max_drawdown_used, cp.trading_days_required, cp.trading_days_completed
       FROM accounts a 
       LEFT JOIN challenge_progress cp ON a.id = cp.account_id 
       WHERE a.id = ? AND a.user_id = ?`,
      [accountId, req.user.userId]
    );

    if (accounts.length === 0) {
      return res.status(404).json({ error: 'Account not found' });
    }

    // Get trades for this account
    const [trades] = await pool.query(
      'SELECT * FROM trades WHERE account_id = ? ORDER BY opened_at DESC',
      [accountId]
    );

    res.json({
      account: accounts[0],
      trades
    });
  } catch (error) {
    console.error('Account fetch error:', error);
    res.status(500).json({ error: 'Server error fetching account' });
  }
});

// Update challenge progress
router.put('/:accountId/progress', auth, async (req, res) => {
  try {
    const { accountId } = req.params;
    const { currentProfit, dailyLossUsed, maxDrawdownUsed, tradingDaysCompleted } = req.body;

    // Verify account ownership
    const [accounts] = await pool.query(
      'SELECT id FROM accounts WHERE id = ? AND user_id = ?',
      [accountId, req.user.userId]
    );

    if (accounts.length === 0) {
      return res.status(404).json({ error: 'Account not found' });
    }

    // Update progress
    await pool.query(
      `UPDATE challenge_progress 
       SET current_profit = ?, daily_loss_used = ?, max_drawdown_used = ?, trading_days_completed = ?
       WHERE account_id = ?`,
      [currentProfit, dailyLossUsed, maxDrawdownUsed, tradingDaysCompleted, accountId]
    );

    // Check if challenge is passed or breached
    const [progress] = await pool.query(
      'SELECT * FROM challenge_progress WHERE account_id = ?',
      [accountId]
    );

    const prog = progress[0];
    let accountStatus = 'Active';

    // Check breach conditions
    if (prog.daily_loss_used >= prog.daily_loss_limit || prog.max_drawdown_used >= prog.max_drawdown_limit) {
      accountStatus = 'Breached';
    } else if (prog.current_profit >= prog.profit_target && prog.trading_days_completed >= prog.trading_days_required) {
      accountStatus = 'Passed';
    }

    // Update account status and equity
    await pool.query(
      'UPDATE accounts SET status = ?, equity = balance + ? WHERE id = ?',
      [accountStatus, currentProfit, accountId]
    );

    // Notify WebSocket subscribers of the update
    const { sendAccountUpdate } = await import('../websocket/server.js');
    sendAccountUpdate(accountId, {
      current_profit: prog.current_profit,
      profit_target: prog.profit_target,
      daily_loss_limit: prog.daily_loss_limit,
      daily_loss_used: prog.daily_loss_used,
      max_drawdown_limit: prog.max_drawdown_limit,
      max_drawdown_used: prog.max_drawdown_used,
      trading_days_required: prog.trading_days_required,
      trading_days_completed: prog.trading_days_completed
    });

    // Invalidate dashboard cache for this user
    cache.invalidatePrefix(`http:${req.user.userId}:`);

    res.json({
      message: 'Progress updated successfully',
      status: accountStatus
    });
  } catch (error) {
    console.error('Progress update error:', error);
    res.status(500).json({ error: 'Server error updating progress' });
  }
});



export default router;

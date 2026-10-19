import express from 'express';
import pool from '../config/database.js';
import { auth } from '../middleware/auth.js';
import { payoutLimiter } from '../middleware/rateLimiter.js';
import { cacheMiddleware } from '../services/cache.js';
import cache from '../services/cache.js';

const router = express.Router();

// ── Payout Configuration ─────────────────────────────────────────────────────
// Trader keeps 80% of net profit; firm retains 20%.
// Minimum payout: $50
// Must have traded ≥ 5 days in the current billing cycle.
// Account must be "Funded" with no active breaches.
const PROFIT_SPLIT_TRADER = 0.80;   // 80% to trader
const MIN_PAYOUT_AMOUNT   = 50;     // USD
const MIN_TRADING_DAYS    = 5;

// ── GET /api/payouts/history ─────────────────────────────────────────────────
router.get('/history', auth, cacheMiddleware(15), async (req, res) => {
  try {
    const { status, limit = 50, offset = 0 } = req.query;

    let whereClause = 'p.user_id = ?';
    const params = [req.user.userId];

    if (status) {
      whereClause += ' AND p.status = ?';
      params.push(status);
    }

    const [payouts] = await pool.query(
      `SELECT 
        p.id,
        p.request_date,
        p.amount,
        p.gross_profit,
        p.profit_split_pct,
        p.status,
        p.processed_date,
        p.method,
        p.transaction_id,
        a.account_id,
        a.account_size
       FROM payouts p
       JOIN accounts a ON p.account_id = a.id
       WHERE ${whereClause}
       ORDER BY p.request_date DESC
       LIMIT ? OFFSET ?`,
      [...params, parseInt(limit), parseInt(offset)]
    );

    // Get payout statistics
    const [stats] = await pool.query(
      `SELECT 
        COUNT(*) as total_requests,
        SUM(CASE WHEN p.status = 'Completed' THEN p.amount ELSE 0 END) as total_paid,
        SUM(CASE WHEN p.status = 'Pending' THEN p.amount ELSE 0 END) as pending_amount
       FROM payouts p
       JOIN accounts a ON p.account_id = a.id
       WHERE a.user_id = ?`,
      [req.user.userId]
    );

    res.json({
      payouts,
      statistics: stats[0] || {
        total_requests: 0,
        total_paid: 0,
        pending_amount: 0
      }
    });
  } catch (error) {
    console.error('Payout history fetch error:', error);
    res.status(500).json({ error: 'Server error fetching payout history' });
  }
});

// ── GET /api/payouts/eligibility ─────────────────────────────────────────────
// Returns payout eligibility status for all funded accounts.
router.get('/eligibility', auth, async (req, res) => {
  try {
    // Fetch all funded accounts with challenge progress
    const [fundedAccounts] = await pool.query(
      `SELECT a.id, a.account_id, a.account_size, a.balance, a.equity,
              cp.current_profit, cp.trading_days_completed,
              cp.daily_loss_used, cp.daily_loss_limit,
              cp.max_drawdown_used, cp.max_drawdown_limit
       FROM accounts a
       LEFT JOIN challenge_progress cp ON a.id = cp.account_id
       WHERE a.user_id = ? AND a.status = 'Funded'`,
      [req.user.userId]
    );

    // Check for any pending payouts per account
    const [pendingPayouts] = await pool.query(
      `SELECT account_id FROM payouts WHERE user_id = ? AND status = 'Pending'`,
      [req.user.userId]
    );
    const pendingAccountIds = new Set(pendingPayouts.map(p => p.account_id));

    // Sum of already-paid amounts per account (to deduct from available profit)
    const [paidTotals] = await pool.query(
      `SELECT account_id, SUM(amount) as total_paid
       FROM payouts
       WHERE user_id = ? AND status IN ('Completed', 'Pending')
       GROUP BY account_id`,
      [req.user.userId]
    );
    const paidMap = new Map(paidTotals.map(p => [p.account_id, parseFloat(p.total_paid)]));

    const eligibility = fundedAccounts.map(acct => {
      const currentProfit  = parseFloat(acct.current_profit || 0);
      const dailyLossUsed  = parseFloat(acct.daily_loss_used || 0);
      const dailyLossLimit = parseFloat(acct.daily_loss_limit || 5);
      const maxDDUsed      = parseFloat(acct.max_drawdown_used || 0);
      const maxDDLimit     = parseFloat(acct.max_drawdown_limit || 10);
      const tradingDays    = parseInt(acct.trading_days_completed || 0);
      const accountSize    = parseFloat(acct.account_size);

      // Dollar profit = percentage * account size / 100
      const dollarProfit = (currentProfit / 100) * accountSize;
      const alreadyPaid  = paidMap.get(acct.id) || 0;

      // Trader's share of remaining profit
      const traderShare        = dollarProfit * PROFIT_SPLIT_TRADER;
      const withdrawableAmount = Math.max(0, traderShare - alreadyPaid);

      const hasBreach       = dailyLossUsed >= dailyLossLimit || maxDDUsed >= maxDDLimit;
      const hasTradingDays  = tradingDays >= MIN_TRADING_DAYS;
      const hasMinAmount    = withdrawableAmount >= MIN_PAYOUT_AMOUNT;
      const hasPendingPayout = pendingAccountIds.has(acct.id);

      const isEligible = !hasBreach && hasTradingDays && hasMinAmount && !hasPendingPayout;

      const reasons = [];
      if (hasBreach)        reasons.push('Account has active rule breach');
      if (!hasTradingDays)  reasons.push(`Need ${MIN_TRADING_DAYS} trading days (have ${tradingDays})`);
      if (!hasMinAmount)    reasons.push(`Minimum withdrawable is $${MIN_PAYOUT_AMOUNT} (available: $${withdrawableAmount.toFixed(2)})`);
      if (hasPendingPayout) reasons.push('A payout is already pending for this account');

      return {
        accountId:          acct.id,
        accountNumber:      acct.account_id,
        accountSize,
        currentProfitPct:   currentProfit,
        dollarProfit:       parseFloat(dollarProfit.toFixed(2)),
        profitSplit:        `${PROFIT_SPLIT_TRADER * 100}%`,
        traderShare:        parseFloat(traderShare.toFixed(2)),
        alreadyPaid:        parseFloat(alreadyPaid.toFixed(2)),
        withdrawableAmount: parseFloat(withdrawableAmount.toFixed(2)),
        tradingDays,
        isEligible,
        reasons,
      };
    });

    res.json({ eligibility, config: { profitSplit: PROFIT_SPLIT_TRADER, minPayout: MIN_PAYOUT_AMOUNT, minTradingDays: MIN_TRADING_DAYS } });
  } catch (error) {
    console.error('Payout eligibility error:', error);
    res.status(500).json({ error: 'Server error checking payout eligibility' });
  }
});

// ── POST /api/payouts/request ────────────────────────────────────────────────
router.post('/request', auth, payoutLimiter, async (req, res) => {
  try {
    const { accountId, amount, method } = req.body;

    if (!accountId || !amount || !method) {
      return res.status(400).json({ error: 'Account ID, amount, and payout method are required' });
    }

    const requestedAmount = parseFloat(amount);
    if (isNaN(requestedAmount) || requestedAmount <= 0) {
      return res.status(400).json({ error: 'Amount must be a positive number' });
    }

    if (requestedAmount < MIN_PAYOUT_AMOUNT) {
      return res.status(400).json({ error: `Minimum payout is $${MIN_PAYOUT_AMOUNT}` });
    }

    // Validate method
    const validMethods = ['Crypto', 'Bank Transfer', 'PayPal', 'Stripe'];
    if (!validMethods.includes(method)) {
      return res.status(400).json({ error: 'Invalid payout method' });
    }

    // Verify account ownership + funded status
    const [accounts] = await pool.query(
      `SELECT a.*, cp.current_profit, cp.trading_days_completed,
              cp.daily_loss_used, cp.daily_loss_limit,
              cp.max_drawdown_used, cp.max_drawdown_limit
       FROM accounts a
       LEFT JOIN challenge_progress cp ON a.id = cp.account_id
       WHERE a.id = ? AND a.user_id = ? AND a.status = 'Funded'`,
      [accountId, req.user.userId]
    );

    if (accounts.length === 0) {
      return res.status(404).json({ error: 'Funded account not found or you do not own it' });
    }

    const account = accounts[0];

    // ── Rule Checks ──────────────────────────────────────────────────────────
    const dailyLossUsed  = parseFloat(account.daily_loss_used || 0);
    const dailyLossLimit = parseFloat(account.daily_loss_limit || 5);
    const maxDDUsed      = parseFloat(account.max_drawdown_used || 0);
    const maxDDLimit     = parseFloat(account.max_drawdown_limit || 10);

    if (dailyLossUsed >= dailyLossLimit || maxDDUsed >= maxDDLimit) {
      return res.status(400).json({ error: 'Cannot request payout — account has an active rule breach.' });
    }

    const tradingDays = parseInt(account.trading_days_completed || 0);
    if (tradingDays < MIN_TRADING_DAYS) {
      return res.status(400).json({ error: `Must have at least ${MIN_TRADING_DAYS} trading days to request payout (currently ${tradingDays}).` });
    }

    // ── Profit Split Calculation ──────────────────────────────────────────────
    const currentProfitPct = parseFloat(account.current_profit || 0);
    const accountSize      = parseFloat(account.account_size);
    const dollarProfit     = (currentProfitPct / 100) * accountSize;
    const traderShare      = dollarProfit * PROFIT_SPLIT_TRADER;

    // Deduct already paid/pending amounts
    const [[paidRow]] = await pool.query(
      `SELECT COALESCE(SUM(amount), 0) as total FROM payouts
       WHERE account_id = ? AND status IN ('Completed', 'Pending')`,
      [accountId]
    );
    const alreadyPaid     = parseFloat(paidRow.total);
    const availableAmount = Math.max(0, traderShare - alreadyPaid);

    if (requestedAmount > availableAmount) {
      return res.status(400).json({
        error: `Requested $${requestedAmount.toFixed(2)} exceeds withdrawable balance of $${availableAmount.toFixed(2)} (${PROFIT_SPLIT_TRADER * 100}% of $${dollarProfit.toFixed(2)} profit, minus $${alreadyPaid.toFixed(2)} already withdrawn).`
      });
    }

    // ── Duplicate check ──────────────────────────────────────────────────────
    const [existingPayouts] = await pool.query(
      `SELECT id FROM payouts WHERE account_id = ? AND status = 'Pending'`,
      [accountId]
    );
    if (existingPayouts.length > 0) {
      return res.status(400).json({ error: 'A payout request is already pending for this account' });
    }

    // ── Create payout ────────────────────────────────────────────────────────
    const [result] = await pool.query(
      `INSERT INTO payouts (user_id, account_id, amount, gross_profit, profit_split_pct, method, status, request_date) 
       VALUES (?, ?, ?, ?, ?, ?, 'Pending', CURRENT_TIMESTAMP)`,
      [req.user.userId, accountId, requestedAmount, dollarProfit, PROFIT_SPLIT_TRADER * 100, method]
    );

    // Invalidate cache
    cache.invalidatePrefix(`http:${req.user.userId}:`);

    res.status(201).json({
      message: 'Payout request submitted successfully',
      payoutId: result.insertId,
      amount: requestedAmount,
      profitSplit: `${PROFIT_SPLIT_TRADER * 100}%`,
      method
    });
  } catch (error) {
    console.error('Payout request error:', error);
    res.status(500).json({ error: 'Server error creating payout request' });
  }
});

// ── GET /api/payouts/:payoutId ───────────────────────────────────────────────
router.get('/:payoutId', auth, async (req, res) => {
  try {
    const { payoutId } = req.params;

    const [payouts] = await pool.query(
      `SELECT p.*, a.account_id, a.account_size, a.account_type
       FROM payouts p
       JOIN accounts a ON p.account_id = a.id
       WHERE p.id = ? AND p.user_id = ?`,
      [payoutId, req.user.userId]
    );

    if (payouts.length === 0) {
      return res.status(404).json({ error: 'Payout not found' });
    }

    res.json({ payout: payouts[0] });
  } catch (error) {
    console.error('Payout details fetch error:', error);
    res.status(500).json({ error: 'Server error fetching payout details' });
  }
});

// ── PUT /api/payouts/:payoutId/cancel ────────────────────────────────────────
router.put('/:payoutId/cancel', auth, async (req, res) => {
  try {
    const { payoutId } = req.params;

    const [result] = await pool.query(
      `UPDATE payouts 
       SET status = 'Cancelled' 
       WHERE id = ? AND user_id = ? AND status = 'Pending'`,
      [payoutId, req.user.userId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Payout not found or cannot be cancelled' });
    }

    // Invalidate cache
    cache.invalidatePrefix(`http:${req.user.userId}:`);

    res.json({ message: 'Payout cancelled successfully' });
  } catch (error) {
    console.error('Payout cancel error:', error);
    res.status(500).json({ error: 'Server error cancelling payout' });
  }
});

export default router;

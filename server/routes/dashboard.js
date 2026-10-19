import express from 'express';
import pool from '../config/database.js';
import { auth } from '../middleware/auth.js';
import { cacheMiddleware } from '../services/cache.js';

const router = express.Router();

// Get dashboard overview data
router.get('/overview', auth, cacheMiddleware(30), async (req, res) => {
  try {
    const userId = req.user.userId;

    // Get account counts by status
    const [statusCounts] = await pool.query(
      `SELECT status, COUNT(*) as count 
       FROM accounts 
       WHERE user_id = ? 
       GROUP BY status`,
      [userId]
    );

    // Get total P&L across all accounts
    const [totalPnL] = await pool.query(
      `SELECT SUM(t.pnl) as total_pnl, COUNT(*) as trade_count
       FROM trades t
       JOIN accounts a ON t.account_id = a.id
       WHERE a.user_id = ? AND t.status = 'Closed'`,
      [userId]
    );

    // Get recent activity
    const [recentActivity] = await pool.query(
      `(SELECT 'trade' as type, t.symbol, t.pnl, t.opened_at as timestamp
       FROM trades t
       JOIN accounts a ON t.account_id = a.id
       WHERE a.user_id = ? AND t.status = 'Closed'
       ORDER BY t.closed_at DESC
       LIMIT 10)
       UNION ALL
       (SELECT 'account' as type, CONCAT('$', a2.account_size) as symbol, 
              CASE WHEN a2.status = 'Passed' THEN a2.profit_target ELSE 0 END as pnl,
              a2.end_date as timestamp
       FROM accounts a2
       WHERE a2.user_id = ? AND a2.end_date IS NOT NULL
       ORDER BY a2.end_date DESC
       LIMIT 5)
       ORDER BY timestamp DESC
       LIMIT 15`,
      [userId, userId]
    );

    // Get challenge completion rate
    const [challengeStats] = await pool.query(
      `SELECT 
        COUNT(*) as total_challenges,
        SUM(CASE WHEN status = 'Passed' THEN 1 ELSE 0 END) as passed_challenges,
        SUM(CASE WHEN status = 'Breached' THEN 1 ELSE 0 END) as breached_challenges
       FROM accounts
       WHERE user_id = ? AND account_type = 'Challenge'`,
      [userId]
    );

    const stats = challengeStats[0] || {};
    const passRate = stats.total_challenges > 0 
      ? ((stats.passed_challenges / stats.total_challenges) * 100).toFixed(1) 
      : 0;

    res.json({
      overview: {
        totalAccounts: statusCounts.reduce((sum, row) => sum + row.count, 0),
        activeAccounts: statusCounts.find(r => r.status === 'Active')?.count || 0,
        passedAccounts: statusCounts.find(r => r.status === 'Passed')?.count || 0,
        breachedAccounts: statusCounts.find(r => r.status === 'Breached')?.count || 0,
        totalPnL: totalPnL[0]?.total_pnl || 0,
        totalTrades: totalPnL[0]?.trade_count || 0,
        challengePassRate: parseFloat(passRate)
      },
      recentActivity: recentActivity,
      challengeStats: stats
    });
  } catch (error) {
    console.error('Dashboard overview fetch error:', error);
    res.status(500).json({ error: 'Server error fetching dashboard overview' });
  }
});

// Get account performance history
router.get('/account-performance/:accountId', auth, cacheMiddleware(15), async (req, res) => {
  try {
    const { accountId } = req.params;

    // Verify ownership
    const [accounts] = await pool.query(
      'SELECT id FROM accounts WHERE id = ? AND user_id = ?',
      [accountId, req.user.userId]
    );

    if (accounts.length === 0) {
      return res.status(404).json({ error: 'Account not found' });
    }

    // Get daily P&L history
    const [dailyPnL] = await pool.query(
      `SELECT 
        DATE(t.closed_at) as date,
        SUM(t.pnl) as daily_pnl,
        COUNT(*) as trade_count
       FROM trades t
       WHERE t.account_id = ? AND t.status = 'Closed'
       GROUP BY DATE(t.closed_at)
       ORDER BY date DESC
       LIMIT 30`,
      [accountId]
    );

    // Get equity curve data
    const [equityCurve] = await pool.query(
      `SELECT 
        DATE(t.closed_at) as date,
        SUM(t.pnl) as cumulative_pnl,
        (SELECT balance FROM accounts WHERE id = ?) + SUM(t.pnl) as equity
       FROM trades t
       WHERE t.account_id = ? AND t.status = 'Closed'
       GROUP BY DATE(t.closed_at)
       ORDER BY date ASC
       LIMIT 30`,
      [accountId, accountId]
    );

    // Get win rate
    const [winStats] = await pool.query(
      `SELECT 
        COUNT(*) as total_trades,
        SUM(CASE WHEN pnl > 0 THEN 1 ELSE 0 END) as winning_trades
       FROM trades
       WHERE account_id = ? AND status = 'Closed'`,
      [accountId]
    );

    const winRate = winStats[0]?.total_trades > 0 
      ? ((winStats[0].winning_trades / winStats[0].total_trades) * 100).toFixed(1) 
      : 0;

    res.json({
      dailyPnL,
      equityCurve,
      statistics: {
        totalTrades: winStats[0]?.total_trades || 0,
        winningTrades: winStats[0]?.winning_trades || 0,
        winRate: parseFloat(winRate)
      }
    });
  } catch (error) {
    console.error('Account performance fetch error:', error);
    res.status(500).json({ error: 'Server error fetching account performance' });
  }
});

// Get user activity log
router.get('/activity', auth, async (req, res) => {
  try {
    const { limit = 50, offset = 0 } = req.query;

    const [activities] = await pool.query(
      `(SELECT 
        'trade_opened' as type,
        t.symbol as symbol,
        CONCAT(t.side, ' ', t.size, ' ', t.symbol) as description,
        t.opened_at as timestamp
       FROM trades t
       JOIN accounts a ON t.account_id = a.id
       WHERE a.user_id = ? AND t.status = 'Open')
       UNION ALL
       (SELECT 'trade_closed' as type,
        t2.symbol as symbol,
        CONCAT(t2.side, ' ', t2.size, ' P&L: $', ABS(t2.pnl)) as description,
        t2.closed_at as timestamp
       FROM trades t2
       JOIN accounts a2 ON t2.account_id = a2.id
       WHERE a2.user_id = ? AND t2.status = 'Closed')
       UNION ALL
       (SELECT 'account_created' as type,
        a3.account_id as symbol,
        CONCAT('$', a3.account_size, ' ', a3.account_type) as description,
        a3.start_date as timestamp
       FROM accounts a3
       WHERE a3.user_id = ?)
       UNION ALL
       (SELECT 'account_status_changed' as type,
        a4.account_id as symbol,
        CONCAT('Status: ', a4.status) as description,
        a4.start_date as timestamp
       FROM accounts a4
       WHERE a4.user_id = ? AND a4.start_date > DATE_SUB(NOW(), INTERVAL 7 DAY))
       ORDER BY timestamp DESC
       LIMIT ? OFFSET ?`,
      [req.user.userId, req.user.userId, req.user.userId, req.user.userId, parseInt(limit), parseInt(offset)]
    );

    res.json({ activities });
  } catch (error) {
    console.error('Activity log fetch error:', error);
    res.status(500).json({ error: 'Server error fetching activity log' });
  }
});

// Get challenge completion history
router.get('/challenge-history', auth, cacheMiddleware(30), async (req, res) => {
  try {
    const userId = req.user.userId;

    const [challenges] = await pool.query(
      `SELECT 
        a.id,
        a.account_id,
        a.account_size,
        a.account_type,
        a.phase,
        a.status,
        a.start_date,
        a.end_date,
        cp.current_profit,
        cp.profit_target,
        cp.daily_loss_used,
        cp.max_drawdown_used,
        cp.trading_days_completed
       FROM accounts a
       LEFT JOIN challenge_progress cp ON a.id = cp.account_id
       WHERE a.user_id = ? AND a.account_type IN ('Challenge', 'Verification')
       ORDER BY a.start_date DESC`,
      [userId]
    );

    res.json({ challenges });
  } catch (error) {
    console.error('Challenge history fetch error:', error);
    res.status(500).json({ error: 'Server error fetching challenge history' });
  }
});

// Get trading statistics
router.get('/trading-stats', auth, cacheMiddleware(15), async (req, res) => {
  try {
    const { accountId } = req.query;

    let whereClause = 'a.user_id = ?';
    const params = [req.user.userId];

    if (accountId) {
      whereClause += ' AND a.id = ?';
      params.push(accountId);
    }

    const [stats] = await pool.query(
      `SELECT 
        COUNT(*) as total_trades,
        SUM(CASE WHEN pnl > 0 THEN 1 ELSE 0 END) as winning_trades,
        SUM(CASE WHEN pnl < 0 THEN 1 ELSE 0 END) as losing_trades,
        SUM(pnl) as total_pnl,
        AVG(pnl) as avg_pnl,
        MAX(pnl) as best_trade,
        MIN(pnl) as worst_trade
       FROM trades t
       JOIN accounts a ON t.account_id = a.id
       WHERE ${whereClause} AND t.status = 'Closed'`,
      params
    );

    const [symbolStats] = await pool.query(
      `SELECT 
        symbol,
        COUNT(*) as trade_count,
        SUM(pnl) as total_pnl,
        AVG(pnl) as avg_pnl,
        SUM(CASE WHEN pnl > 0 THEN 1 ELSE 0 END) as winning_trades
       FROM trades t
       JOIN accounts a ON t.account_id = a.id
       WHERE ${whereClause} AND t.status = 'Closed'
       GROUP BY symbol
       ORDER BY total_pnl DESC`,
      params
    );

    const data = stats[0] || {};
    const winRate = data.total_trades > 0 
      ? ((data.winning_trades / data.total_trades) * 100).toFixed(1) 
      : 0;

    res.json({
      overall: {
        totalTrades: data.total_trades || 0,
        winningTrades: data.winning_trades || 0,
        losingTrades: data.losing_trades || 0,
        totalPnL: data.total_pnl || 0,
        avgPnL: data.avg_pnl || 0,
        bestTrade: data.best_trade || 0,
        worstTrade: data.worst_trade || 0,
        winRate: parseFloat(winRate)
      },
      bySymbol: symbolStats
    });
  } catch (error) {
    console.error('Trading stats fetch error:', error);
    res.status(500).json({ error: 'Server error fetching trading statistics' });
  }
});

export default router;

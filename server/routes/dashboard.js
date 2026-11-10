import express from 'express';
import pool from '../config/database.js';
import { auth } from '../middleware/auth.js';
import { cacheMiddleware } from '../services/cache.js';
import { getLatestPrice } from '../services/priceFeed.js';

const router = express.Router();

// GET /api/dashboard/overview
// Returns exchange-style portfolio summary: balances, spot PnL, trade stats
router.get('/overview', auth, cacheMiddleware(15), async (req, res) => {
  try {
    const userId = req.user.userId;

    // Spot balances
    const [balances] = await pool.query(
      `SELECT asset, free, locked FROM user_balances WHERE user_id = ?`,
      [userId]
    );

    // Spot trade stats (from crypto_trades)
    const [tradeStats] = await pool.query(
      `SELECT
         COUNT(*)                                        AS total_trades,
         SUM(CASE WHEN side='BUY'  THEN 1 ELSE 0 END)  AS total_buys,
         SUM(CASE WHEN side='SELL' THEN 1 ELSE 0 END)  AS total_sells,
         SUM(fee)                                        AS total_fees
       FROM crypto_trades WHERE user_id = ?`,
      [userId]
    );

    // Futures stats
    const [futStats] = await pool.query(
      `SELECT
         COUNT(*)                                                AS total_positions,
         COALESCE(SUM(CASE WHEN status='CLOSED' THEN realized_pnl ELSE 0 END), 0) AS realized_pnl,
         COALESCE(SUM(CASE WHEN status='CLOSED' AND realized_pnl > 0 THEN 1 ELSE 0 END), 0) AS winning,
         COALESCE(SUM(CASE WHEN status='CLOSED' AND realized_pnl < 0 THEN 1 ELSE 0 END), 0) AS losing
       FROM futures_positions WHERE user_id = ?`,
      [userId]
    ).catch(() => [[{ total_positions: 0, realized_pnl: 0, winning: 0, losing: 0 }]]);

    // Earn positions value
    const [earnPos] = await pool.query(
      `SELECT asset, amount FROM earn_positions WHERE user_id = ? AND status = 'active'`,
      [userId]
    ).catch(() => [[]]);

    // Compute portfolio USD value using live prices
    const getLivePrice = (asset) => {
      if (asset === 'USDT') return 1;
      const lp = getLatestPrice(`${asset}USDT`);
      return lp ? (lp.bid + lp.ask) / 2 : null;
    };

    let spotUSD = 0;
    const enrichedBalances = balances.map(b => {
      const qty = parseFloat(b.free) + parseFloat(b.locked);
      const price = getLivePrice(b.asset);
      const usd = price !== null ? qty * price : null;
      if (usd !== null) spotUSD += usd;
      return { ...b, usd_value: usd, price };
    });

    let earnUSD = 0;
    for (const ep of earnPos) {
      const price = getLivePrice(ep.asset);
      if (price !== null) earnUSD += parseFloat(ep.amount) * price;
    }

    // Futures wallet balance
    const [fwRow] = await pool.query(
      `SELECT COALESCE(balance, 0) AS balance FROM futures_wallet WHERE user_id = ? LIMIT 1`,
      [userId]
    ).catch(() => [[{ balance: 0 }]]);
    const futuresBalance = parseFloat(fwRow[0]?.balance || 0);

    const totalUSD = spotUSD + earnUSD + futuresBalance;

    // Recent spot trades (last 10)
    const [recentTrades] = await pool.query(
      `SELECT symbol, side, price, amount, fee, created_at
       FROM crypto_trades WHERE user_id = ?
       ORDER BY created_at DESC LIMIT 10`,
      [userId]
    );

    const ts = tradeStats[0] || {};
    const fs = futStats[0] || {};

    res.json({
      overview: {
        totalUSD:         parseFloat(totalUSD.toFixed(2)),
        spotUSD:          parseFloat(spotUSD.toFixed(2)),
        earnUSD:          parseFloat(earnUSD.toFixed(2)),
        futuresUSD:       parseFloat(futuresBalance.toFixed(2)),
        totalTrades:      parseInt(ts.total_trades || 0),
        totalBuys:        parseInt(ts.total_buys  || 0),
        totalSells:       parseInt(ts.total_sells || 0),
        totalFees:        parseFloat(ts.total_fees || 0),
        futuresPositions: parseInt(fs.total_positions || 0),
        futuresRealizedPnl: parseFloat(fs.realized_pnl || 0),
        futuresWinRate:   fs.winning + fs.losing > 0
          ? parseFloat(((fs.winning / (fs.winning + fs.losing)) * 100).toFixed(1))
          : 0,
      },
      balances: enrichedBalances,
      recentTrades,
    });
  } catch (error) {
    console.error('Dashboard overview error:', error);
    res.status(500).json({ error: 'Failed to fetch dashboard overview' });
  }
});

export default router;

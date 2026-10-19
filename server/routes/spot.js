import express from 'express';
import pool from '../config/database.js';
import { auth } from '../middleware/auth.js';
import { getLatestPrice } from '../services/priceFeed.js';
import { broadcast } from '../websocket/server.js';
import { ensureUserBalances } from './wallet.js';

const router = express.Router();

// Get order book (simulated order book depth around current market price)
router.get('/orderbook/:symbol', async (req, res) => {
  try {
    const symbol = req.params.symbol.toUpperCase();
    const livePrice = getLatestPrice(symbol);

    // Default fallback prices if live feed hasn't delivered first tick yet
    const baseMap = {
      BTCUSDT: 67500,
      ETHUSDT: 3500,
      SOLUSDT: 155,
      BNBUSDT: 580,
      XRPUSDT: 0.55,
      DOGEUSDT: 0.12,
      ADAUSDT: 0.45
    };

    const midPrice = livePrice?.ask || baseMap[symbol] || 100;
    const spreads = symbol.includes('BTC') ? 1.0 : symbol.includes('ETH') ? 0.2 : 0.01;

    const bids = [];
    const asks = [];

    // Generate 12 depth levels for asks (above midPrice)
    for (let i = 1; i <= 12; i++) {
      const askPrice = (midPrice + i * spreads * 0.5).toFixed(4);
      const amount = (Math.random() * (symbol.includes('BTC') ? 1.5 : 20) + 0.1).toFixed(4);
      asks.push({ price: parseFloat(askPrice), amount: parseFloat(amount) });
    }

    // Generate 12 depth levels for bids (below midPrice)
    for (let i = 1; i <= 12; i++) {
      const bidPrice = (midPrice - i * spreads * 0.5).toFixed(4);
      const amount = (Math.random() * (symbol.includes('BTC') ? 1.5 : 20) + 0.1).toFixed(4);
      bids.push({ price: parseFloat(bidPrice), amount: parseFloat(amount) });
    }

    res.json({
      symbol,
      lastPrice: midPrice,
      bids,
      asks: asks.reverse() // Highest ask at top
    });
  } catch (error) {
    console.error('Orderbook error:', error);
    res.status(500).json({ error: 'Failed to fetch orderbook' });
  }
});

// Place spot order (LIMIT or MARKET)
router.post('/order', auth, async (req, res) => {
  try {
    const userId = req.user.id;
    const { symbol, side, type, price, amount } = req.body;

    const orderSide = side?.toUpperCase(); // BUY or SELL
    const orderType = type?.toUpperCase() || 'LIMIT'; // LIMIT or MARKET
    const orderSymbol = symbol?.toUpperCase();
    const numAmount = parseFloat(amount);
    let numPrice = parseFloat(price);

    if (!orderSymbol || !['BUY', 'SELL'].includes(orderSide) || !['LIMIT', 'MARKET'].includes(orderType) || isNaN(numAmount) || numAmount <= 0) {
      return res.status(400).json({ error: 'Invalid spot order parameters' });
    }

    await ensureUserBalances(userId);

    // Fetch instrument info to identify base and quote assets
    const [instruments] = await pool.query(
      'SELECT base_asset, quote_asset FROM instruments WHERE symbol = ?',
      [orderSymbol]
    );

    if (instruments.length === 0) {
      return res.status(400).json({ error: 'Unsupported trading pair' });
    }

    const { base_asset: baseAsset, quote_asset: quoteAsset } = instruments[0];
    const livePriceObj = getLatestPrice(orderSymbol);

    if (orderType === 'MARKET') {
      const marketPrice = orderSide === 'BUY' ? (livePriceObj?.ask || numPrice || 100) : (livePriceObj?.bid || numPrice || 100);
      numPrice = marketPrice;
    }

    if (isNaN(numPrice) || numPrice <= 0) {
      return res.status(400).json({ error: 'Invalid price for order execution' });
    }

    // Balance check & lock
    if (orderSide === 'BUY') {
      // User pays quoteAsset (e.g., USDT) to buy baseAsset (e.g., BTC)
      const totalCost = numPrice * numAmount;
      const [quoteBalance] = await pool.query(
        'SELECT free FROM user_balances WHERE user_id = ? AND asset = ?',
        [userId, quoteAsset]
      );

      if (quoteBalance.length === 0 || parseFloat(quoteBalance[0].free) < totalCost) {
        return res.status(400).json({ error: `Insufficient ${quoteAsset} balance` });
      }

      // Lock quoteAsset
      await pool.query(
        'UPDATE user_balances SET free = free - ?, locked = locked + ? WHERE user_id = ? AND asset = ?',
        [totalCost, totalCost, userId, quoteAsset]
      );
    } else {
      // User pays baseAsset (e.g., BTC) to sell for quoteAsset (e.g., USDT)
      const [baseBalance] = await pool.query(
        'SELECT free FROM user_balances WHERE user_id = ? AND asset = ?',
        [userId, baseAsset]
      );

      if (baseBalance.length === 0 || parseFloat(baseBalance[0].free) < numAmount) {
        return res.status(400).json({ error: `Insufficient ${baseAsset} balance` });
      }

      // Lock baseAsset
      await pool.query(
        'UPDATE user_balances SET free = free - ?, locked = locked + ? WHERE user_id = ? AND asset = ?',
        [numAmount, numAmount, userId, baseAsset]
      );
    }

    // Insert order into database
    const [orderRes] = await pool.query(
      `INSERT INTO crypto_orders (user_id, symbol, side, type, price, amount, filled_amount, status)
       VALUES (?, ?, ?, ?, ?, ?, 0, 'NEW')`,
      [userId, orderSymbol, orderSide, orderType, numPrice, numAmount]
    );

    const orderId = orderRes.insertId;

    // Direct execution for MARKET orders (or immediate matching)
    if (orderType === 'MARKET') {
      // Execute trade immediately
      const totalCost = numPrice * numAmount;
      const fee = totalCost * 0.001; // 0.1% fee standard Binance fee

      await pool.query(
        `INSERT INTO crypto_trades (order_id, user_id, symbol, side, price, amount, fee)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [orderId, userId, orderSymbol, orderSide, numPrice, numAmount, fee]
      );

      // Update order status to FILLED
      await pool.query(
        `UPDATE crypto_orders SET filled_amount = ?, status = 'FILLED' WHERE id = ?`,
        [numAmount, orderId]
      );

      // Settle balances
      if (orderSide === 'BUY') {
        // Unlock locked quoteAsset and subtract
        await pool.query(
          'UPDATE user_balances SET locked = locked - ? WHERE user_id = ? AND asset = ?',
          [totalCost, userId, quoteAsset]
        );
        // Add received baseAsset to free
        await pool.query(
          'UPDATE user_balances SET free = free + ? WHERE user_id = ? AND asset = ?',
          [numAmount, userId, baseAsset]
        );
      } else {
        // Unlock locked baseAsset and subtract
        await pool.query(
          'UPDATE user_balances SET locked = locked - ? WHERE user_id = ? AND asset = ?',
          [numAmount, userId, baseAsset]
        );
        // Add received quoteAsset (minus fee) to free
        await pool.query(
          'UPDATE user_balances SET free = free + ? WHERE user_id = ? AND asset = ?',
          [totalCost - fee, userId, quoteAsset]
        );
      }

      // Broadcast recent trade
      broadcast({
        type: 'spot_trade',
        symbol: orderSymbol,
        price: numPrice,
        amount: numAmount,
        side: orderSide,
        timestamp: new Date().toISOString()
      });

      return res.json({
        message: 'Market order executed successfully',
        orderId,
        status: 'FILLED',
        executedPrice: numPrice,
        amount: numAmount
      });
    }

    res.json({
      message: 'Limit order placed successfully',
      orderId,
      status: 'NEW',
      price: numPrice,
      amount: numAmount
    });
  } catch (error) {
    console.error('Spot order error:', error);
    res.status(500).json({ error: 'Failed to place order' });
  }
});

// Get all orders (full history including filled/canceled)
router.get('/all-orders', auth, async (req, res) => {
  try {
    const userId = req.user.id;
    const [orders] = await pool.query(
      `SELECT * FROM crypto_orders WHERE user_id = ? ORDER BY created_at DESC LIMIT 200`,
      [userId]
    );
    res.json({ orders });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch orders' });
  }
});

// Get user open orders
router.get('/open-orders', auth, async (req, res) => {
  try {
    const userId = req.user.id;
    const [orders] = await pool.query(
      `SELECT * FROM crypto_orders WHERE user_id = ? AND status IN ('NEW', 'PARTIALLY_FILLED') ORDER BY created_at DESC`,
      [userId]
    );
    res.json({ orders });
  } catch (error) {
    console.error('Fetch open orders error:', error);
    res.status(500).json({ error: 'Failed to fetch open orders' });
  }
});

// Cancel open order
router.post('/cancel-order', auth, async (req, res) => {
  try {
    const userId = req.user.id;
    const { orderId } = req.body;

    const [orders] = await pool.query(
      `SELECT * FROM crypto_orders WHERE id = ? AND user_id = ? AND status IN ('NEW', 'PARTIALLY_FILLED')`,
      [orderId, userId]
    );

    if (orders.length === 0) {
      return res.status(404).json({ error: 'Open order not found' });
    }

    const order = orders[0];
    const unfilledAmount = parseFloat(order.amount) - parseFloat(order.filled_amount);

    const [instruments] = await pool.query(
      'SELECT base_asset, quote_asset FROM instruments WHERE symbol = ?',
      [order.symbol]
    );
    const { base_asset: baseAsset, quote_asset: quoteAsset } = instruments[0];

    // Unlock locked funds back to free balance
    if (order.side === 'BUY') {
      const lockedCost = unfilledAmount * parseFloat(order.price);
      await pool.query(
        'UPDATE user_balances SET locked = locked - ?, free = free + ? WHERE user_id = ? AND asset = ?',
        [lockedCost, lockedCost, userId, quoteAsset]
      );
    } else {
      await pool.query(
        'UPDATE user_balances SET locked = locked - ?, free = free + ? WHERE user_id = ? AND asset = ?',
        [unfilledAmount, unfilledAmount, userId, baseAsset]
      );
    }

    await pool.query(
      `UPDATE crypto_orders SET status = 'CANCELED' WHERE id = ?`,
      [orderId]
    );

    res.json({ message: 'Order canceled successfully', orderId });
  } catch (error) {
    console.error('Cancel order error:', error);
    res.status(500).json({ error: 'Failed to cancel order' });
  }
});

// Get user trade history
router.get('/trade-history', auth, async (req, res) => {
  try {
    const userId = req.user.id;
    const [trades] = await pool.query(
      `SELECT * FROM crypto_trades WHERE user_id = ? ORDER BY created_at DESC LIMIT 50`,
      [userId]
    );
    res.json({ trades });
  } catch (error) {
    console.error('Fetch trade history error:', error);
    res.status(500).json({ error: 'Failed to fetch trade history' });
  }
});

export default router;

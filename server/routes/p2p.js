/**
 * P2P Trading Routes  —  /api/p2p
 *
 * POST   /api/p2p/ads              create a buy/sell ad
 * GET    /api/p2p/ads              list all active ads (with filters)
 * GET    /api/p2p/ads/:id          get single ad
 * DELETE /api/p2p/ads/:id          cancel own ad
 * POST   /api/p2p/orders           place an order against an ad
 * GET    /api/p2p/orders           list user's orders
 * GET    /api/p2p/orders/:id       get single order
 * PUT    /api/p2p/orders/:id/pay   buyer marks as paid
 * PUT    /api/p2p/orders/:id/release  seller releases crypto
 * PUT    /api/p2p/orders/:id/cancel   cancel an order (before payment)
 * PUT    /api/p2p/orders/:id/dispute  raise a dispute
 */

import express from 'express';
import pool from '../config/database.js';
import { auth } from '../middleware/auth.js';
import { getLatestPrice } from '../services/priceFeed.js';

const router = express.Router();

const SUPPORTED_ASSETS = ['USDT', 'BTC', 'ETH', 'SOL', 'BNB', 'XRP', 'DOGE', 'ADA', 'LTC', 'AVAX', 'LINK', 'MATIC', 'DOT', 'TRX', 'UNI', 'ATOM'];
const FIAT_CURRENCIES  = ['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'NGN', 'KES', 'GHS', 'ZAR', 'INR', 'BRL', 'MXN', 'AED', 'SGD'];
const PAYMENT_METHODS  = ['Bank Transfer', 'PayPal', 'Wise', 'Revolut', 'Cash App', 'Venmo', 'Zelle', 'M-Pesa', 'MTN Mobile Money', 'Airtel Money', 'Other'];

async function ensureP2PTables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS p2p_ads (
      id            INT AUTO_INCREMENT PRIMARY KEY,
      user_id       INT NOT NULL,
      type          ENUM('BUY','SELL') NOT NULL,
      asset         VARCHAR(20) NOT NULL,
      fiat          VARCHAR(10) NOT NULL DEFAULT 'USD',
      price         DECIMAL(18,6) NOT NULL,
      price_type    ENUM('fixed','floating') NOT NULL DEFAULT 'fixed',
      float_margin  DECIMAL(6,2) NOT NULL DEFAULT 0.00,
      total_amount  DECIMAL(24,8) NOT NULL,
      available     DECIMAL(24,8) NOT NULL,
      min_order     DECIMAL(18,2) NOT NULL,
      max_order     DECIMAL(18,2) NOT NULL,
      payment_methods JSON NOT NULL,
      payment_window  INT NOT NULL DEFAULT 15,
      terms         TEXT,
      status        ENUM('active','paused','completed','cancelled') NOT NULL DEFAULT 'active',
      created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      INDEX idx_type_asset_status (type, asset, status)
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS p2p_orders (
      id              INT AUTO_INCREMENT PRIMARY KEY,
      ad_id           INT NOT NULL,
      buyer_id        INT NOT NULL,
      seller_id       INT NOT NULL,
      asset           VARCHAR(20) NOT NULL,
      fiat            VARCHAR(10) NOT NULL DEFAULT 'USD',
      crypto_amount   DECIMAL(24,8) NOT NULL,
      fiat_amount     DECIMAL(18,2) NOT NULL,
      price           DECIMAL(18,6) NOT NULL,
      payment_method  VARCHAR(100) NOT NULL,
      status          ENUM('pending','paid','released','cancelled','disputed','completed') NOT NULL DEFAULT 'pending',
      buyer_paid_at   TIMESTAMP NULL,
      released_at     TIMESTAMP NULL,
      cancelled_at    TIMESTAMP NULL,
      dispute_reason  TEXT,
      disputed_at     TIMESTAMP NULL,
      expires_at      TIMESTAMP NOT NULL,
      created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (ad_id)      REFERENCES p2p_ads(id)   ON DELETE CASCADE,
      FOREIGN KEY (buyer_id)   REFERENCES users(id)     ON DELETE CASCADE,
      FOREIGN KEY (seller_id)  REFERENCES users(id)     ON DELETE CASCADE,
      INDEX idx_buyer  (buyer_id),
      INDEX idx_seller (seller_id)
    )
  `);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function calcPrice(ad) {
  if (ad.price_type === 'fixed') return parseFloat(ad.price);
  const live = getLatestPrice(ad.asset + 'USDT');
  const mark = live ? (live.bid + live.ask) / 2 : parseFloat(ad.price);
  const margin = parseFloat(ad.float_margin) / 100;
  return ad.type === 'SELL'
    ? parseFloat((mark * (1 + margin)).toFixed(6))
    : parseFloat((mark * (1 - margin)).toFixed(6));
}

// ── Create Ad ─────────────────────────────────────────────────────────────────
router.post('/ads', auth, async (req, res) => {
  try {
    await ensureP2PTables();
    const userId = req.user.userId;
    const { type, asset, fiat = 'USD', price, price_type = 'fixed', float_margin = 0,
            total_amount, min_order, max_order, payment_methods, payment_window = 15, terms } = req.body;

    if (!['BUY','SELL'].includes(type?.toUpperCase()))
      return res.status(400).json({ error: 'type must be BUY or SELL' });
    if (!SUPPORTED_ASSETS.includes(asset?.toUpperCase()))
      return res.status(400).json({ error: 'Unsupported asset' });
    if (!FIAT_CURRENCIES.includes(fiat?.toUpperCase()))
      return res.status(400).json({ error: 'Unsupported fiat currency' });
    if (!Array.isArray(payment_methods) || payment_methods.length === 0)
      return res.status(400).json({ error: 'At least one payment method is required' });

    const numAmount = parseFloat(total_amount);
    const numMin    = parseFloat(min_order);
    const numMax    = parseFloat(max_order);
    const numPrice  = parseFloat(price);

    if (isNaN(numAmount) || numAmount <= 0) return res.status(400).json({ error: 'Invalid total_amount' });
    if (isNaN(numMin) || numMin <= 0)       return res.status(400).json({ error: 'Invalid min_order' });
    if (isNaN(numMax) || numMax < numMin)   return res.status(400).json({ error: 'max_order must be >= min_order' });
    if (isNaN(numPrice) || numPrice <= 0)   return res.status(400).json({ error: 'Invalid price' });

    // For SELL ads — escrow the crypto from the seller's balance
    if (type.toUpperCase() === 'SELL') {
      const [bal] = await pool.query(
        'SELECT free FROM user_balances WHERE user_id = ? AND asset = ?',
        [userId, asset.toUpperCase()]
      );
      if (!bal.length || parseFloat(bal[0].free) < numAmount) {
        return res.status(400).json({ error: `Insufficient ${asset} balance to escrow` });
      }
      await pool.query(
        'UPDATE user_balances SET free = free - ?, locked = locked + ? WHERE user_id = ? AND asset = ?',
        [numAmount, numAmount, userId, asset.toUpperCase()]
      );
    }

    const [result] = await pool.query(
      `INSERT INTO p2p_ads (user_id, type, asset, fiat, price, price_type, float_margin,
         total_amount, available, min_order, max_order, payment_methods, payment_window, terms)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [userId, type.toUpperCase(), asset.toUpperCase(), fiat.toUpperCase(),
       numPrice, price_type, parseFloat(float_margin), numAmount, numAmount,
       numMin, numMax, JSON.stringify(payment_methods),
       parseInt(payment_window) || 15, terms || null]
    );

    res.status(201).json({ message: 'Ad created', adId: result.insertId });
  } catch (err) {
    console.error('P2P create ad error:', err);
    res.status(500).json({ error: 'Failed to create ad' });
  }
});

// ── List Ads ──────────────────────────────────────────────────────────────────
router.get('/ads', auth, async (req, res) => {
  try {
    await ensureP2PTables();
    const { type, asset, fiat, mine } = req.query;

    let where = "a.status = 'active'";
    const params = [];

    if (mine === '1') {
      where = 'a.user_id = ?';
      params.push(req.user.userId);
    } else {
      // Hide own ads from the marketplace
      where += ' AND a.user_id != ?';
      params.push(req.user.userId);
    }
    if (type)  { where += ' AND a.type = ?';  params.push(type.toUpperCase()); }
    if (asset) { where += ' AND a.asset = ?'; params.push(asset.toUpperCase()); }
    if (fiat)  { where += ' AND a.fiat = ?';  params.push(fiat.toUpperCase()); }

    const [ads] = await pool.query(
      `SELECT a.*, u.first_name, u.last_name,
              (SELECT COUNT(*) FROM p2p_orders o WHERE o.seller_id = a.user_id AND o.status = 'completed') AS completed_trades
       FROM p2p_ads a
       JOIN users u ON a.user_id = u.id
       WHERE ${where}
       ORDER BY a.created_at DESC
       LIMIT 100`,
      params
    );

    // Attach live price for floating ads
    const enriched = ads.map(ad => ({
      ...ad,
      effective_price: calcPrice(ad),
      payment_methods: typeof ad.payment_methods === 'string'
        ? JSON.parse(ad.payment_methods) : ad.payment_methods,
    }));

    res.json({ ads: enriched, meta: { fiat_currencies: FIAT_CURRENCIES, payment_methods: PAYMENT_METHODS, assets: SUPPORTED_ASSETS } });
  } catch (err) {
    console.error('P2P list ads error:', err);
    res.status(500).json({ error: 'Failed to fetch ads' });
  }
});

// ── Get single ad ─────────────────────────────────────────────────────────────
router.get('/ads/:id', auth, async (req, res) => {
  try {
    await ensureP2PTables();
    const [ads] = await pool.query(
      `SELECT a.*, u.first_name, u.last_name,
              (SELECT COUNT(*) FROM p2p_orders o WHERE o.seller_id = a.user_id AND o.status='completed') AS completed_trades
       FROM p2p_ads a JOIN users u ON a.user_id = u.id WHERE a.id = ?`,
      [req.params.id]
    );
    if (!ads.length) return res.status(404).json({ error: 'Ad not found' });
    const ad = { ...ads[0], effective_price: calcPrice(ads[0]),
      payment_methods: typeof ads[0].payment_methods === 'string'
        ? JSON.parse(ads[0].payment_methods) : ads[0].payment_methods };
    res.json({ ad });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch ad' });
  }
});

// ── Cancel own ad ─────────────────────────────────────────────────────────────
router.delete('/ads/:id', auth, async (req, res) => {
  try {
    await ensureP2PTables();
    const userId = req.user.userId;
    const [ads] = await pool.query(
      "SELECT * FROM p2p_ads WHERE id = ? AND user_id = ? AND status = 'active'",
      [req.params.id, userId]
    );
    if (!ads.length) return res.status(404).json({ error: 'Active ad not found' });
    const ad = ads[0];

    await pool.query("UPDATE p2p_ads SET status = 'cancelled' WHERE id = ?", [ad.id]);

    // Release escrowed funds for SELL ads
    if (ad.type === 'SELL') {
      const avail = parseFloat(ad.available);
      await pool.query(
        'UPDATE user_balances SET locked = locked - ?, free = free + ? WHERE user_id = ? AND asset = ?',
        [avail, avail, userId, ad.asset]
      );
    }
    res.json({ message: 'Ad cancelled' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to cancel ad' });
  }
});

// ── Place Order ───────────────────────────────────────────────────────────────
router.post('/orders', auth, async (req, res) => {
  try {
    await ensureP2PTables();
    const buyerId = req.user.userId;
    const { ad_id, crypto_amount, payment_method } = req.body;

    const [ads] = await pool.query(
      "SELECT * FROM p2p_ads WHERE id = ? AND status = 'active'",
      [ad_id]
    );
    if (!ads.length) return res.status(404).json({ error: 'Ad not found or no longer active' });
    const ad = ads[0];

    if (ad.user_id === buyerId) return res.status(400).json({ error: 'Cannot trade with your own ad' });

    const qty = parseFloat(crypto_amount);
    if (isNaN(qty) || qty <= 0) return res.status(400).json({ error: 'Invalid crypto_amount' });
    if (qty > parseFloat(ad.available)) return res.status(400).json({ error: 'Amount exceeds available quantity' });

    const effectivePrice = calcPrice(ad);
    const fiatAmount = parseFloat((qty * effectivePrice).toFixed(2));

    if (fiatAmount < parseFloat(ad.min_order)) return res.status(400).json({ error: `Minimum order is ${ad.min_order} ${ad.fiat}` });
    if (fiatAmount > parseFloat(ad.max_order)) return res.status(400).json({ error: `Maximum order is ${ad.max_order} ${ad.fiat}` });

    if (!payment_method) return res.status(400).json({ error: 'payment_method is required' });

    // Determine buyer/seller
    const sellerId = ad.type === 'SELL' ? ad.user_id : buyerId;
    const actualBuyerId = ad.type === 'SELL' ? buyerId : ad.user_id;

    // For BUY ads (ad owner wants to buy) — escrow crypto from the taker (seller = current user)
    if (ad.type === 'BUY') {
      const [bal] = await pool.query(
        'SELECT free FROM user_balances WHERE user_id = ? AND asset = ?',
        [buyerId, ad.asset]
      );
      if (!bal.length || parseFloat(bal[0].free) < qty) {
        return res.status(400).json({ error: `Insufficient ${ad.asset} balance` });
      }
      await pool.query(
        'UPDATE user_balances SET free = free - ?, locked = locked + ? WHERE user_id = ? AND asset = ?',
        [qty, qty, buyerId, ad.asset]
      );
    }

    // Reserve from ad available
    await pool.query('UPDATE p2p_ads SET available = available - ? WHERE id = ?', [qty, ad.id]);
    // Pause ad if fully taken
    await pool.query("UPDATE p2p_ads SET status = IF(available <= 0, 'completed', status) WHERE id = ?", [ad.id]);

    const expiresAt = new Date(Date.now() + ad.payment_window * 60 * 1000);
    const [result] = await pool.query(
      `INSERT INTO p2p_orders (ad_id, buyer_id, seller_id, asset, fiat, crypto_amount, fiat_amount, price, payment_method, expires_at)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
      [ad.id, actualBuyerId, sellerId, ad.asset, ad.fiat, qty, fiatAmount, effectivePrice, payment_method, expiresAt]
    );

    res.status(201).json({ message: 'Order placed', orderId: result.insertId, fiatAmount, effectivePrice, expiresAt });
  } catch (err) {
    console.error('P2P place order error:', err);
    res.status(500).json({ error: 'Failed to place order' });
  }
});

// ── List user orders ──────────────────────────────────────────────────────────
router.get('/orders', auth, async (req, res) => {
  try {
    await ensureP2PTables();
    const userId = req.user.userId;
    const [orders] = await pool.query(
      `SELECT o.*,
              b.first_name AS buyer_first, b.last_name AS buyer_last,
              s.first_name AS seller_first, s.last_name AS seller_last,
              a.type AS ad_type, a.payment_methods
       FROM p2p_orders o
       JOIN users b ON o.buyer_id  = b.id
       JOIN users s ON o.seller_id = s.id
       JOIN p2p_ads a ON o.ad_id   = a.id
       WHERE o.buyer_id = ? OR o.seller_id = ?
       ORDER BY o.created_at DESC
       LIMIT 100`,
      [userId, userId]
    );
    res.json({ orders });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch orders' });
  }
});

// ── Get single order ──────────────────────────────────────────────────────────
router.get('/orders/:id', auth, async (req, res) => {
  try {
    await ensureP2PTables();
    const userId = req.user.userId;
    const [orders] = await pool.query(
      `SELECT o.*,
              b.first_name AS buyer_first, b.last_name AS buyer_last,
              s.first_name AS seller_first, s.last_name AS seller_last,
              a.type AS ad_type, a.payment_methods, a.terms
       FROM p2p_orders o
       JOIN users b ON o.buyer_id  = b.id
       JOIN users s ON o.seller_id = s.id
       JOIN p2p_ads a ON o.ad_id   = a.id
       WHERE o.id = ? AND (o.buyer_id = ? OR o.seller_id = ?)`,
      [req.params.id, userId, userId]
    );
    if (!orders.length) return res.status(404).json({ error: 'Order not found' });
    res.json({ order: orders[0] });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch order' });
  }
});

// ── Buyer marks as paid ───────────────────────────────────────────────────────
router.put('/orders/:id/pay', auth, async (req, res) => {
  try {
    await ensureP2PTables();
    const userId = req.user.userId;
    const [orders] = await pool.query(
      "SELECT * FROM p2p_orders WHERE id = ? AND buyer_id = ? AND status = 'pending'",
      [req.params.id, userId]
    );
    if (!orders.length) return res.status(404).json({ error: 'Pending order not found' });

    await pool.query(
      "UPDATE p2p_orders SET status = 'paid', buyer_paid_at = NOW() WHERE id = ?",
      [req.params.id]
    );
    res.json({ message: 'Payment confirmed. Waiting for seller to release crypto.' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to mark as paid' });
  }
});

// ── Seller releases crypto ────────────────────────────────────────────────────
router.put('/orders/:id/release', auth, async (req, res) => {
  try {
    await ensureP2PTables();
    const userId = req.user.userId;
    const [orders] = await pool.query(
      "SELECT * FROM p2p_orders WHERE id = ? AND seller_id = ? AND status = 'paid'",
      [req.params.id, userId]
    );
    if (!orders.length) return res.status(404).json({ error: 'Paid order not found' });
    const order = orders[0];

    // Transfer crypto from seller locked → buyer free
    const qty = parseFloat(order.crypto_amount);
    await pool.query(
      'UPDATE user_balances SET locked = locked - ? WHERE user_id = ? AND asset = ?',
      [qty, order.seller_id, order.asset]
    );
    await pool.query(
      `INSERT INTO user_balances (user_id, asset, free) VALUES (?,?,?)
       ON DUPLICATE KEY UPDATE free = free + ?`,
      [order.buyer_id, order.asset, qty, qty]
    );

    await pool.query(
      "UPDATE p2p_orders SET status = 'completed', released_at = NOW() WHERE id = ?",
      [req.params.id]
    );
    res.json({ message: `${qty} ${order.asset} released to buyer.` });
  } catch (err) {
    console.error('P2P release error:', err);
    res.status(500).json({ error: 'Failed to release crypto' });
  }
});

// ── Cancel order ──────────────────────────────────────────────────────────────
router.put('/orders/:id/cancel', auth, async (req, res) => {
  try {
    await ensureP2PTables();
    const userId = req.user.userId;
    const [orders] = await pool.query(
      "SELECT * FROM p2p_orders WHERE id = ? AND (buyer_id = ? OR seller_id = ?) AND status = 'pending'",
      [req.params.id, userId, userId]
    );
    if (!orders.length) return res.status(404).json({ error: 'Cancellable order not found' });
    const order = orders[0];
    const qty = parseFloat(order.crypto_amount);

    // Return escrowed crypto
    await pool.query(
      'UPDATE user_balances SET locked = locked - ?, free = free + ? WHERE user_id = ? AND asset = ?',
      [qty, qty, order.seller_id, order.asset]
    );
    // Restore ad available
    await pool.query(
      "UPDATE p2p_ads SET available = available + ?, status = IF(status='completed','active',status) WHERE id = ?",
      [qty, order.ad_id]
    );
    await pool.query(
      "UPDATE p2p_orders SET status = 'cancelled', cancelled_at = NOW() WHERE id = ?",
      [req.params.id]
    );
    res.json({ message: 'Order cancelled' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to cancel order' });
  }
});

// ── Raise dispute ─────────────────────────────────────────────────────────────
router.put('/orders/:id/dispute', auth, async (req, res) => {
  try {
    await ensureP2PTables();
    const userId = req.user.userId;
    const { reason } = req.body;
    const [orders] = await pool.query(
      "SELECT * FROM p2p_orders WHERE id = ? AND (buyer_id = ? OR seller_id = ?) AND status IN ('pending','paid')",
      [req.params.id, userId, userId]
    );
    if (!orders.length) return res.status(404).json({ error: 'Order not found or cannot be disputed' });

    await pool.query(
      "UPDATE p2p_orders SET status = 'disputed', dispute_reason = ?, disputed_at = NOW() WHERE id = ?",
      [reason || 'No reason provided', req.params.id]
    );
    res.json({ message: 'Dispute raised. Admin will review.' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to raise dispute' });
  }
});

export default router;

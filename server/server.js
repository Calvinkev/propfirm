import express from 'express'; 
import { createServer } from 'http';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import dotenv from 'dotenv';
import pool, { initDatabase } from './config/database.js';
import authRoutes from './routes/auth.js';
import walletRoutes from './routes/wallet.js';
import spotRoutes from './routes/spot.js';
import marketRoutes from './routes/market.js';
import adminRoutes from './routes/admin.js';
import dashboardRoutes from './routes/dashboard.js';
import convertRoutes from './routes/convert.js';
import earnRoutes from './routes/earn.js';
import referralRoutes from './routes/referral.js';
import notificationsRoutes from './routes/notifications.js';
import profileRoutes from './routes/profile.js';
import futuresRoutes from './routes/futures.js';
import { setupWebSocket } from './websocket/server.js';
import { priceFeed } from './services/priceFeed.js';
import { startAIEngine } from './services/aiTradingEngine.js';
import aiAgentRoutes from './routes/aiAgent.js';
import p2pRoutes from './routes/p2p.js';
import quickTradeRoutes from './routes/quickTrade.js';
import { apiLimiter, authLimiter } from './middleware/rateLimiter.js';
import { sanitiseInput } from './middleware/validate.js';
import cache from './services/cache.js';

dotenv.config();

const app = express();
const server = createServer(app);
const PORT = process.env.PORT || 5000;
const NODE_ENV = process.env.NODE_ENV || 'development';
const isProd = NODE_ENV === 'production';

// Trust Render's proxy so express-rate-limit can read the real client IP
// from X-Forwarded-For without throwing a validation error.
if (isProd) {
  app.set('trust proxy', 1);
}

// ── Security Middleware ──────────────────────────────────────────────────────
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  contentSecurityPolicy: false,
}));

const allowedOrigins = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(',').map(o => o.trim())
  : ['http://localhost:5173', 'http://localhost:3000', 'http://localhost:5000'];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin && !isProd) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    if (!isProd) return callback(null, true);
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

app.use(compression());

if (isProd) {
  app.use(morgan('combined'));
} else {
  app.use(morgan('dev'));
}

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
app.use(sanitiseInput);

app.use('/api/', apiLimiter);

// ── Startup ──────────────────────────────────────────────────────────────────
console.log('='.repeat(50));
console.log('STAKEUP CRYPTO EXCHANGE SERVER STARTING...');
console.log('='.repeat(50));

initDatabase()
  .then(() => {
    console.log('✅ Database connected & initialized');
    // ── Price ticks cleanup — keep only last 2 hours of ticks ──────────────
    setInterval(async () => {
      try {
        await pool.query(`DELETE FROM price_ticks WHERE timestamp < DATE_SUB(NOW(), INTERVAL 2 HOUR)`);
      } catch (err) {
        console.error('price_ticks cleanup error:', err.message);
      }
    }, 10 * 60 * 1000);

    // ── Spot limit order matcher — runs every 5 seconds ────────────────────
    // Guard flag prevents overlapping runs if the previous tick is still processing
    let limitMatcherRunning = false;
    setInterval(async () => {
      if (limitMatcherRunning) return;
      limitMatcherRunning = true;
      try {
        const { getLatestPrice } = await import('./services/priceFeed.js');
        const [orders] = await pool.query(
          `SELECT o.*, i.base_asset, i.quote_asset
           FROM crypto_orders o
           JOIN instruments i ON o.symbol = i.symbol
           WHERE o.status IN ('NEW','PARTIALLY_FILLED') AND o.type = 'LIMIT'
           LIMIT 50`   /* cap per tick to avoid DB overload */
        );
        for (const order of orders) {
          const lp = getLatestPrice(order.symbol);
          if (!lp) continue;
          const shouldFill =
            order.side === 'BUY'
              ? lp.ask <= parseFloat(order.price)
              : lp.bid >= parseFloat(order.price);
          if (!shouldFill) continue;

          const fillPrice  = parseFloat(order.price);
          const fillAmt    = parseFloat(order.amount) - parseFloat(order.filled_amount);
          if (fillAmt <= 0) continue;
          const totalValue = fillPrice * fillAmt;
          const fee        = totalValue * 0.001;

          // Use a transaction to prevent race conditions on balance updates
          const conn = await pool.getConnection();
          try {
            await conn.beginTransaction();
            if (order.side === 'BUY') {
              await conn.query(
                'UPDATE user_balances SET locked = locked - ? WHERE user_id = ? AND asset = ?',
                [totalValue, order.user_id, order.quote_asset]
              );
              await conn.query(
                `INSERT INTO user_balances (user_id, asset, free) VALUES (?,?,?)
                 ON DUPLICATE KEY UPDATE free = free + ?`,
                [order.user_id, order.base_asset, fillAmt, fillAmt]
              );
            } else {
              await conn.query(
                'UPDATE user_balances SET locked = locked - ? WHERE user_id = ? AND asset = ?',
                [fillAmt, order.user_id, order.base_asset]
              );
              await conn.query(
                `INSERT INTO user_balances (user_id, asset, free) VALUES (?,?,?)
                 ON DUPLICATE KEY UPDATE free = free + ?`,
                [order.user_id, order.quote_asset, totalValue - fee, totalValue - fee]
              );
            }
            await conn.query(
              `INSERT INTO crypto_trades (order_id, user_id, symbol, side, price, amount, fee)
               VALUES (?,?,?,?,?,?,?)`,
              [order.id, order.user_id, order.symbol, order.side, fillPrice, fillAmt, fee]
            );
            await conn.query(
              `UPDATE crypto_orders SET status = 'FILLED', filled_amount = amount WHERE id = ?`,
              [order.id]
            );
            await conn.commit();
          } catch (err) {
            await conn.rollback();
            console.error(`Limit order fill error (order ${order.id}):`, err.message);
          } finally {
            conn.release();
          }
        }
      } catch (err) {
        console.error('Limit order matcher error:', err.message);
      } finally {
        limitMatcherRunning = false;
      }
    }, 5000);

    return priceFeed.start();
  })
  .then(() => {
    console.log('✅ Live price feed started');
    startAIEngine();
    console.log('✅ AI Trading Engine started');
  })
  .catch((error) => {
    console.error('❌ Startup error:', error.message);
  });

setupWebSocket(server);

// ── Health Check ─────────────────────────────────────────────────────────────
app.get('/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({
      status: 'healthy',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      database: 'connected',
      environment: NODE_ENV,
    });
  } catch (error) {
    res.status(503).json({
      status: 'unhealthy',
      error: error.message,
    });
  }
});

// ── Routes ───────────────────────────────────────────────────────────────────
app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/wallet', walletRoutes);
app.use('/api/spot', spotRoutes);
app.use('/api/market', marketRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/convert', convertRoutes);
app.use('/api/earn', earnRoutes);
app.use('/api/referral', referralRoutes);
app.use('/api/notifications', notificationsRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/futures', futuresRoutes);
app.use('/api/ai', aiAgentRoutes);
app.use('/api/p2p', p2pRoutes);
app.use('/api/quick-trade', quickTradeRoutes);

// ── Static frontend (must be after API routes) ───────────────────────────────
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const distPath = join(__dirname, 'dist');

if (existsSync(distPath)) {
  app.use(express.static(distPath));
  app.get('*', (req, res) => {
    if (req.path.startsWith('/api/') || req.path === '/health' || req.path === '/ws') {
      return res.status(404).json({ error: 'Endpoint not found' });
    }
    res.sendFile(join(distPath, 'index.html'));
  });
} else {
  // No dist built — return JSON for all non-API routes (dev/API-only mode)
  app.get('/', (req, res) => {
    res.json({ message: 'STAKEUP Crypto Exchange API', status: 'running', version: '2.0.0' });
  });
}

server.listen(PORT, () => {
  console.log(`🌐 STAKEUP API Server: http://localhost:${PORT}`);
});

const gracefulShutdown = async (signal) => {
  console.log(`\n${signal} received. Shutting down...`);
  server.close();
  cache.destroy();
  try {
    await pool.end();
  } catch (err) {}
  process.exit(0);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

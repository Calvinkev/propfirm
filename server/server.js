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
import accountsRoutes from './routes/accounts.js';
import dashboardRoutes from './routes/dashboard.js';
import tradesRoutes from './routes/trades.js';
import convertRoutes from './routes/convert.js';
import earnRoutes from './routes/earn.js';
import referralRoutes from './routes/referral.js';
import notificationsRoutes from './routes/notifications.js';
import profileRoutes from './routes/profile.js';
import futuresRoutes from './routes/futures.js';
import { setupWebSocket } from './websocket/server.js';
import { priceFeed } from './services/priceFeed.js';
import { apiLimiter, authLimiter } from './middleware/rateLimiter.js';
import { sanitiseInput } from './middleware/validate.js';
import cache from './services/cache.js';

dotenv.config();

const app = express();
const server = createServer(app);
const PORT = process.env.PORT || 5000;
const NODE_ENV = process.env.NODE_ENV || 'development';
const isProd = NODE_ENV === 'production';

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
console.log('BINANCE CRYPTO EXCHANGE SERVER STARTING...');
console.log('='.repeat(50));

initDatabase()
  .then(() => {
    console.log('✅ Database connected & initialized');
    return priceFeed.start();
  })
  .then(() => {
    console.log('✅ Live Binance price feed started');
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

app.get('/', (req, res) => {
  res.json({ message: 'Binance Crypto Exchange API', status: 'running', version: '2.0.0' });
});

// ── Routes ───────────────────────────────────────────────────────────────────
app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/wallet', walletRoutes);
app.use('/api/spot', spotRoutes);
app.use('/api/market', marketRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/accounts', accountsRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/trades', tradesRoutes);
app.use('/api/convert', convertRoutes);
app.use('/api/earn', earnRoutes);
app.use('/api/referral', referralRoutes);
app.use('/api/notifications', notificationsRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/futures', futuresRoutes);

// Static frontend fallback
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
}

server.listen(PORT, () => {
  console.log(`🌐 Binance API Server: http://localhost:${PORT}`);
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

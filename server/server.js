import express from 'express'; 
import { createServer } from 'http';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import dotenv from 'dotenv';
import pool, { initDatabase } from './config/database.js';
import authRoutes from './routes/auth.js';
import accountRoutes from './routes/accounts.js';
import tradeRoutes from './routes/trades.js';
import marketRoutes from './routes/market.js';
import dashboardRoutes from './routes/dashboard.js';
import payoutRoutes from './routes/payouts.js';
import demoRoutes from './routes/demo.js';
import adminRoutes from './routes/admin.js';
import { setupWebSocket, startMarketDataSimulation } from './websocket/server.js';
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

// Helmet — secure HTTP headers (XSS, clickjacking, sniffing, etc.)
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  contentSecurityPolicy: false, // frontend served separately
}));

// CORS — restrict origins in production
const allowedOrigins = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(',').map(o => o.trim())
  : ['http://localhost:5173', 'http://localhost:3000', 'http://localhost:5000'];

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, curl, etc.) in dev
    if (!origin && !isProd) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    // Allow all in development for convenience
    if (!isProd) return callback(null, true);
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// Compression — gzip responses
app.use(compression());

// Request logging
if (isProd) {
  app.use(morgan('combined'));
} else {
  app.use(morgan('dev'));
}

// Body parsing with size limits to prevent payload attacks
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// Input sanitisation — strip HTML tags from all inputs
app.use(sanitiseInput);

// Global rate limiter
app.use('/api/', apiLimiter);

// ── Startup ──────────────────────────────────────────────────────────────────

console.log('='.repeat(50));
console.log('STAKEUP SERVER STARTING...');
console.log('='.repeat(50));
console.log(`Environment: ${NODE_ENV}`);
console.log(`Database: ${process.env.DB_NAME || 'stakeup'}`);
console.log(`Host: ${process.env.DB_HOST || 'localhost'}`);
console.log(`Port: ${PORT}`);
console.log('='.repeat(50));

// Initialize database, then start price feed once instruments are seeded
console.log('📡 Connecting to database...');
initDatabase()
  .then(() => {
    console.log('✅ Database connected successfully');
    console.log('📊 Database tables initialized');
    console.log('📡 Starting live price feed service...');
    return priceFeed.start();
  })
  .then(() => {
    console.log('✅ Price feed service started');
  })
  .catch((error) => {
    console.error('❌ Startup error:', error.message);
    console.error('Server will continue but some features may not work');
  });

// Setup WebSocket
console.log('🔌 Setting up WebSocket server...');
setupWebSocket(server);
console.log('✅ WebSocket server configured');

// Start legacy market data simulation (for existing challenge dashboard)
console.log('📈 Starting market data simulation...');
startMarketDataSimulation();
console.log('✅ Market data simulation started');

// ── Health Check ─────────────────────────────────────────────────────────────
app.get('/health', async (req, res) => {
  try {
    // Check database connectivity
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
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      database: 'disconnected',
      error: error.message,
    });
  }
});

// Root
app.get('/', (req, res) => {
  res.json({ message: 'STAKEUP API Server', status: 'running', version: '1.0.0' });
});

// ── Routes ───────────────────────────────────────────────────────────────────
app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/accounts', accountRoutes);
app.use('/api/trades', tradeRoutes);
app.use('/api/market', marketRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/payouts', payoutRoutes);
app.use('/api/demo', demoRoutes);
app.use('/api/admin', adminRoutes);

// ── Static Frontend (production / Docker) ────────────────────────────────────
// In production, serve the built React app from /dist.
// The Dockerfile copies the Vite build output here.
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const distPath = join(__dirname, 'dist');

if (existsSync(distPath)) {
  app.use(express.static(distPath));
  // SPA fallback — serve index.html for any non-API route
  app.get('*', (req, res) => {
    if (req.path.startsWith('/api/') || req.path === '/health' || req.path === '/ws') {
      return res.status(404).json({ error: 'Endpoint not found' });
    }
    res.sendFile(join(distPath, 'index.html'));
  });
} else {
  // No built frontend — just serve API 404
  app.use((req, res) => {
    res.status(404).json({ error: 'Endpoint not found' });
  });
}

// ── Error handling middleware ─────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('❌ Server error:', err.stack);

  // CORS error
  if (err.message === 'Not allowed by CORS') {
    return res.status(403).json({ error: 'CORS: Origin not allowed' });
  }

  // JSON parse error
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Invalid JSON in request body' });
  }

  // Payload too large
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ error: 'Request body too large' });
  }

  res.status(500).json({
    error: isProd ? 'Internal server error' : err.message,
  });
});

// ── Start server ─────────────────────────────────────────────────────────────
server.listen(PORT, () => {
  console.log('='.repeat(50));
  console.log('🚀 SERVER STARTED SUCCESSFULLY');
  console.log('='.repeat(50));
  console.log(`🌐 HTTP Server: http://localhost:${PORT}`);
  console.log(`🔌 WebSocket Server: ws://localhost:${PORT}/ws`);
  console.log(`📚 API Base URL: http://localhost:${PORT}/api`);
  console.log(`❤️  Health Check: http://localhost:${PORT}/health`);
  console.log('='.repeat(50));
});

// ── Graceful Shutdown ────────────────────────────────────────────────────────
const gracefulShutdown = async (signal) => {
  console.log(`\n${signal} received. Starting graceful shutdown...`);

  // Stop accepting new connections
  server.close(() => {
    console.log('🔌 HTTP server closed');
  });

  // Destroy cache
  cache.destroy();
  console.log('🗑️  Cache cleared');

  // Close database pool
  try {
    await pool.end();
    console.log('🗄️  Database pool closed');
  } catch (err) {
    console.error('Error closing database pool:', err);
  }

  console.log('👋 Shutdown complete');
  process.exit(0);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

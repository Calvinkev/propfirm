import { WebSocketServer } from 'ws';
import jwt from 'jsonwebtoken';
import pool from '../config/database.js';

const clients = new Map(); // userId -> ws

// Price room subscriptions: symbol -> Set of userIds
// e.g. priceRooms.get('BTCUSD') = Set { 1, 4, 7 }
const priceRooms = new Map();

export const setupWebSocket = (server) => {
  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws, req) => {
    // Extract token from query string or headers
    const token = new URL(req.url, `http://${req.headers.host}`).searchParams.get('token');

    if (!token) {
      ws.close(1008, 'No token provided');
      return;
    }

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const userId = decoded.userId;

      // Store client connection
      clients.set(userId, ws);

      // Send initial connection confirmation
      ws.send(JSON.stringify({
        type: 'connected',
        userId,
        message: 'WebSocket connected successfully'
      }));

      // Handle incoming messages from client
      ws.on('message', (message) => {
        try {
          const data = JSON.parse(message);
          handleClientMessage(userId, data, wss);
        } catch (error) {
          console.error('Error parsing message:', error);
        }
      });

      // Handle disconnection
      ws.on('close', () => {
        clients.delete(userId);
        // Remove from all price rooms
        priceRooms.forEach(room => room.delete(userId));
        console.log(`Client ${userId} disconnected`);
      });

      ws.on('error', (error) => {
        console.error(`WebSocket error for user ${userId}:`, error);
      });

    } catch (error) {
      console.error('WebSocket authentication error:', error);
      ws.close(1008, 'Invalid token');
    }
  });

  return wss;
};

// Broadcast message to specific user
export const sendToUser = (userId, data) => {
  const client = clients.get(userId);
  if (client && client.readyState === 1) {
    client.send(JSON.stringify(data));
  }
};

// Broadcast to all connected clients
export const broadcast = (data) => {
  clients.forEach((client) => {
    if (client.readyState === 1) {
      client.send(JSON.stringify(data));
    }
  });
};

// Handle messages from clients
const handleClientMessage = (userId, data, wss) => {
  switch (data.type) {
    case 'subscribe_account':
      // Subscribe to specific account updates
      subscribeToAccount(userId, data.accountId);
      break;
    case 'unsubscribe_account':
      unsubscribeFromAccount(userId, data.accountId);
      break;
    case 'subscribe_market_data':
      subscribeToMarketData(userId, data.symbols);
      break;
    case 'subscribe_price':
      // Subscribe to a single price room, e.g. { type: 'subscribe_price', symbol: 'BTCUSD' }
      subscribeToPriceRoom(userId, data.symbol);
      break;
    case 'unsubscribe_price':
      unsubscribeFromPriceRoom(userId, data.symbol);
      break;
    default:
      console.log('Unknown message type:', data.type);
  }
};

// Account subscriptions
const accountSubscriptions = new Map(); // userId -> Set of accountIds

const subscribeToAccount = (userId, accountId) => {
  if (!accountSubscriptions.has(userId)) {
    accountSubscriptions.set(userId, new Set());
  }
  accountSubscriptions.get(userId).add(accountId);
  console.log(`User ${userId} subscribed to account ${accountId}`);
};

const unsubscribeFromAccount = (userId, accountId) => {
  if (accountSubscriptions.has(userId)) {
    accountSubscriptions.get(userId).delete(accountId);
  }
  console.log(`User ${userId} unsubscribed from account ${accountId}`);
};

// Market data subscriptions
const marketSubscriptions = new Map(); // userId -> Set of symbols

const subscribeToMarketData = (userId, symbols) => {
  marketSubscriptions.set(userId, new Set(symbols));
  console.log(`User ${userId} subscribed to market data: ${symbols.join(', ')}`);
};

// Send account update to subscribed users
export const sendAccountUpdate = async (accountId, data) => {
  accountSubscriptions.forEach((accountIds, userId) => {
    if (accountIds.has(accountId)) {
      sendToUser(userId, {
        type: 'account_update',
        accountId,
        data
      });
    }
  });
};

// Check for breach conditions and send alert
const checkForBreach = (accountId, progress, userId) => {
  const isDailyLossBreached = progress.daily_loss_used >= progress.daily_loss_limit;
  const isDrawdownBreached = progress.max_drawdown_used >= progress.max_drawdown_limit;

  if (isDailyLossBreached || isDrawdownBreached) {
    sendToUser(userId, {
      type: 'breach_alert',
      accountId,
      data: {
        breachType: isDailyLossBreached ? 'daily_loss' : 'max_drawdown',
        current: isDailyLossBreached ? progress.daily_loss_used : progress.max_drawdown_used,
        limit: isDailyLossBreached ? progress.daily_loss_limit : progress.max_drawdown_limit
      }
    });

    // Update account status to Breached
    pool.query(
      'UPDATE accounts SET status = ? WHERE id = ?',
      ['Breached', accountId]
    ).catch(err => console.error('Error updating account status:', err));
  }
};

// Send market data update to subscribed users
export const sendMarketDataUpdate = (symbol, data) => {
  marketSubscriptions.forEach((symbols, userId) => {
    if (symbols.has(symbol)) {
      sendToUser(userId, {
        type: 'market_data',
        symbol,
        data
      });
    }
  });
};

// Simulate market data updates (for demo purposes)
export const startMarketDataSimulation = () => {
  const symbols = ['EUR/USD', 'GBP/USD', 'USD/JPY', 'BTC/USD', 'XAU/USD'];
  
  setInterval(() => {
    symbols.forEach(symbol => {
      const change = (Math.random() - 0.5) * 0.002;
      const isUp = change > 0;
      
      const marketData = {
        symbol,
        price: (1.08 + Math.random() * 0.1).toFixed(5),
        change: (change * 100).toFixed(2),
        isUp,
        timestamp: new Date().toISOString()
      };
      
      sendMarketDataUpdate(symbol, marketData);
    });
  }, 2000); // Update every 2 seconds
};

// ─── Price room helpers (used by priceFeed.js) ───────────────────────────────

const subscribeToPriceRoom = (userId, symbol) => {
  if (!symbol) return;
  if (!priceRooms.has(symbol)) priceRooms.set(symbol, new Set());
  priceRooms.get(symbol).add(userId);
};

const unsubscribeFromPriceRoom = (userId, symbol) => {
  if (priceRooms.has(symbol)) priceRooms.get(symbol).delete(userId);
};

/**
 * Broadcast a live price tick to all clients subscribed to that symbol's room.
 * Called by priceFeed._handleTick() on every incoming tick.
 */
export const broadcastPrice = (symbol, priceData) => {
  const room = priceRooms.get(symbol);
  if (!room || room.size === 0) return;

  const msg = JSON.stringify({
    type: 'price_tick',
    symbol,
    ...priceData, // { bid, ask, timestamp }
  });

  room.forEach(userId => {
    const ws = clients.get(userId);
    if (ws && ws.readyState === 1) ws.send(msg);
  });
};

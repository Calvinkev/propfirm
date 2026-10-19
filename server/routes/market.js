import express from 'express';
import { auth } from '../middleware/auth.js';
import { sendMarketDataUpdate } from '../websocket/server.js';

const router = express.Router();

// Simulated market data store
const marketDataStore = {
  'EUR/USD': { price: 1.0842, change: 0.12 },
  'GBP/USD': { price: 1.2701, change: 0.08 },
  'USD/JPY': { price: 156.22, change: -0.15 },
  'BTC/USD': { price: 67214, change: 1.02 },
  'XAU/USD': { price: 2318.40, change: -0.34 },
  'US30': { price: 39842, change: 0.21 },
  'NAS100': { price: 18442, change: -0.09 }
};

// Get current market data (public endpoint for landing page)
router.get('/current', async (req, res) => {
  try {
    const symbols = req.query.symbols ? req.query.symbols.split(',') : Object.keys(marketDataStore);
    
    const prices = {};
    symbols.forEach(symbol => {
      if (marketDataStore[symbol]) {
        prices[symbol] = marketDataStore[symbol];
      }
    });

    res.json({ prices });
  } catch (error) {
    console.error('Market data fetch error:', error);
    res.status(500).json({ error: 'Server error fetching market data' });
  }
});

// Get historical market data (simulated)
router.get('/history/:symbol', auth, async (req, res) => {
  try {
    const { symbol } = req.params;
    const { timeframe = '1d' } = req.query;

    // Generate simulated historical data
    const history = [];
    let basePrice = marketDataStore[symbol]?.price || 100;
    
    for (let i = 0; i < 100; i++) {
      const change = (Math.random() - 0.5) * (basePrice * 0.002);
      basePrice += change;
      history.push({
        timestamp: new Date(Date.now() - (99 - i) * 3600000).toISOString(),
        price: basePrice.toFixed(5)
      });
    }

    res.json({ symbol, timeframe, history });
  } catch (error) {
    console.error('Market history fetch error:', error);
    res.status(500).json({ error: 'Server error fetching market history' });
  }
});

// Update market data (internal use)
router.post('/update', auth, async (req, res) => {
  try {
    const { symbol, price, change } = req.body;

    if (!symbol || !price || change === undefined) {
      return res.status(400).json({ error: 'Symbol, price, and change are required' });
    }

    // Update store
    marketDataStore[symbol] = { price, change };

    // Broadcast to WebSocket clients
    sendMarketDataUpdate(symbol, {
      symbol,
      price: price.toFixed(5),
      change: change.toFixed(2),
      isUp: change > 0,
      timestamp: new Date().toISOString()
    });

    res.json({ message: 'Market data updated and broadcasted' });
  } catch (error) {
    console.error('Market data update error:', error);
    res.status(500).json({ error: 'Server error updating market data' });
  }
});

export default router;

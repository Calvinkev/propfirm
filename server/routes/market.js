import express from 'express';
import pool from '../config/database.js';
import { getLatestPrice, getAllLatestPrices } from '../services/priceFeed.js';

const router = express.Router();

// Default fallback prices
const FALLBACK_PRICES = {
  BTCUSDT: { price: 67500.50, change24h: 2.45, high24h: 68200.00, low24h: 65900.00, volume24h: 1245080000 },
  ETHUSDT: { price: 3520.10, change24h: -1.15, high24h: 3600.00, low24h: 3480.00, volume24h: 890450000 },
  SOLUSDT: { price: 154.80, change24h: 5.82, high24h: 158.20, low24h: 144.50, volume24h: 412000000 },
  BNBUSDT: { price: 582.40, change24h: 0.95, high24h: 589.00, low24h: 575.00, volume24h: 215000000 },
  XRPUSDT: { price: 0.5480, change24h: -0.80, high24h: 0.5610, low24h: 0.5410, volume24h: 180000000 },
  DOGEUSDT: { price: 0.1240, change24h: 12.40, high24h: 0.1310, low24h: 0.1090, volume24h: 320000000 },
  ADAUSDT: { price: 0.4450, change24h: 1.10, high24h: 0.4580, low24h: 0.4380, volume24h: 95000000 }
};

// Get current market overview / ticker prices
router.get('/current', async (req, res) => {
  try {
    const livePrices = getAllLatestPrices();
    const result = {};

    Object.keys(FALLBACK_PRICES).forEach(symbol => {
      const live = livePrices[symbol];
      const fallback = FALLBACK_PRICES[symbol];

      result[symbol] = {
        symbol,
        price: live ? live.ask : fallback.price,
        bid: live ? live.bid : fallback.price * 0.9998,
        ask: live ? live.ask : fallback.price * 1.0002,
        change24h: fallback.change24h,
        high24h: fallback.high24h,
        low24h: fallback.low24h,
        volume24h: fallback.volume24h
      };
    });

    res.json({ markets: result });
  } catch (error) {
    console.error('Market prices error:', error);
    res.status(500).json({ error: 'Failed to fetch market data' });
  }
});

// Get historical candle data for trading charts
router.get('/candles/:symbol', async (req, res) => {
  try {
    const symbol = req.params.symbol.toUpperCase();
    const timeframe = req.query.timeframe || '1h';
    const limit = parseInt(req.query.limit || '100', 10);

    const livePrice = getLatestPrice(symbol);
    const basePrice = livePrice?.ask || FALLBACK_PRICES[symbol]?.price || 100;

    const candles = [];
    let curPrice = basePrice;
    const now = Math.floor(Date.now() / 1000);
    const intervalSeconds = timeframe === '1m' ? 60 : timeframe === '15m' ? 900 : timeframe === '1h' ? 3600 : 86400;

    for (let i = limit; i >= 0; i--) {
      const time = now - (i * intervalSeconds);
      const volatility = curPrice * 0.008;
      const open = curPrice + (Math.random() - 0.5) * volatility;
      const high = Math.max(open, curPrice) + Math.random() * volatility * 0.5;
      const low = Math.min(open, curPrice) - Math.random() * volatility * 0.5;
      const close = curPrice;

      candles.push({
        time,
        open: parseFloat(open.toFixed(4)),
        high: parseFloat(high.toFixed(4)),
        low: parseFloat(low.toFixed(4)),
        close: parseFloat(close.toFixed(4)),
      });

      curPrice = open;
    }

    res.json({ symbol, timeframe, candles });
  } catch (error) {
    console.error('Candles fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch chart candles' });
  }
});

export default router;

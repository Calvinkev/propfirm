import express from 'express';
import pool from '../config/database.js';
import { getLatestPrice, getAllLatestPrices } from '../services/priceFeed.js';

const router = express.Router();

// Supported timeframes → Binance interval string + seconds per candle
const TIMEFRAME_MAP = {
  '1m':  { interval: '1m',  seconds: 60 },
  '5m':  { interval: '5m',  seconds: 300 },
  '15m': { interval: '15m', seconds: 900 },
  '1h':  { interval: '1h',  seconds: 3600 },
  '4h':  { interval: '4h',  seconds: 14400 },
  '1d':  { interval: '1d',  seconds: 86400 },
  '1w':  { interval: '1w',  seconds: 604800 },
};

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

/**
 * Fetch real OHLCV candles from Binance public API.
 * No API key required. Returns up to 1000 candles per call.
 */
async function fetchBinanceCandles(symbol, interval, limit = 1000) {
  try {
    const url = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`;
    const resp = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!resp.ok) throw new Error(`Binance HTTP ${resp.status}`);
    const data = await resp.json();
    // Binance kline: [openTime, open, high, low, close, volume, ...]
    return data.map(k => ({
      time:   Math.floor(k[0] / 1000),
      open:   parseFloat(k[1]),
      high:   parseFloat(k[2]),
      low:    parseFloat(k[3]),
      close:  parseFloat(k[4]),
      volume: parseFloat(k[5]),
    }));
  } catch (err) {
    console.error(`fetchBinanceCandles error (${symbol} ${interval}):`, err.message);
    return null; // null = fall back to synthetic
  }
}

/**
 * Generate synthetic candles as a last-resort fallback.
 */
function generateSyntheticCandles(basePrice, intervalSeconds, limit) {
  const candles = [];
  let curPrice = basePrice;
  const now = Math.floor(Date.now() / 1000);
  for (let i = limit; i >= 0; i--) {
    const time = now - (i * intervalSeconds);
    const volatility = curPrice * 0.008;
    const open  = curPrice + (Math.random() - 0.5) * volatility;
    const high  = Math.max(open, curPrice) + Math.random() * volatility * 0.5;
    const low   = Math.min(open, curPrice) - Math.random() * volatility * 0.5;
    const close = curPrice;
    candles.push({ time, open: +open.toFixed(4), high: +high.toFixed(4), low: +low.toFixed(4), close: +close.toFixed(4) });
    curPrice = open;
  }
  return candles;
}

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
    const symbol    = req.params.symbol.toUpperCase();
    const timeframe = req.query.timeframe || '1h';
    const limit     = Math.min(parseInt(req.query.limit || '1000', 10), 1000);

    const tf = TIMEFRAME_MAP[timeframe] || TIMEFRAME_MAP['1h'];

    // Try real Binance data first
    const candles = await fetchBinanceCandles(symbol, tf.interval, limit);

    if (candles && candles.length > 0) {
      return res.json({ symbol, timeframe, candles, source: 'binance' });
    }

    // Fallback: synthetic candles
    const livePrice = getLatestPrice(symbol);
    const basePrice = livePrice?.ask || FALLBACK_PRICES[symbol]?.price || 100;
    const synthetic = generateSyntheticCandles(basePrice, tf.seconds, limit);
    res.json({ symbol, timeframe, candles: synthetic, source: 'synthetic' });

  } catch (error) {
    console.error('Candles fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch chart candles' });
  }
});

export default router;

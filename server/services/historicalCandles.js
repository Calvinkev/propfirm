/**
 * Historical Candles Service
 *
 * Fetches real OHLC candle history from Binance public REST API (no key needed).
 * Used as a fallback when the local price_ticks table doesn't have enough data
 * to render a meaningful chart.
 *
 * Binance klines endpoint:
 *   GET https://api.binance.com/api/v3/klines
 *   ?symbol=BTCUSDT&interval=1m&limit=1000
 *
 * Returns up to 1000 candles per request. We chain requests for larger histories.
 */

// Map our internal symbols to Binance trading pairs
const SYMBOL_MAP = {
  BTCUSD: 'BTCUSDT',
  ETHUSD: 'ETHUSDT',
};

// Map our resolution (minutes) to Binance interval strings
const INTERVAL_MAP = {
  1:    '1m',
  5:    '5m',
  15:   '15m',
  60:   '1h',
  240:  '4h',
  1440: '1d',
};

/**
 * Fetch historical klines from Binance.
 * @param {string} ourSymbol  - e.g. 'BTCUSD'
 * @param {number} resolution - candle width in minutes (1, 5, 15, 60)
 * @param {number} limit      - how many candles to fetch (max ~1000 per request)
 * @returns {Array<{time: number, open: number, high: number, low: number, close: number}>}
 */
export async function fetchBinanceCandles(ourSymbol, resolution = 1, limit = 1000) {
  const binanceSymbol = SYMBOL_MAP[ourSymbol];
  if (!binanceSymbol) return []; // not a symbol we can fetch from Binance

  const interval = INTERVAL_MAP[resolution] || '1m';
  const perRequest = Math.min(limit, 1000);

  try {
    const url = `https://api.binance.com/api/v3/klines?symbol=${binanceSymbol}&interval=${interval}&limit=${perRequest}`;
    const resp = await fetch(url);
    if (!resp.ok) {
      console.error(`Binance klines HTTP ${resp.status} for ${binanceSymbol}`);
      return [];
    }

    const data = await resp.json();

    // Binance kline format: [openTime, open, high, low, close, volume, closeTime, ...]
    const candles = data.map(k => ({
      time:  Math.floor(k[0] / 1000), // openTime ms -> seconds
      open:  parseFloat(k[1]),
      high:  parseFloat(k[2]),
      low:   parseFloat(k[3]),
      close: parseFloat(k[4]),
    }));

    return candles;
  } catch (err) {
    console.error(`fetchBinanceCandles error for ${ourSymbol}:`, err.message);
    return [];
  }
}

/**
 * Fetch a larger history by chaining multiple Binance requests (up to 3000 candles).
 * Useful for higher timeframes where you want deep history.
 */
export async function fetchDeepHistory(ourSymbol, resolution = 1, totalCandles = 3000) {
  const binanceSymbol = SYMBOL_MAP[ourSymbol];
  if (!binanceSymbol) return [];

  const interval = INTERVAL_MAP[resolution] || '1m';
  const intervalMs = resolution * 60 * 1000;
  const allCandles = [];
  let endTime = Date.now();
  let remaining = totalCandles;

  while (remaining > 0) {
    const batch = Math.min(remaining, 1000);
    try {
      const url = `https://api.binance.com/api/v3/klines?symbol=${binanceSymbol}&interval=${interval}&limit=${batch}&endTime=${endTime}`;
      const resp = await fetch(url);
      if (!resp.ok) break;

      const data = await resp.json();
      if (data.length === 0) break;

      const candles = data.map(k => ({
        time:  Math.floor(k[0] / 1000),
        open:  parseFloat(k[1]),
        high:  parseFloat(k[2]),
        low:   parseFloat(k[3]),
        close: parseFloat(k[4]),
      }));

      allCandles.unshift(...candles);
      remaining -= data.length;

      // Move endTime to before the oldest candle in this batch
      endTime = data[0][0] - 1;

      // Safety: if we got fewer than requested, no more data
      if (data.length < batch) break;
    } catch (err) {
      console.error(`fetchDeepHistory page error:`, err.message);
      break;
    }
  }

  // Deduplicate by time
  const seen = new Set();
  return allCandles.filter(c => {
    if (seen.has(c.time)) return false;
    seen.add(c.time);
    return true;
  }).sort((a, b) => a.time - b.time);
}

/**
 * Price Feed Service
 *
 * Adapter pattern — each data source implements the same interface:
 *   start()   — begin streaming prices
 *   stop()    — cleanly shut down
 *   onTick(cb) — register a callback: cb({ symbol, bid, ask, timestamp })
 *
 * Current adapters:
 *   BinanceAdapter  — crypto via Binance public WebSocket (no API key)
 *
 * To add a forex source (Twelve Data, OANDA, etc.) later:
 *   1. Create a new class that implements the same three methods
 *   2. Instantiate it in PriceFeedService.start() and push to this.adapters
 *   No other code needs changing.
 */

import WebSocket from 'ws';
import pool from '../config/database.js';
import { broadcastPrice } from '../websocket/server.js';

// ─── Instrument cache ────────────────────────────────────────────────────────
// Loaded once at startup: symbol -> { id, pip_size, contract_size, spread_pips }
let instrumentCache = {}; // e.g. { BTCUSD: { id: 1, ... } }

async function loadInstruments() {
  const [rows] = await pool.query(
    'SELECT id, symbol, pip_size, contract_size, spread_pips FROM instruments WHERE is_active = 1'
  );
  rows.forEach(r => {
    instrumentCache[r.symbol] = r;
  });
  console.log(`📋 Instruments loaded: ${Object.keys(instrumentCache).join(', ')}`);
}

export function getInstrumentCache() {
  return instrumentCache;
}

export function getInstrument(symbol) {
  return instrumentCache[symbol] || null;
}

// ─── In-memory latest price store ────────────────────────────────────────────
// latestPrices[symbol] = { bid, ask, timestamp }
// This is the hot path — DB writes happen on a lower-frequency timer below.
const latestPrices = {};

export function getLatestPrice(symbol) {
  return latestPrices[symbol] || null;
}

export function getAllLatestPrices() {
  return { ...latestPrices };
}

// ─── Binance adapter ─────────────────────────────────────────────────────────
// Uses Binance combined stream for bookTicker (best bid/ask, no key needed).
// Symbols in Binance format: btcusdt, ethusdt, etc.
// We map back to our internal symbols: BTCUSD, ETHUSD, etc.

const BINANCE_SYMBOL_MAP = {
  // binance stream name -> our symbol
  btcusdt: 'BTCUSD',
  ethusdt: 'ETHUSD',
};

class BinanceAdapter {
  constructor() {
    this.ws = null;
    this.tickCallbacks = [];
    this.reconnectTimer = null;
    this.stopped = false;
    this.reconnectDelay = 3000;
    this.maxReconnectDelay = 60000;
  }

  onTick(cb) {
    this.tickCallbacks.push(cb);
  }

  _emit(tick) {
    this.tickCallbacks.forEach(cb => cb(tick));
  }

  start() {
    this.stopped = false;
    this._connect();
  }

  stop() {
    this.stopped = true;
    clearTimeout(this.reconnectTimer);
    if (this.ws) {
      this.ws.removeAllListeners();
      this.ws.terminate();
      this.ws = null;
    }
    console.log('🔌 BinanceAdapter stopped');
  }

  _connect() {
    const streams = Object.keys(BINANCE_SYMBOL_MAP)
      .map(s => `${s}@bookTicker`)
      .join('/');
    const url = `wss://stream.binance.com:9443/stream?streams=${streams}`;

    console.log('📡 BinanceAdapter connecting to Binance stream...');
    this.ws = new WebSocket(url);

    this.ws.on('open', () => {
      this.reconnectDelay = 3000; // reset backoff on successful connect
      console.log('✅ BinanceAdapter connected');
    });

    this.ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw);
        const d = msg.data;
        if (!d || !d.s) return;

        const ourSymbol = BINANCE_SYMBOL_MAP[d.s.toLowerCase()];
        if (!ourSymbol) return;

        const bid = parseFloat(d.b);
        const ask = parseFloat(d.a);
        if (isNaN(bid) || isNaN(ask)) return;

        const tick = { symbol: ourSymbol, bid, ask, timestamp: new Date() };
        this._emit(tick);
      } catch (err) {
        console.error('BinanceAdapter parse error:', err.message);
      }
    });

    this.ws.on('close', (code) => {
      if (this.stopped) return;
      console.warn(`⚠️  BinanceAdapter disconnected (${code}), reconnecting in ${this.reconnectDelay}ms...`);
      this.reconnectTimer = setTimeout(() => {
        this.reconnectDelay = Math.min(this.reconnectDelay * 2, this.maxReconnectDelay);
        this._connect();
      }, this.reconnectDelay);
    });

    this.ws.on('error', (err) => {
      console.error('BinanceAdapter WS error:', err.message);
      // 'close' event fires after 'error', reconnect happens there
    });
  }
}

// ─── Placeholder for future forex adapter ────────────────────────────────────
// When you have a Twelve Data / OANDA key, create a class like this:
//
// class TwelveDataAdapter {
//   constructor(apiKey) { this.apiKey = apiKey; ... }
//   onTick(cb) { ... }
//   start() { ... }  // open WebSocket to wss://ws.twelvedata.com/v1/quotes/price
//   stop() { ... }
// }
//
// Then in PriceFeedService.start(), do:
//   const forex = new TwelveDataAdapter(process.env.TWELVE_DATA_KEY);
//   forex.onTick(tick => this._handleTick(tick));
//   forex.start();
//   this.adapters.push(forex);

// ─── DB persistence (throttled) ──────────────────────────────────────────────
// We don't write every tick to the DB — that would generate millions of rows fast.
// Instead we batch-write the latest price for each symbol every DB_WRITE_INTERVAL ms.
const DB_WRITE_INTERVAL = 5000; // write to price_ticks every 5 seconds

const pendingTicks = {}; // symbol -> latest tick waiting to be flushed

async function flushTicksToDB() {
  const symbols = Object.keys(pendingTicks);
  if (symbols.length === 0) return;

  const toFlush = { ...pendingTicks };
  // clear pending before async work to avoid double-writes on slow queries
  symbols.forEach(s => delete pendingTicks[s]);

  for (const symbol of symbols) {
    const tick = toFlush[symbol];
    const instrument = instrumentCache[symbol];
    if (!instrument) continue;

    try {
      await pool.query(
        'INSERT INTO price_ticks (instrument_id, bid, ask, timestamp) VALUES (?, ?, ?, ?)',
        [instrument.id, tick.bid, tick.ask, tick.timestamp]
      );
    } catch (err) {
      console.error(`price_ticks insert error for ${symbol}:`, err.message);
    }
  }
}

// ─── Main service ─────────────────────────────────────────────────────────────
class PriceFeedService {
  constructor() {
    this.adapters = [];
    this.dbFlushTimer = null;
  }

  async start() {
    await loadInstruments();

    // Binance adapter (crypto — no key needed)
    const binance = new BinanceAdapter();
    binance.onTick(tick => this._handleTick(tick));
    binance.start();
    this.adapters.push(binance);

    // Throttled DB flush
    this.dbFlushTimer = setInterval(flushTicksToDB, DB_WRITE_INTERVAL);

    console.log('✅ PriceFeedService started');
  }

  stop() {
    this.adapters.forEach(a => a.stop());
    this.adapters = [];
    clearInterval(this.dbFlushTimer);
    console.log('🛑 PriceFeedService stopped');
  }

  /**
   * Central tick handler — called by every adapter on every incoming price.
   * 1. Updates in-memory latest price (hot path, sync)
   * 2. Queues tick for DB batch write
   * 3. Broadcasts to WebSocket subscribers
   * 4. Triggers matching engine SL/TP + pending order checks (imported lazily
   *    to avoid circular deps — matching engine imports this file for prices)
   */
  _handleTick(tick) {
    const { symbol, bid, ask, timestamp } = tick;

    // 1. Update hot cache
    latestPrices[symbol] = { bid, ask, timestamp };

    // 2. Queue for DB flush
    pendingTicks[symbol] = tick;

    // 3. Broadcast to WS subscribers
    broadcastPrice(symbol, { bid, ask, timestamp: timestamp.toISOString() });

    // 4. Trigger matching engine checks (lazy import avoids circular dependency)
    import('./matchingEngine.js').then(({ onPriceTick }) => {
      onPriceTick(symbol, bid, ask).catch(err =>
        console.error(`matchingEngine.onPriceTick error (${symbol}):`, err.message)
      );
    });
  }
}

// Singleton
export const priceFeed = new PriceFeedService();

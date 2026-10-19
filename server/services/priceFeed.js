import WebSocket from 'ws';
import pool from '../config/database.js';
import { broadcastPrice } from '../websocket/server.js';

let instrumentCache = {};

async function loadInstruments() {
  try {
    const [rows] = await pool.query(
      'SELECT id, symbol, base_asset, quote_asset, pip_size, contract_size, spread_pips FROM instruments WHERE is_active = 1'
    );
    rows.forEach(r => {
      instrumentCache[r.symbol] = r;
    });
    console.log(`📋 Active spot instruments loaded: ${Object.keys(instrumentCache).join(', ')}`);
  } catch (err) {
    console.error('Error loading instruments:', err.message);
  }
}

export function getInstrumentCache() {
  return instrumentCache;
}

export function getInstrument(symbol) {
  return instrumentCache[symbol] || null;
}

const latestPrices = {};

export function getLatestPrice(symbol) {
  return latestPrices[symbol] || null;
}

export function getAllLatestPrices() {
  return { ...latestPrices };
}

// Binance stream map -> internal symbol
const BINANCE_SYMBOL_MAP = {
  btcusdt: 'BTCUSDT',
  ethusdt: 'ETHUSDT',
  solusdt: 'SOLUSDT',
  bnbusdt: 'BNBUSDT',
  xrpusdt: 'XRPUSDT',
  dogeusdt: 'DOGEUSDT',
  adausdt: 'ADAUSDT'
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

    console.log('📡 BinanceAdapter connecting to Binance official WS stream...');
    this.ws = new WebSocket(url);

    this.ws.on('open', () => {
      this.reconnectDelay = 3000;
      console.log('✅ BinanceAdapter connected to live crypto stream');
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
      console.warn(`⚠️ BinanceAdapter disconnected (${code}), reconnecting in ${this.reconnectDelay}ms...`);
      this.reconnectTimer = setTimeout(() => {
        this.reconnectDelay = Math.min(this.reconnectDelay * 2, this.maxReconnectDelay);
        this._connect();
      }, this.reconnectDelay);
    });

    this.ws.on('error', (err) => {
      console.error('BinanceAdapter WS error:', err.message);
    });
  }
}

const DB_WRITE_INTERVAL = 5000;
const pendingTicks = {};

async function flushTicksToDB() {
  const symbols = Object.keys(pendingTicks);
  if (symbols.length === 0) return;

  const toFlush = { ...pendingTicks };
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

class PriceFeedService {
  constructor() {
    this.adapters = [];
    this.dbFlushTimer = null;
  }

  async start() {
    await loadInstruments();

    const binance = new BinanceAdapter();
    binance.onTick(tick => this._handleTick(tick));
    binance.start();
    this.adapters.push(binance);

    this.dbFlushTimer = setInterval(flushTicksToDB, DB_WRITE_INTERVAL);
    console.log('✅ PriceFeedService initialized');
  }

  stop() {
    this.adapters.forEach(a => a.stop());
    this.adapters = [];
    clearInterval(this.dbFlushTimer);
    console.log('🛑 PriceFeedService stopped');
  }

  _handleTick(tick) {
    const { symbol, bid, ask, timestamp } = tick;
    latestPrices[symbol] = { bid, ask, timestamp };
    pendingTicks[symbol] = tick;
    broadcastPrice(symbol, { bid, ask, timestamp: timestamp.toISOString() });
  }
}

export const priceFeed = new PriceFeedService();

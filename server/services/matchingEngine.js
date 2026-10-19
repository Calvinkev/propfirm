/**
 * Matching Engine
 *
 * Pure logic module — no Express, no HTTP. Called by:
 *   - API routes (placeOrder, closePosition)
 *   - priceFeed._handleTick() (onPriceTick — checks pending orders + SL/TP)
 *
 * All monetary values are stored and computed as JS Numbers (DECIMAL in DB).
 * Profit formula: direction=buy  → (closePrice - openPrice) * lots * contractSize
 *                 direction=sell → (openPrice - closePrice) * lots * contractSize
 *
 * Margin formula: marginRequired = (lots * contractSize * price) / leverage
 * Margin level:   equity / marginUsed * 100  (stop-out below STOP_OUT_LEVEL %)
 */

import pool from '../config/database.js';
import { getLatestPrice, getInstrument } from './priceFeed.js';
import { sendAccountUpdate } from '../websocket/server.js';

const STOP_OUT_LEVEL = 50; // % — auto-close positions below this margin level

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Fetch a demo account row by id. Returns null if not found.
 */
async function getAccount(accountId) {
  const [rows] = await pool.query(
    'SELECT * FROM demo_accounts WHERE id = ?',
    [accountId]
  );
  return rows[0] || null;
}

/**
 * Fetch an instrument row, preferring the in-memory cache first.
 */
async function getInstrumentById(instrumentId) {
  // Try memory cache (has all active instruments)
  const cache = Object.values(await import('./priceFeed.js').then(m => m.getInstrumentCache()));
  const cached = cache.find(i => i.id === instrumentId);
  if (cached) return cached;

  const [rows] = await pool.query(
    'SELECT * FROM instruments WHERE id = ?',
    [instrumentId]
  );
  return rows[0] || null;
}

/**
 * Calculate floating (unrealised) P&L for an open position.
 *
 * @param {object} position  - demo_positions row
 * @param {object} instrument - instruments row
 * @param {number} currentBid
 * @param {number} currentAsk
 * @returns {number} floating P&L in account currency
 */
export function calculateFloatingPL(position, instrument, currentBid, currentAsk) {
  const contractSize = parseFloat(instrument.contract_size);
  const lots         = parseFloat(position.lots);

  // For a buy we close at bid; for a sell we close at ask
  const closePrice = position.direction === 'buy' ? currentBid : currentAsk;
  const openPrice  = parseFloat(position.open_price);

  if (position.direction === 'buy') {
    return (closePrice - openPrice) * lots * contractSize;
  } else {
    return (openPrice - closePrice) * lots * contractSize;
  }
}

/**
 * Calculate total margin used across all open positions for an account.
 * marginRequired per position = (lots * contractSize * openPrice) / leverage
 */
async function calcMarginUsed(accountId) {
  const account = await getAccount(accountId);
  if (!account) return 0;

  const [positions] = await pool.query(
    `SELECT dp.lots, dp.open_price, dp.instrument_id
     FROM demo_positions dp
     WHERE dp.account_id = ? AND dp.status = 'open'`,
    [accountId]
  );

  let marginUsed = 0;
  const leverage = account.leverage || 100;

  for (const pos of positions) {
    const instr = await getInstrumentById(pos.instrument_id);
    if (!instr) continue;
    const contractSize = parseFloat(instr.contract_size);
    marginUsed += (parseFloat(pos.lots) * contractSize * parseFloat(pos.open_price)) / leverage;
  }

  return marginUsed;
}

/**
 * Compute current equity for an account (balance + all floating P&L).
 */
async function calcEquity(accountId) {
  const account = await getAccount(accountId);
  if (!account) return 0;

  const [positions] = await pool.query(
    `SELECT dp.*, i.contract_size, i.symbol
     FROM demo_positions dp
     JOIN instruments i ON dp.instrument_id = i.id
     WHERE dp.account_id = ? AND dp.status = 'open'`,
    [accountId]
  );

  let floatingPL = 0;
  for (const pos of positions) {
    const price = getLatestPrice(pos.symbol);
    if (!price) continue;
    floatingPL += calculateFloatingPL(pos, pos, price.bid, price.ask);
  }

  return parseFloat(account.balance) + floatingPL;
}

// ─── Margin check ─────────────────────────────────────────────────────────────

/**
 * Check margin level and auto-close all positions if it breaches STOP_OUT_LEVEL.
 * Returns { marginUsed, freeMargin, marginLevel, equity }
 */
export async function checkMarginLevel(accountId) {
  const account    = await getAccount(accountId);
  if (!account) return null;

  const equity     = await calcEquity(accountId);
  const marginUsed = await calcMarginUsed(accountId);
  const freeMargin = equity - marginUsed;
  const marginLevel = marginUsed > 0 ? (equity / marginUsed) * 100 : Infinity;

  if (marginLevel < STOP_OUT_LEVEL && marginUsed > 0) {
    console.warn(`⚠️  Stop-out triggered for demo account ${accountId} (margin level: ${marginLevel.toFixed(1)}%)`);
    // Auto-close all open positions at current market price
    const [openPositions] = await pool.query(
      `SELECT dp.*, i.symbol FROM demo_positions dp
       JOIN instruments i ON dp.instrument_id = i.id
       WHERE dp.account_id = ? AND dp.status = 'open'`,
      [accountId]
    );

    for (const pos of openPositions) {
      const price = getLatestPrice(pos.symbol);
      if (!price) continue;
      const closePrice = pos.direction === 'buy' ? price.bid : price.ask;
      await closePosition(pos.id, closePrice);
    }
  }

  return { equity, marginUsed, freeMargin, marginLevel };
}

// ─── SL/TP check ──────────────────────────────────────────────────────────────

/**
 * Check if a position's SL or TP has been hit by the current price.
 * Returns 'sl', 'tp', or null.
 */
export function checkSlTp(position, currentBid, currentAsk) {
  const sl = position.sl ? parseFloat(position.sl) : null;
  const tp = position.tp ? parseFloat(position.tp) : null;

  if (position.direction === 'buy') {
    // For a buy: SL is below open price (hit when bid falls to SL)
    //            TP is above open price (hit when bid rises to TP)
    if (sl !== null && currentBid <= sl) return 'sl';
    if (tp !== null && currentBid >= tp) return 'tp';
  } else {
    // For a sell: SL is above open price (hit when ask rises to SL)
    //             TP is below open price (hit when ask falls to TP)
    if (sl !== null && currentAsk >= sl) return 'sl';
    if (tp !== null && currentAsk <= tp) return 'tp';
  }

  return null;
}

// ─── closePosition ────────────────────────────────────────────────────────────

/**
 * Close an open position, realise P&L, update account balance.
 *
 * @param {number} positionId
 * @param {number} closePrice  - the price at which to close
 * @returns {object} { position, profit }
 */
export async function closePosition(positionId, closePrice) {
  const [rows] = await pool.query(
    `SELECT dp.*, i.contract_size, i.symbol
     FROM demo_positions dp
     JOIN instruments i ON dp.instrument_id = i.id
     WHERE dp.id = ? AND dp.status = 'open'`,
    [positionId]
  );

  if (rows.length === 0) {
    throw new Error(`Position ${positionId} not found or already closed`);
  }

  const position = rows[0];
  const lots         = parseFloat(position.lots);
  const contractSize = parseFloat(position.contract_size);
  const openPrice    = parseFloat(position.open_price);

  let profit;
  if (position.direction === 'buy') {
    profit = (closePrice - openPrice) * lots * contractSize;
  } else {
    profit = (openPrice - closePrice) * lots * contractSize;
  }
  profit = parseFloat(profit.toFixed(2));

  // Mark position closed
  await pool.query(
    `UPDATE demo_positions
     SET status = 'closed', close_price = ?, profit = ?, closed_at = NOW()
     WHERE id = ?`,
    [closePrice, profit, positionId]
  );

  // Realise P&L into account balance
  await pool.query(
    'UPDATE demo_accounts SET balance = balance + ?, equity = balance + ? WHERE id = ?',
    [profit, profit, position.account_id]
  );

  // Take an equity snapshot
  await snapshotAccount(position.account_id);

  // Notify WebSocket subscribers
  const marginStats = await checkMarginLevel(position.account_id);
  sendAccountUpdate(position.account_id, {
    event: 'position_closed',
    positionId,
    profit,
    ...marginStats,
  });

  return { position, profit };
}

// ─── placeOrder ───────────────────────────────────────────────────────────────

/**
 * Place a new order. Market orders fill immediately; limit/stop orders pend.
 *
 * @param {number} accountId
 * @param {number} instrumentId
 * @param {'market'|'limit'|'stop'} orderType
 * @param {'buy'|'sell'} direction
 * @param {number} lots
 * @param {number|null} requestedPrice  - required for limit/stop
 * @param {number|null} sl
 * @param {number|null} tp
 * @returns {object} { order, position? }  position is set if filled immediately
 */
export async function placeOrder(accountId, instrumentId, orderType, direction, lots, requestedPrice, sl, tp) {
  const account    = await getAccount(accountId);
  if (!account) throw new Error('Demo account not found');

  const instrument = await getInstrumentById(instrumentId);
  if (!instrument) throw new Error('Instrument not found');

  const contractSize = parseFloat(instrument.contract_size);
  const leverage     = account.leverage || 100;
  const spreadPips   = parseFloat(instrument.spread_pips);
  const pipSize      = parseFloat(instrument.pip_size);

  // Get current market price
  const livePrice = getLatestPrice(instrument.symbol);
  if (!livePrice && orderType === 'market') {
    throw new Error(`No live price available for ${instrument.symbol}`);
  }

  // Determine fill price (market orders fill at bid/ask + spread)
  let fillPrice = null;
  if (orderType === 'market') {
    const spreadAmount = spreadPips * pipSize;
    fillPrice = direction === 'buy'
      ? livePrice.ask + spreadAmount
      : livePrice.bid - spreadAmount;
    // snap: use ask for buy, bid for sell (spread already baked in)
    fillPrice = direction === 'buy' ? livePrice.ask : livePrice.bid;
  }

  // Margin check before accepting the order
  const fillPriceForMargin = fillPrice || requestedPrice || livePrice?.ask || 0;
  const requiredMargin = (lots * contractSize * fillPriceForMargin) / leverage;
  const currentMargin  = await calcMarginUsed(accountId);
  const equity         = await calcEquity(accountId);
  const freeMargin     = equity - currentMargin;

  if (requiredMargin > freeMargin) {
    throw new Error(
      `Insufficient margin. Required: $${requiredMargin.toFixed(2)}, Free: $${freeMargin.toFixed(2)}`
    );
  }

  // Insert order record
  const [orderResult] = await pool.query(
    `INSERT INTO demo_orders
       (account_id, instrument_id, order_type, direction, lots, requested_price, status, sl, tp)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      accountId, instrumentId, orderType, direction, lots,
      requestedPrice || fillPrice,
      orderType === 'market' ? 'filled' : 'pending',
      sl || null, tp || null,
    ]
  );
  const orderId = orderResult.insertId;

  // Market orders: open a position immediately
  let position = null;
  if (orderType === 'market') {
    await pool.query(
      'UPDATE demo_orders SET filled_at = NOW() WHERE id = ?',
      [orderId]
    );

    const [posResult] = await pool.query(
      `INSERT INTO demo_positions
         (account_id, instrument_id, direction, lots, open_price, sl, tp, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'open')`,
      [accountId, instrumentId, direction, lots, fillPrice, sl || null, tp || null]
    );

    const [posRows] = await pool.query(
      'SELECT * FROM demo_positions WHERE id = ?',
      [posResult.insertId]
    );
    position = posRows[0];

    // Snapshot after opening
    await snapshotAccount(accountId);

    // Notify WS
    const marginStats = await checkMarginLevel(accountId);
    sendAccountUpdate(accountId, { event: 'position_opened', position, ...marginStats });
  }

  const [orderRows] = await pool.query('SELECT * FROM demo_orders WHERE id = ?', [orderId]);
  return { order: orderRows[0], position };
}

// ─── onPriceTick (called by priceFeed on every tick) ─────────────────────────

/**
 * Check all pending orders and open positions for a given symbol on each tick.
 * This is the hot path — keep it as fast as possible.
 */
export async function onPriceTick(symbol, bid, ask) {
  const instrument = getInstrument(symbol);
  if (!instrument) return;

  // 1. Check pending limit/stop orders
  const [pendingOrders] = await pool.query(
    `SELECT do.* FROM demo_orders do
     WHERE do.instrument_id = ? AND do.status = 'pending'`,
    [instrument.id]
  );

  for (const order of pendingOrders) {
    let shouldFill = false;

    if (order.order_type === 'limit') {
      // Buy limit: fill when ask <= requested_price
      // Sell limit: fill when bid >= requested_price
      shouldFill = order.direction === 'buy'
        ? ask <= parseFloat(order.requested_price)
        : bid >= parseFloat(order.requested_price);
    } else if (order.order_type === 'stop') {
      // Buy stop: fill when ask >= requested_price
      // Sell stop: fill when bid <= requested_price
      shouldFill = order.direction === 'buy'
        ? ask >= parseFloat(order.requested_price)
        : bid <= parseFloat(order.requested_price);
    }

    if (shouldFill) {
      const fillPrice = order.direction === 'buy' ? ask : bid;
      await pool.query(
        `UPDATE demo_orders SET status = 'filled', filled_at = NOW() WHERE id = ?`,
        [order.id]
      );
      await pool.query(
        `INSERT INTO demo_positions
           (account_id, instrument_id, direction, lots, open_price, sl, tp, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'open')`,
        [order.account_id, order.instrument_id, order.direction, order.lots,
         fillPrice, order.sl, order.tp]
      );
      await snapshotAccount(order.account_id);
      sendAccountUpdate(order.account_id, { event: 'order_filled', orderId: order.id, fillPrice });
    }
  }

  // 2. Check SL/TP on open positions
  const [openPositions] = await pool.query(
    `SELECT dp.* FROM demo_positions dp
     WHERE dp.instrument_id = ? AND dp.status = 'open'`,
    [instrument.id]
  );

  for (const pos of openPositions) {
    const trigger = checkSlTp(pos, bid, ask);
    if (trigger) {
      const closePrice = pos.direction === 'buy' ? bid : ask;
      await closePosition(pos.id, closePrice);
    }
  }

  // 3. Check margin level for all accounts that have open positions on this symbol
  // Deduplicate account IDs from openPositions so we don't check the same account multiple times
  const accountIds = [...new Set(openPositions.map(p => p.account_id))];
  for (const accountId of accountIds) {
    await checkMarginLevel(accountId);
  }
}

// ─── Account snapshot ─────────────────────────────────────────────────────────

/**
 * Write an account_snapshots row. Called after every position open/close.
 */
async function snapshotAccount(accountId) {
  try {
    const equity     = await calcEquity(accountId);
    const marginUsed = await calcMarginUsed(accountId);
    const account    = await getAccount(accountId);
    if (!account) return;

    await pool.query(
      `INSERT INTO account_snapshots (account_id, balance, equity, margin_used, free_margin)
       VALUES (?, ?, ?, ?, ?)`,
      [accountId, account.balance, equity.toFixed(2), marginUsed.toFixed(2), (equity - marginUsed).toFixed(2)]
    );
  } catch (err) {
    console.error('snapshotAccount error:', err.message);
  }
}

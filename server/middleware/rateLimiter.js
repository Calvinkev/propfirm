import rateLimit from 'express-rate-limit';

// General API rate limiter — 1000 requests per 15 minutes per IP
// Raised from 100 because polling endpoints (orderbook, prices) hit frequently
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
  skip: (req) => {
    // Skip rate limiting for market/price data endpoints — they are polled constantly
    const polledPaths = ['/api/market/', '/api/spot/orderbook'];
    return polledPaths.some(p => req.path.startsWith(p));
  },
});

// Auth limiter — separate limits for login vs token verify
// Login/register: 20 attempts per 15 minutes (brute-force protection)
// /me verify: excluded entirely since it fires on every page load
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts. Please try again later.' },
  skip: (req) => {
    // /me is a token verification call, not a login attempt — don't rate limit it
    return req.path === '/me' && req.method === 'GET';
  },
});

// Payout request limiter — 10 per hour
export const payoutLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many payout requests. Please try again later.' },
});

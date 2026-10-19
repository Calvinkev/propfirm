/**
 * In-memory cache with TTL support.
 *
 * We use a simple Map-based cache instead of Redis for easier deployment.
 * If you want Redis, swap this with ioredis — the interface is identical.
 */

class MemoryCache {
  constructor() {
    this.store = new Map();
    // Sweep expired entries every 60s
    this._sweepInterval = setInterval(() => this._sweep(), 60_000);
  }

  /**
   * Get cached value by key.
   * Returns null if missing or expired.
   */
  get(key) {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return entry.value;
  }

  /**
   * Set value with TTL in seconds (default 60s).
   */
  set(key, value, ttlSeconds = 60) {
    this.store.set(key, {
      value,
      expiresAt: Date.now() + ttlSeconds * 1000,
    });
  }

  /**
   * Delete a specific key.
   */
  del(key) {
    this.store.delete(key);
  }

  /**
   * Invalidate all keys matching a prefix.
   * e.g. invalidatePrefix('admin:overview') clears admin overview cache.
   */
  invalidatePrefix(prefix) {
    for (const key of this.store.keys()) {
      if (key.startsWith(prefix)) {
        this.store.delete(key);
      }
    }
  }

  /**
   * Clear entire cache.
   */
  flush() {
    this.store.clear();
  }

  /** Remove expired entries */
  _sweep() {
    const now = Date.now();
    for (const [key, entry] of this.store.entries()) {
      if (now > entry.expiresAt) {
        this.store.delete(key);
      }
    }
  }

  /** Graceful shutdown */
  destroy() {
    clearInterval(this._sweepInterval);
    this.store.clear();
  }
}

// Singleton
const cache = new MemoryCache();

export default cache;

/**
 * Express middleware factory for caching GET responses.
 *
 * Usage:
 *   router.get('/overview', cacheMiddleware(30), handler);
 *
 * The cache key is built from the URL + userId so different users
 * don't see each other's data.
 */
export const cacheMiddleware = (ttlSeconds = 30) => {
  return (req, res, next) => {
    // Only cache GET requests
    if (req.method !== 'GET') return next();

    const userId = req.user?.userId || 'anon';
    const cacheKey = `http:${userId}:${req.originalUrl}`;
    const cached = cache.get(cacheKey);

    if (cached) {
      return res.json(cached);
    }

    // Monkey-patch res.json to capture the response and cache it
    const originalJson = res.json.bind(res);
    res.json = (body) => {
      // Only cache successful responses
      if (res.statusCode >= 200 && res.statusCode < 300) {
        cache.set(cacheKey, body, ttlSeconds);
      }
      return originalJson(body);
    };

    next();
  };
};

/**
 * Redis-backed rate limiter
 * Replaces in-memory rate limiting for scalability and persistence
 */
const redis = require('redis');
const logger = require('./logger');

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
let client = null;
let isConnected = false;

/**
 * Initialize Redis connection
 */
async function initRedis() {
  try {
    client = redis.createClient({ url: REDIS_URL });
    
    client.on('error', (err) => {
      logger.error('Redis error', { error: err.message });
      // Fallback to in-memory if Redis fails
      isConnected = false;
    });

    client.on('connect', () => {
      logger.info('Redis connected');
      isConnected = true;
    });

    await client.connect();
  } catch (error) {
    logger.warn('Redis not available, falling back to in-memory rate limiter', {
      error: error.message
    });
    isConnected = false;
  }
}

/**
 * Check rate limit for a key
 * Returns { allowed: boolean, remaining: number, resetTime: number }
 */
async function checkRateLimit(key, windowMs, maxRequests) {
  // Fallback to in-memory if Redis unavailable
  if (!isConnected || !client) {
    return checkRateLimitMemory(key, windowMs, maxRequests);
  }

  try {
    const now = Date.now();
    const windowStart = now - windowMs;
    const redisKey = `ratelimit:${key}`;

    // Remove old entries outside the window
    await client.zRemRangeByScore(redisKey, '-inf', windowStart);

    // Count requests in window
    const count = await client.zCard(redisKey);

    if (count >= maxRequests) {
      return {
        allowed: false,
        remaining: 0,
        resetTime: (await client.zRange(redisKey, 0, 0, { withScores: true }))[1] + windowMs
      };
    }

    // Add current request
    await client.zAdd(redisKey, { score: now, member: `${now}-${Math.random()}` });
    await client.expire(redisKey, Math.ceil(windowMs / 1000));

    return {
      allowed: true,
      remaining: maxRequests - count - 1,
      resetTime: now + windowMs
    };
  } catch (error) {
    logger.error('Rate limit check failed', { key, error: error.message });
    // Fallback to allow on Redis error (fail open)
    return { allowed: true, remaining: -1, resetTime: 0 };
  }
}

/**
 * In-memory fallback rate limiter (for Redis unavailability)
 */
const memoryLimits = new Map();

function checkRateLimitMemory(key, windowMs, maxRequests) {
  const now = Date.now();
  let entry = memoryLimits.get(key);

  if (!entry || now - entry.start > windowMs) {
    entry = { start: now, count: 0, requests: [] };
    memoryLimits.set(key, entry);
  }

  // Remove old requests outside window
  entry.requests = entry.requests.filter(time => now - time <= windowMs);
  entry.count = entry.requests.length;

  if (entry.count >= maxRequests) {
    return {
      allowed: false,
      remaining: 0,
      resetTime: entry.start + windowMs
    };
  }

  entry.requests.push(now);
  entry.count++;

  return {
    allowed: true,
    remaining: maxRequests - entry.count,
    resetTime: now + windowMs
  };
}

/**
 * Create Express middleware for rate limiting
 */
function rateLimit(windowMs, maxRequests) {
  return async (req, res, next) => {
    const key = (req.ip || 'unknown') + ':' + req.path;
    const limit = await checkRateLimit(key, windowMs, maxRequests);

    res.set('X-RateLimit-Limit', maxRequests.toString());
    res.set('X-RateLimit-Remaining', Math.max(0, limit.remaining).toString());
    res.set('X-RateLimit-Reset', Math.ceil(limit.resetTime / 1000).toString());

    if (!limit.allowed) {
      logger.warn('Rate limit exceeded', { ip: req.ip, path: req.path, key });
      return res.status(429).json({
        error: 'Too many requests, please try again later',
        retryAfter: Math.ceil((limit.resetTime - Date.now()) / 1000)
      });
    }

    next();
  };
}

/**
 * Cleanup on shutdown
 */
async function closeRedis() {
  if (client && isConnected) {
    await client.quit();
    logger.info('Redis connection closed');
  }
}

module.exports = {
  initRedis,
  rateLimit,
  closeRedis,
  checkRateLimit
};

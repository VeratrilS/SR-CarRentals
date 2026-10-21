const { redis } = require('../config/redis');
const { config } = require('../config');
const { TooManyRequestsError } = require('../utils/error');
const logger = require('../config/logger');

/**
 * Rate limiting strategies:
 * 1. IP-based rate limiting (for unauthenticated users)
 * 2. User-based rate limiting (for authenticated users)
 * 3. Endpoint-specific rate limiting
 *
 * All three share one sliding-window limiter; they differ only in *who* a
 * request is counted against. That choice is a Strategy (see keyStrategies).
 */

/**
 * Generic rate limiter using sliding window algorithm
**/
async function rateLimiter(key, maxRequests, windowMs) {
     const now = Date.now();
     const windowStart = now - windowMs;
     const member = `${now}-${Math.random()}`;

     try {
          // MULTI so the trim / add / count run as one atomic unit
          const results = await redis
               .multi()
               // Remove old entries outside the current window
               .zremrangebyscore(key, 0, windowStart)
               // Add current request
               .zadd(key, now, member)
               // Count requests in current window
               .zcard(key)
               // Set expiry on the key
               .expire(key, Math.ceil(windowMs / 1000))
               .exec();

          // Get the count from the third command (index 2)
          const requestCount = results[2][1];

          if (requestCount > maxRequests) {
               // A rejected request must not use up the window, otherwise a client that
               // keeps retrying stays blocked forever and Retry-After is wrong
               await redis.zrem(key, member);
               const oldestRequest = await redis.zrange(key, 0, 0, 'WITHSCORES');
               const resetTime = parseInt(oldestRequest[1]) + windowMs;
               const retryAfter = Math.ceil((resetTime - now) / 1000);

               return {
                    allowed: false,
                    remaining: 0,
                    resetTime,
                    retryAfter,
               };
          }

          return {
               allowed: true,
               remaining: maxRequests - requestCount,
               resetTime: windowStart + windowMs,
          };
     } catch (err) {
          logger.error('Rate limiter error:', err);
          // Fail open - allow request if Redis is down
          return { allowed: true, remaining: maxRequests, resetTime: now + windowMs };
     }
}

const clientIp = (req) => req.ip || req.socket.remoteAddress;

// Route template (/bookings/bookings/:bookingId), so a limit applies per endpoint, not per resource id
const routeOf = (req) => (req.route ? req.baseUrl + req.route.path : req.path);

/**
 * Key strategies: map a request to the bucket it is counted in.
 * Returning null means the strategy doesn't apply and the request is not limited.
 */
const keyStrategies = {
     ip: (req) => `ratelimit:ip:${clientIp(req)}`,
     user: (req) => (req.user?.id ? `ratelimit:user:${req.user.id}` : null),
     endpoint: (req) => `ratelimit:endpoint:${req.method}:${routeOf(req)}:${clientIp(req)}`,
};

/**
 * Build a rate-limit middleware for one strategy
 */
function rateLimit({ strategy, maxRequests, windowMs, message = 'Too many requests.' }) {
     const keyFor = keyStrategies[strategy];
     if (!keyFor) {
          throw new Error(`Unknown rate limit strategy: ${strategy}`);
     }

     return async (req, res, next) => {
          const key = keyFor(req);
          if (!key) return next();

          const result = await rateLimiter(key, maxRequests, windowMs);

          // Set rate limit headers
          res.setHeader('X-RateLimit-Limit', maxRequests);
          res.setHeader('X-RateLimit-Remaining', result.remaining);
          res.setHeader('X-RateLimit-Reset', new Date(result.resetTime).toISOString());

          if (!result.allowed) {
               res.setHeader('Retry-After', result.retryAfter);
               logger.warn(`Rate limit exceeded (${strategy}): ${key}`);
               return next(
                    new TooManyRequestsError(
                         `${message} Please try again in ${result.retryAfter} seconds`,
                         result.retryAfter
                    )
               );
          }

          next();
     };
}

/**
 * IP-based rate limiting middleware
 * Default: 100 requests per 15 minutes
 */
function ipRateLimit(options = {}) {
     return rateLimit({
          strategy: 'ip',
          maxRequests: options.max || config.RATE_LIMIT_MAX_REQUESTS,
          windowMs: options.windowMs || config.RATE_LIMIT_WINDOW_MS,
     });
}

/**
 * User-based rate limiting middleware
 * Should be used after authentication middleware (skipped when there is no user)
 * Default: 1000 requests per 15 minutes (more lenient than IP-based)
**/
function userRateLimit(options = {}) {
     return rateLimit({
          strategy: 'user',
          maxRequests: options.max || config.RATE_LIMIT_MAX_REQUESTS * 10,
          windowMs: options.windowMs || config.RATE_LIMIT_WINDOW_MS,
     });
}

/**
 * Endpoint-specific rate limiting
 * Example: POST /api/users/auth/send-otp - 5 requests per hour per IP
**/
function endpointRateLimit(maxRequests, windowMs) {
     return rateLimit({
          strategy: 'endpoint',
          maxRequests,
          windowMs,
          message: 'Too many requests to this endpoint.',
     });
}

/**
 * Combined rate limiting strategy
 * Applies both IP and user-based rate limiting
**/
function combinedRateLimit(ipOptions = {}, userOptions = {}) {
     const ipLimiter = ipRateLimit(ipOptions);
     const userLimiter = userRateLimit(userOptions);

     return async (req, res, next) => {
          // Apply IP rate limit first
          ipLimiter(req, res, (err) => {
               if (err) return next(err);

               // Then apply user rate limit if authenticated
               userLimiter(req, res, next);
          });
     };
}

module.exports = {
     rateLimit,
     ipRateLimit,
     userRateLimit,
     endpointRateLimit,
     combinedRateLimit,
};

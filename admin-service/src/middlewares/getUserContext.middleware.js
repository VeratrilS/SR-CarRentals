const crypto = require('crypto');
const { config } = require('../config');
const { UnauthorizedError, ForbiddenError } = require('../utils/error');

const sameSecret = (a, b) => {
     const x = Buffer.from(String(a));
     const y = Buffer.from(String(b));
     return x.length === y.length && crypto.timingSafeEqual(x, y);
};

/**
 * Extract user context from gateway headers.
 * The gateway verifies the JWT, then forwards x-user-id / x-user-role together with
 * the internal service key. A request that reaches this service directly (bypassing
 * the gateway) doesn't know the key, so it can't impersonate a user.
 */
function getUserContext(req, res, next) {
     const userId = req.headers['x-user-id'];
     const serviceKey = req.headers['x-internal-service-key'];

     if (!userId || !serviceKey || !sameSecret(serviceKey, config.INTERNAL_SERVICE_KEY)) {
          return next(
               new UnauthorizedError('User context missing - must come through gateway')
          );
     }

     req.user = { id: userId, role: req.headers['x-user-role'] || 'USER' };
     next();
}

/**
 * Fleet management is admin-only. The gateway already checks this; checking again
 * here means the rule holds even if a route is ever exposed without that check.
 */
function requireAdminRole(req, res, next) {
     if (req.user?.role !== 'ADMIN') {
          return next(new ForbiddenError('Admin access required'));
     }
     next();
}

module.exports = { getUserContext, requireAdminRole };

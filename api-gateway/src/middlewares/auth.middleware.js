const jwt = require('jsonwebtoken');
const { config } = require('../config');
const { UnauthorizedError, ForbiddenError } = require('../utils/error');
const logger = require('../config/logger');

/**
 * Middleware to verify access token from Authorization header
 * This is going to be our authentication mechanism which will authenticate user
 * Extracts user ID and attaches it to request headers for downstream services
 */
function requireAuth(req, res, next) {
     try {
          let accessToken;

          // 1. Try Authorization header (service-to-service / mobile clients)
          const authHeader = req.headers.authorization;
          if (authHeader && authHeader.startsWith('Bearer ')) {
               accessToken = authHeader.split(' ')[1];
          }

          // 2. Fall back to httpOnly cookie (browser clients)
          if (!accessToken && req.cookies) {
               accessToken = req.cookies.accessToken;
          }

          if (!accessToken) {
               throw new UnauthorizedError('Authorization token missing');
          }

          // Verify access token
          const payload = jwt.verify(accessToken, config.JWT_ACCESS_SECRET);

          if (!payload.id) {
               throw new UnauthorizedError('Invalid token payload');
          }

          // Attach user context to request for downstream services
          req.user = {
               id: payload.id,
               role: payload.role || 'USER',
          };

          // Add user context to headers for proxied requests
          req.headers['x-user-id'] = payload.id.toString();
          req.headers['x-user-role'] = req.user.role;

          logger.debug(`User ${payload.id} authenticated successfully`);

          next();
     } catch (err) {
          if (err.name === 'TokenExpiredError') {
               return next(new UnauthorizedError('Access token expired', 'TOKEN_EXPIRED'));
          }
          if (err.name === 'JsonWebTokenError') {
               return next(new UnauthorizedError('Invalid access token', 'TOKEN_INVALID'));
          }
          return next(err);
     }
}

/**
 * Must run after requireAuth. Only tokens carrying role=ADMIN may pass.
 */
function requireAdmin(req, res, next) {
     if (req.user?.role !== 'ADMIN') {
          return next(new ForbiddenError('Admin access required'));
     }
     next();
}

/**
 * Drop identity headers sent by the client. Only the gateway may set them
 * (after verifying the JWT), otherwise a caller could impersonate any user
 * on downstream services that trust x-user-id.
 */
function stripIdentityHeaders(req, res, next) {
     delete req.headers['x-user-id'];
     delete req.headers['x-user-role'];
     next();
}

module.exports = { requireAuth, requireAdmin, stripIdentityHeaders };
const crypto = require('crypto');
const { config } = require('../config');
const jwt = require('jsonwebtoken')
const {UnauthorizedError} = require('./error');

exports.hashToken = (refreshToken) => {
     return crypto.createHash('sha256').update(refreshToken).digest('hex');
}

/** One canonical form, so "Sai@Gmail.com" and "sai@gmail.com" are the same account */
exports.normalizeEmail = (email) => String(email).trim().toLowerCase();

/**
 * Role-based access: emails listed in ADMIN_EMAILS are fleet admins.
 * The role travels inside the access token so the gateway can authorise
 * /admins/* routes without calling back into user-service.
 */
exports.roleFor = (email) => {
     return email && config.ADMIN_EMAILS.includes(email.toLowerCase()) ? 'ADMIN' : 'USER';
}

exports.generateAccessToken = (userId, role = 'USER') => {
     const payload = {
          id: userId,
          role
     }
     return jwt.sign(payload, config.JWT_ACCESS_SECRET, { expiresIn: config.ACCESS_TOKEN_EXP, algorithm: 'HS256' })
}

exports.generateRefreshToken = (userId) => {
     const payload = {
          id: userId,
          jti: crypto.randomUUID()
     }
     return jwt.sign(payload, config.JWT_REFRESH_SECRET, { expiresIn: config.REFRESH_TOKEN_EXP, algorithm: 'HS256' })
}

exports.verifyAccessToken = (accessToken) => {
     return jwt.verify(accessToken, config.JWT_ACCESS_SECRET, { algorithms: ['HS256'] });
}

/** Expired / tampered refresh tokens are a 401 (log in again), not a server error */
exports.verifyRefreshToken = (refreshToken) => {
     try {
          return jwt.verify(refreshToken, config.JWT_REFRESH_SECRET, { algorithms: ['HS256'] });
     } catch (err) {
          if (err instanceof jwt.JsonWebTokenError) {
               throw new UnauthorizedError("Session expired. Please log in again.", "REFRESH_INVALID");
          }
          throw err;
     }
}

const crypto = require('crypto');
const { config } = require('../config');
const jwt = require('jsonwebtoken')
const logger = require('../config/logger');
const {UnauthorizedError} = require('./error');

exports.hashToken = (refreshToken) => {
     return crypto.createHash('sha256').update(refreshToken).digest('hex');
}

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
     return jwt.sign(payload, config.JWT_ACCESS_SECRET, { expiresIn: config.ACCESS_TOKEN_EXP })
}

exports.generateRefreshToken = (userId) => {
     const payload = {
          id: userId,
          jti: crypto.randomUUID()
     }
     return jwt.sign(payload, config.JWT_REFRESH_SECRET, { expiresIn: config.REFRESH_TOKEN_EXP })
}

exports.verifyAccessToken = (accessToken) => {
     return jwt.verify(accessToken, config.JWT_ACCESS_SECRET);
}

exports.verifyRefreshToken = (refreshToken) => {
     return jwt.verify(refreshToken, config.JWT_REFRESH_SECRET);
}

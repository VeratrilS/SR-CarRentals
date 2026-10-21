// middlewares/error.middleware.js
const { AppError, BadRequestError } = require('../utils/error');
const {config} = require('../config');
const logger = require('../config/logger');

class PayloadTooLargeError extends AppError {
     constructor(message = 'Request body is too large') {
          super(message, 413, 'PAYLOAD_TOO_LARGE');
     }
}

/**
 * Adapter: translate errors thrown by libraries (body-parser, ...) into our
 * AppError shape, so the client gets a meaningful status instead of a 500.
 */
function toAppError(err) {
     if (err instanceof AppError) return err;
     if (err.type === 'entity.parse.failed') return new BadRequestError('Malformed JSON in request body', 'INVALID_JSON');
     if (err.type === 'entity.too.large') return new PayloadTooLargeError();
     return null;
}

const SENSITIVE_FIELDS = ['password', 'otp', 'token', 'refreshToken', 'idToken', 'credential'];
const redact = (body) => {
     if (!body || typeof body !== 'object' || Buffer.isBuffer(body)) return body;
     return Object.fromEntries(
          Object.entries(body).map(([k, v]) => [k, SENSITIVE_FIELDS.includes(k) ? '[REDACTED]' : v])
     );
};

module.exports = (err, req, res, next) => {
     const appError = toAppError(err);
     if (appError) {
          return res.status(appError.statusCode).json({
               success: false,
               error: appError.code,
               message: appError.message
          });
     }

     if(config.NODE_ENV !== "production"){
          logger.error(`UNHANDLED ERROR on ${req.method} ${req.path}: ${err.message}`, {
               stack: err.stack,
               body: redact(req.body),
               query: req.query
          })
     } else {
          logger.error(`UNHANDLED ERROR on ${req.method} ${req.path}: ${err.message}`);
     }
     return res.status(500).json({
          success: false,
          error: "SERVER_ERROR",
          message: "Internal Server Error"
     });
};

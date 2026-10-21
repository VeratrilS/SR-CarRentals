const { AppError } = require('../utils/error');
const { config } = require('../config');
const logger = require('../config/logger');

/**
 * Adapter: errors from inventory/payment arrive as axios errors. A 4xx from them
 * ("Seat 3 was just taken", "Invalid signature") is a real answer written for the
 * user — pass its status and message through instead of hiding it behind a 500.
 * A 5xx or no response means that service is unhealthy → 502.
 */
function fromDownstream(err) {
     if (!err.isAxiosError) return null;
     const status = err.response?.status;
     const body = err.response?.data || {};
     if (status >= 400 && status < 500) {
          return new AppError(body.message || 'Request rejected', status, body.error || 'DOWNSTREAM_REJECTED');
     }
     return new AppError('A booking dependency is temporarily unavailable. Please try again.', 502, 'DEPENDENCY_UNAVAILABLE');
}

module.exports = (err, req, res, next) => {
     const appError = err instanceof AppError ? err : fromDownstream(err);
     if (appError) {
          if (!(err instanceof AppError)) {
               logger.warn(`Downstream error on ${req.method} ${req.path}: ${err.message}`);
          }
          return res.status(appError.statusCode).json({
               success: false,
               error: appError.code,
               message: appError.message
          });
     }

     if(config.NODE_ENV !== "production"){
          logger.error(`UNHANDLED ERROR on ${req.method} ${req.path}: ${err.message}`, {
               stack: err.stack,
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

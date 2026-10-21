const cors = require('cors');
const { config } = require('../config');
const { ForbiddenError } = require('../utils/error');

const allowedOrigins = config.ALLOWED_ORIGINS
     ? config.ALLOWED_ORIGINS.split(',').map(o => o.trim())
     : [];

const corsMiddleware = cors({
     origin: function (origin, callback) {

          if (!origin) return callback(null, true);

          if (allowedOrigins.includes(origin)) {
               callback(null, true);
          } else {
               callback(new ForbiddenError(`Origin ${origin} is not allowed`, 'CORS_NOT_ALLOWED'));
          }
     },
     credentials: true,
     // PATCH is used by admin routes (car status, trip cancel)
     methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
     allowedHeaders: ['Content-Type', 'Authorization'],
});

module.exports = { corsMiddleware };

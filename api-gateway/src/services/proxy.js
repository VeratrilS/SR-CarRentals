const axios = require('axios');
const { config } = require('../config');
const { ServiceUnavailableError, GatewayTimeoutError } = require('../utils/error');
const logger = require('../config/logger');
const { CircuitBreaker } = require('./circuitBreaker');
const { getService, listServices } = require('./registry');

// 502/503/504 from a service mean the service itself is unhealthy (not a bad
// request), so they count towards opening its circuit breaker
const isUnhealthyResponse = (response) => response.status >= 502 && response.status <= 504;

/**
 * Forward request to downstream service
 */
async function forwardRequest(service, path, method, data, headers) {
     const url = `${service.url}${path}`;
     // http://localhost:4001/auth/login
     const requestConfig = {
          method,
          url,
          timeout: config.SERVICE_TIMEOUT_MS,
          headers: {
               ...headers,
               // Remove host header to avoid conflicts
               host: undefined,
               // Remove content-length to let axios recalculate
               'content-length': undefined,
               // Services only trust x-user-id / x-user-role when this key comes with them
               'x-internal-service-key': config.INTERNAL_SERVICE_KEY,
          },
          // Important: Don't validate status, let service response through
          validateStatus: () => true,
          // Set max redirects
          maxRedirects: 5,
     };

     // Add data based on method
     if (method !== 'GET' && method !== 'DELETE' && data) {
          requestConfig.data = data;
     }

     // For GET and DELETE, add params if data exists
     if ((method === 'GET' || method === 'DELETE') && data) {
          requestConfig.params = data;
     }

     logger.debug(`Forwarding ${method} ${url}`, {
          hasData: !!data,
          timeout: config.SERVICE_TIMEOUT_MS,
     });

     try {
          const response = await service.breaker.execute(() => axios(requestConfig), isUnhealthyResponse);

          logger.debug(`Response from ${url}:`, {
               status: response.status,
               statusText: response.statusText,
          });

          return {
               status: response.status,
               data: response.data,
               headers: response.headers,
          };
     } catch (err) {
          // Open circuit: already a 503 AppError, pass it straight through
          if (err instanceof ServiceUnavailableError) throw err;

          logger.error(`Error forwarding to ${service.name}:`, {
               message: err.message,
               code: err.code,
               url: url,
               method: method,
               timeout: config.SERVICE_TIMEOUT_MS,
          });

          if (err.code === 'ECONNABORTED' || err.code === 'ETIMEDOUT') {
               throw new GatewayTimeoutError(`Request to ${service.name} timed out after ${config.SERVICE_TIMEOUT_MS}ms`);
          }

          if (err.code === 'ECONNREFUSED') {
               throw new ServiceUnavailableError(`Cannot connect to ${service.name}. Service may be down.`);
          }

          if (err.response) {
               return {
                    status: err.response.status,
                    data: err.response.data,
                    headers: err.response.headers,
               };
          }

          throw new ServiceUnavailableError(`Service temporarily unavailable: ${err.message}`);
     }
}

/**
 * Proxy middleware factory — one middleware per registered service
 */
function createProxy(serviceKey) {
     const service = getService(serviceKey);

     return async (req, res, next) => {
          try {
               // Drop the first path segment (the service prefix):
               // Gateway: /api/users/auth/login -> Service: /auth/login
               // Gateway: /api/users/user/profile -> Service: /user/profile
               const pathParts = req.path.split('/').filter(Boolean);
               const servicePath = '/' + pathParts.slice(1).join('/');
               const query = req.url.includes('?') ? req.url.substring(req.url.indexOf('?')) : '';

               const result = await forwardRequest(service, servicePath + query, req.method, req.body, req.headers);

               // Forward response headers (except some)
               const excludeHeaders = ['connection', 'keep-alive', 'transfer-encoding', 'host'];
               Object.keys(result.headers).forEach((key) => {
                    if (!excludeHeaders.includes(key.toLowerCase())) {
                         res.setHeader(key, result.headers[key]);
                    }
               });

               // Send response
               res.status(result.status).json(result.data);
          } catch (err) {
               next(err);
          }
     };
}

/**
 * Health check endpoint for circuit breakers
 */
function getCircuitBreakerStatus() {
     return listServices().map((service) => service.breaker.getState());
}

module.exports = {
     createProxy,
     CircuitBreaker,
     getCircuitBreakerStatus,
};

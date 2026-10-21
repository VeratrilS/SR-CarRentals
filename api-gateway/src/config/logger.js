const winston = require('winston');
const {config} = require('.');

// Logging must never throw: drop circular references (e.g. inside ioredis / axios errors)
const safeStringify = (value) => {
     const seen = new WeakSet();
     try {
          return JSON.stringify(value, (key, val) => {
               if (typeof val === 'object' && val !== null) {
                    if (seen.has(val)) return '[Circular]';
                    seen.add(val);
               }
               return val;
          });
     } catch {
          return '[unserializable]';
     }
};

const logger = winston.createLogger({
     level: config.LOG_LEVEL,
     defaultMeta: {service: config.SERVICE_NAME},
     format: winston.format.combine(
          winston.format.timestamp(),
          winston.format.printf(({level, message, timestamp, service, ...meta}) =>{
               // Print structured details passed as the 2nd argument (status, code, url, ...)
               const details = Object.keys(meta).length ? ` ${safeStringify(meta)}` : '';
               return `[${timestamp}] [${level}] [${service}]: ${message}${details}`
          })
     ),
     transports: [new winston.transports.Console()]
})

module.exports = logger;
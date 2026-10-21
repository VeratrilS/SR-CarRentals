const { config } = require('../config');
const { ServiceUnavailableError } = require('../utils/error');
const logger = require('../config/logger');

/**
 * Circuit Breaker (State pattern: CLOSED → OPEN → HALF_OPEN → CLOSED)
 * Prevents cascading failures when downstream services are down.
 *
 *   CLOSED     every request goes through; `threshold` consecutive failures → OPEN
 *   OPEN       fail fast with 503 until `timeout` ms have passed → HALF_OPEN
 *   HALF_OPEN  exactly one trial request goes through:
 *              success → CLOSED, failure → OPEN again
 */
class CircuitBreaker {
     constructor(serviceName, threshold = config.CIRCUIT_BREAKER_THRESHOLD, timeout = config.CIRCUIT_BREAKER_TIMEOUT) {
          this.serviceName = serviceName;
          this.failureCount = 0;
          this.threshold = threshold;
          this.timeout = timeout;
          this.state = 'CLOSED'; // CLOSED, OPEN, HALF_OPEN
          this.nextAttempt = Date.now();
          this.trialInFlight = false;
     }

     /**
      * @param request   () => Promise<response>
      * @param isFailure (response) => boolean — lets a caller count a *returned*
      *                  response (e.g. HTTP 503) as a failure, not only thrown errors
      */
     async execute(request, isFailure = () => false) {
          const isTrial = this.admit();

          try {
               const response = await request();
               if (isFailure(response)) this.onFailure();
               else this.onSuccess();
               return response;
          } catch (err) {
               this.onFailure();
               throw err;
          } finally {
               if (isTrial) this.trialInFlight = false;
          }
     }

     /** Decide whether a request may pass. Returns true if it is the HALF_OPEN trial. */
     admit() {
          if (this.state === 'CLOSED') return false;

          if (this.state === 'OPEN') {
               if (Date.now() < this.nextAttempt) throw this.unavailable();
               this.state = 'HALF_OPEN';
               logger.info(`Circuit breaker HALF_OPEN for ${this.serviceName}`);
          }

          // HALF_OPEN: one probe at a time, everyone else keeps failing fast
          if (this.trialInFlight) throw this.unavailable();
          this.trialInFlight = true;
          return true;
     }

     onSuccess() {
          this.failureCount = 0;
          if (this.state !== 'CLOSED') {
               this.state = 'CLOSED';
               logger.info(`Circuit breaker CLOSED for ${this.serviceName}`);
          }
     }

     onFailure() {
          this.failureCount++;
          if (this.state === 'HALF_OPEN' || this.failureCount >= this.threshold) {
               this.state = 'OPEN';
               this.nextAttempt = Date.now() + this.timeout;
               logger.error(
                    `Circuit breaker OPEN for ${this.serviceName}. Next attempt at ${new Date(this.nextAttempt).toISOString()}`
               );
          }
     }

     unavailable() {
          return new ServiceUnavailableError(
               `Service ${this.serviceName} is temporarily unavailable. Circuit breaker is ${this.state}.`
          );
     }

     getState() {
          return {
               service: this.serviceName,
               state: this.state,
               failureCount: this.failureCount,
               nextAttempt: this.state === 'OPEN' ? new Date(this.nextAttempt).toISOString() : null,
          };
     }
}

module.exports = { CircuitBreaker };

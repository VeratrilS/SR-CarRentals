const { config } = require('../config');
const { ConflictError, AppError } = require('../utils/error');

/**
 * Synchronous calls to inventory-service. Scheduling a trip must know *now*
 * whether the car is free for the trip window, so this can't go through Kafka.
 */
async function call(path, body) {
     const res = await fetch(`${config.INVENTORY_SERVICE_URL}${path}`, {
          method: 'POST',
          headers: {
               'Content-Type': 'application/json',
               'x-internal-service-key': config.INTERNAL_SERVICE_KEY,
          },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(8000),
     });
     const data = await res.json().catch(() => ({}));
     if (res.status === 409) throw new ConflictError(data.message || 'Car is not available for that time', 'CAR_UNAVAILABLE');
     if (!res.ok) throw new AppError(data.message || `Inventory service error (${res.status})`, res.status >= 500 ? 502 : res.status);
     return data.data;
}

const inventoryClient = {
     /** Block the car for [startAt, endAt) so it can't be rented while it runs the trip. */
     reserveCarForTrip: (carId, tripId, startAt, endAt) =>
          call('/internal/cars/reserve', { carId, reservationId: `trip:${tripId}`, startAt, endAt }),

     releaseCarForTrip: (carId, tripId) =>
          call('/internal/cars/release-reservation', { carId, reservationId: `trip:${tripId}` }),
};

module.exports = { inventoryClient };

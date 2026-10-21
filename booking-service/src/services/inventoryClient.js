const axios = require('axios');
const { config } = require('../config');
const logger = require('../config/logger');

const client = axios.create({
     baseURL: config.INVENTORY_SERVICE_URL,
     timeout: 10000,
     headers: {
          'Content-Type': 'application/json',
          'x-internal-service-key': config.INTERNAL_SERVICE_KEY,
     },
});

/**
 * Retry wrapper with exponential backoff.
 */
async function withRetry(fn, maxRetries = 3) {
     let lastError;
     for (let attempt = 1; attempt <= maxRetries; attempt++) {
          try {
               return await fn();
          } catch (error) {
               lastError = error;
               // Don't retry client errors (4xx) — only server/network errors
               const status = error.response?.status;
               if (status && status >= 400 && status < 500) throw error;

               if (attempt < maxRetries) {
                    const delay = 200 * Math.pow(2, attempt - 1);
                    logger.warn(`Inventory client retry ${attempt}/${maxRetries} after ${delay}ms`, {
                         error: error.message,
                    });
                    await new Promise(resolve => setTimeout(resolve, delay));
               }
          }
     }
     throw lastError;
}

/**
 * Extract error message from axios error.
 */
function extractError(error) {
     if (error.response?.data) {
          return {
               status: error.response.status,
               message: error.response.data.message || error.message,
               code: error.response.data.error,
          };
     }
     return { status: 500, message: error.message, code: 'INVENTORY_SERVICE_ERROR' };
}

const inventoryClient = {
     async getAvailability(carId, startAt, endAt) {
          return withRetry(async () => {
               const params = {};
               if (startAt && endAt) {
                    params.startAt = new Date(startAt).toISOString();
                    params.endAt = new Date(endAt).toISOString();
               }
               const { data } = await client.get(`/cars/${carId}/availability`, { params });
               return data.data;
          });
     },

     async holdCar(carId, bookingId, startAt, endAt, userId, ttlSeconds) {
          return withRetry(async () => {
               const { data } = await client.post('/holds/lock', {
                    carId,
                    bookingId,
                    startAt,
                    endAt,
                    userId,
                    ttlSeconds,
               });
               return data.data;
          });
     },

     async releaseCar(carId, bookingId, userId) {
          return withRetry(async () => {
               const { data } = await client.post('/holds/release', { carId, bookingId, userId });
               return data.data;
          });
     },

     async confirmCar(carId, bookingId, userId) {
          return withRetry(async () => {
               const { data } = await client.post('/holds/confirm', { carId, bookingId, userId });
               return data.data;
          });
     },

     async cancelBooking(carId, bookingId) {
          return withRetry(async () => {
               const { data } = await client.post('/holds/cancel-booking', { carId, bookingId });
               return data.data;
          });
     },

     // ─── Shared rides ───

     async getTrip(tripId) {
          return withRetry(async () => {
               const { data } = await client.get(`/internal/trips/${tripId}`);
               return data.data;
          });
     },

     async getSeatMap(tripId, fromSeq, toSeq) {
          return withRetry(async () => {
               const { data } = await client.get(`/trips/${tripId}/seats`, { params: { fromSeq, toSeq } });
               return data.data;
          });
     },

     async holdTripSeats(tripId, bookingId, seatNumbers, fromSeq, toSeq, userId, ttlSeconds) {
          return withRetry(async () => {
               const { data } = await client.post('/trip-holds/lock', { tripId, bookingId, seatNumbers, fromSeq, toSeq, userId, ttlSeconds });
               return data.data;
          });
     },

     async releaseTripSeats(tripId, bookingId) {
          return withRetry(async () => {
               const { data } = await client.post('/trip-holds/release', { tripId, bookingId });
               return data.data;
          });
     },

     async confirmTripSeats(tripId, bookingId, userId) {
          return withRetry(async () => {
               const { data } = await client.post('/trip-holds/confirm', { tripId, bookingId, userId });
               return data.data;
          });
     },

     async cancelTripSeatBooking(tripId, bookingId) {
          return withRetry(async () => {
               const { data } = await client.post('/trip-holds/cancel-booking', { tripId, bookingId });
               return data.data;
          });
     },
};

module.exports = { inventoryClient, extractError };

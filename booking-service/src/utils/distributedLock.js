const { redis } = require('../config/redis');
const logger = require('../config/logger');

/**
 * Redis distributed locking using Lua scripts for atomicity.
 *
 *   Rentals: booking:lock:car:{carId}:{pickupMs}:{dropoffMs}
 *   Seats:   booking:lock:trip:{tripId}:seat:{n}:{fromSeq}:{toSeq}   (one key per seat)
 *
 * A fast pre-check that stops two users racing for the *same* thing. Overlapping-but-
 * different windows/stretches get different keys; those conflicts are caught by
 * inventory-service (row lock + overlap check + exclusion constraint).
 */

// Lua script: Acquire all locks atomically. Returns 1 on success, 0 on failure.
// If any key already exists, releases all previously acquired keys and returns 0.
const ACQUIRE_SCRIPT = `
local lockValue = ARGV[1]
local ttl = tonumber(ARGV[2])
local acquired = {}

for i, key in ipairs(KEYS) do
     local result = redis.call('SET', key, lockValue, 'NX', 'EX', ttl)
     if not result then
          -- Rollback: release all previously acquired locks
          for j = 1, #acquired do
               redis.call('DEL', acquired[j])
          end
          return 0
     end
     table.insert(acquired, key)
end

return 1
`;

// Lua script: Release locks only if we own them (value matches).
const RELEASE_SCRIPT = `
local lockValue = ARGV[1]
local released = 0

for i, key in ipairs(KEYS) do
     local currentValue = redis.call('GET', key)
     if currentValue == lockValue then
          redis.call('DEL', key)
          released = released + 1
     end
end

return released
`;

// ─── Key builders ────────────────────────────────────────────────────────────

function carLockKeys(carId, pickupAt, dropoffAt) {
     return [`booking:lock:car:${carId}:${new Date(pickupAt).getTime()}:${new Date(dropoffAt).getTime()}`];
}

/** Sorted so two bookings wanting overlapping seat sets can't deadlock. */
function tripSeatLockKeys(tripId, seatNumbers, fromSeq, toSeq) {
     return [...seatNumbers]
          .map(Number)
          .sort((a, b) => a - b)
          .map((n) => `booking:lock:trip:${tripId}:seat:${n}:${fromSeq}:${toSeq}`);
}

/** Lock keys for an existing booking, whatever its type. */
function lockKeysForBooking(booking) {
     return booking.type === 'SEAT'
          ? tripSeatLockKeys(booking.tripId, booking.seatNumbers || [], booking.fromSeq, booking.toSeq)
          : carLockKeys(booking.carId, booking.pickupAt, booking.dropoffAt);
}

// ─── Generic operations ──────────────────────────────────────────────────────

/** @returns {Promise<{acquired: boolean, lockValue: string|null}>} */
async function acquireKeys(keys, ownerId, ttlSeconds) {
     const lockValue = `${ownerId}:${Date.now()}`;
     try {
          const result = await redis.eval(ACQUIRE_SCRIPT, keys.length, ...keys, lockValue, ttlSeconds);
          if (result === 1) {
               logger.info('Distributed lock(s) acquired', { count: keys.length, ownerId, ttlSeconds });
               return { acquired: true, lockValue };
          }
          logger.info('Failed to acquire lock(s) — already being booked', { firstKey: keys[0], ownerId });
          return { acquired: false, lockValue: null };
     } catch (error) {
          logger.error('Error acquiring distributed locks', { error: error.message, ownerId });
          // Fail closed: reject the booking attempt rather than bypassing the lock.
          // Allowing duplicate bookings is far worse than a temporary service degradation.
          return { acquired: false, lockValue: null };
     }
}

/** Release only the keys we still own (value matches). */
async function releaseKeys(keys, lockValue) {
     if (!lockValue || keys.length === 0) return;
     try {
          const released = await redis.eval(RELEASE_SCRIPT, keys.length, ...keys, lockValue);
          logger.info(`Released ${released} distributed lock(s)`);
     } catch (error) {
          // Non-critical: locks will expire via TTL
          logger.error('Error releasing distributed locks', { error: error.message });
     }
}

/** Release regardless of owner — used once a booking reaches a terminal state. */
async function forceReleaseKeys(keys) {
     if (keys.length === 0) return;
     try {
          await redis.del(...keys);
          logger.info(`Force-released ${keys.length} lock(s)`);
     } catch (error) {
          logger.error('Error force-releasing locks', { error: error.message });
     }
}

// ─── Convenience wrappers ────────────────────────────────────────────────────

const acquireCarLock = (carId, pickupAt, dropoffAt, ownerId, ttlSeconds) =>
     acquireKeys(carLockKeys(carId, pickupAt, dropoffAt), ownerId, ttlSeconds);

const releaseCarLock = (carId, pickupAt, dropoffAt, lockValue) =>
     releaseKeys(carLockKeys(carId, pickupAt, dropoffAt), lockValue);

const forceReleaseBookingLock = (booking) => forceReleaseKeys(lockKeysForBooking(booking));

module.exports = {
     acquireKeys,
     releaseKeys,
     forceReleaseKeys,
     tripSeatLockKeys,
     acquireCarLock,
     releaseCarLock,
     forceReleaseBookingLock,
};

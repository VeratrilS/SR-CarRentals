const prisma = require('../config/prisma');
const logger = require('../config/logger');
const inventoryProducer = require('../kafka/producer/inventory.producer');
const { retryTransaction } = require('../utils/retryTransaction');
const { BadRequestError, NotFoundError, ConflictError, ForbiddenError } = require('../utils/error');
const { config } = require('../config');

// ─── Helpers ────────────────────────────────────────────────────────────────

const parseRange = (startAt, endAt) => {
     const start = new Date(startAt);
     const end = new Date(endAt);
     if (isNaN(start.getTime()) || isNaN(end.getTime())) {
          throw new BadRequestError('startAt and endAt must be valid ISO date-times');
     }
     if (start >= end) {
          throw new BadRequestError('startAt must be before endAt');
     }
     return { start, end };
};

/**
 * Active (non-expired) holds for a car that end in the future.
 * These are the intervals during which the car cannot be rented.
 */
const getBlockedRanges = async (db, carId) => {
     const holds = await db.rentalHold.findMany({
          where: {
               carId,
               endAt: { gt: new Date() },
               OR: [
                    { status: 'BOOKED' },
                    { status: 'LOCKED', lockExpiresAt: { gt: new Date() } },
               ],
          },
          orderBy: { startAt: 'asc' },
          select: { startAt: true, endAt: true, status: true },
     });
     return holds.map(h => ({ startAt: h.startAt, endAt: h.endAt, status: h.status }));
};

/**
 * Publish the car's current blocked ranges so search-service can filter
 * out cars that are unavailable for a requested pickup/drop-off window.
 */
const publishAvailability = async (carId) => {
     try {
          const car = await prisma.carInventory.findUnique({ where: { carId } });
          if (!car) return;
          const blockedRanges = await getBlockedRanges(prisma, carId);
          await inventoryProducer.publishCarAvailabilityUpdated(carId, car.status, blockedRanges);
     } catch (err) {
          logger.error('Failed to publish car availability after retries', { carId, error: err.message });
     }
};

// ─── Kafka Event Handlers ───────────────────────────────────────────────────

const upsertCar = async (eventData, eventType) => {
     const { carId, branch } = eventData;

     if (!carId || !branch) {
          logger.warn(`Invalid ${eventType} event — missing carId or branch`);
          return;
     }

     const data = {
          registrationNumber: eventData.registrationNumber,
          make: eventData.make,
          model: eventData.model,
          category: eventData.category,
          transmission: eventData.transmission,
          fuelType: eventData.fuelType,
          seats: eventData.seats,
          dailyRate: eventData.dailyRate,
          branchId: branch.branchId,
          branchCode: branch.code,
          branchName: branch.name,
          city: branch.city,
          status: eventData.status || 'ACTIVE',
     };

     // Upsert keeps both CAR_CREATED and CAR_UPDATED idempotent on redelivery
     await prisma.carInventory.upsert({
          where: { carId },
          create: { carId, ...data },
          update: { ...data, version: { increment: 1 } },
     });

     logger.info(`Inventory ${eventType === 'CAR_CREATED' ? 'initialised' : 'updated'} for car ${eventData.registrationNumber}`);
     await publishAvailability(carId);
};

const handleCarStatusChanged = async (eventData) => {
     const { carId, status } = eventData;
     if (!carId || !status) {
          logger.warn('Invalid CAR_STATUS_CHANGED event — missing carId or status');
          return;
     }

     const car = await prisma.carInventory.findUnique({ where: { carId } });
     if (!car) {
          logger.warn(`Car ${carId} not found in inventory — skipping status change`);
          return;
     }

     await prisma.carInventory.update({
          where: { carId },
          data: { status, version: { increment: 1 } },
     });

     // Existing holds are released by booking-service as it cancels the affected bookings
     logger.info(`Car ${car.registrationNumber} is now ${status} in inventory`);
     await publishAvailability(carId);
};

// ─── REST API Handlers ──────────────────────────────────────────────────────

/**
 * Public availability view for one car. If a window is given, also answers
 * "is this car free for [startAt, endAt)?".
 */
const getAvailability = async (carId, startAt, endAt) => {
     const car = await prisma.carInventory.findUnique({ where: { carId } });
     if (!car) throw new NotFoundError('Car not found in inventory');

     const blockedRanges = await getBlockedRanges(prisma, carId);

     let requested = null;
     if (startAt && endAt) {
          const { start, end } = parseRange(startAt, endAt);
          const conflict = blockedRanges.some(r => r.startAt < end && start < r.endAt);
          requested = {
               startAt: start,
               endAt: end,
               available: car.status === 'ACTIVE' && !conflict,
          };
     }

     return {
          carId: car.carId,
          registrationNumber: car.registrationNumber,
          make: car.make,
          model: car.model,
          category: car.category,
          transmission: car.transmission,
          fuelType: car.fuelType,
          seats: car.seats,
          dailyRate: car.dailyRate,
          branchId: car.branchId,
          branchCode: car.branchCode,
          branchName: car.branchName,
          city: car.city,
          status: car.status,
          blockedRanges: blockedRanges.map(r => ({ startAt: r.startAt, endAt: r.endAt })),
          requested,
     };
};

/**
 * Place a temporary hold on a car for [startAt, endAt).
 *
 * Concurrency: the car's inventory row is locked FOR UPDATE NOWAIT, so all hold
 * changes for one car are serialised. Inside that critical section we purge expired
 * holds, check for overlap, then insert. The exclusion constraint backs this up.
 */
const lockCar = async (carId, bookingId, startAt, endAt, userId, ttlSeconds) => {
     const { start, end } = parseRange(startAt, endAt);
     const ttl = Math.min(Math.max(ttlSeconds || config.LOCK_TTL_SECONDS, 60), 900);
     const lockExpiresAt = new Date(Date.now() + ttl * 1000);

     const result = await retryTransaction(async () => {
          return prisma.$transaction(async (tx) => {
               const rows = await tx.$queryRaw`
                    SELECT "carId", status FROM car_inventories
                    WHERE "carId" = ${carId}
                    FOR UPDATE NOWAIT
               `;
               if (rows.length === 0) throw new NotFoundError('Car not found in inventory');
               if (rows[0].status !== 'ACTIVE') throw new BadRequestError('Car is not available for rent');

               // Idempotent: the same booking re-requesting its own hold
               const existing = await tx.rentalHold.findUnique({ where: { bookingId } });
               if (existing) {
                    return { carId, bookingId, startAt: existing.startAt, endAt: existing.endAt, lockExpiresAt: existing.lockExpiresAt };
               }

               // Expired holds no longer block anyone — purge them inside the critical section
               await tx.rentalHold.deleteMany({
                    where: { carId, status: 'LOCKED', lockExpiresAt: { lt: new Date() } },
               });

               const overlapping = await tx.rentalHold.findFirst({
                    where: {
                         carId,
                         startAt: { lt: end },   // overlap condition: a.start < b.end
                         endAt: { gt: start },   // overlap condition: b.start < a.end
                    },
                    select: { startAt: true, endAt: true },
               });

               if (overlapping) {
                    throw new ConflictError(
                         `Car is already reserved from ${overlapping.startAt.toISOString()} to ${overlapping.endAt.toISOString()}`,
                         'CAR_UNAVAILABLE'
                    );
               }

               await tx.rentalHold.create({
                    data: {
                         carId,
                         bookingId,
                         startAt: start,
                         endAt: end,
                         status: 'LOCKED',
                         lockedBy: userId,
                         lockExpiresAt,
                    },
               });

               await tx.carInventory.update({
                    where: { carId },
                    data: { version: { increment: 1 } },
               });

               return { carId, bookingId, startAt: start, endAt: end, lockExpiresAt };
          }, { timeout: 10000 });
     }).catch((err) => {
          // 23P01 = exclusion_violation: the DB constraint caught an overlap
          if (err.code === 'P2004' || err.meta?.code === '23P01' || err.message?.includes('rental_holds_no_overlap')) {
               throw new ConflictError('Car is already reserved for an overlapping period', 'CAR_UNAVAILABLE');
          }
          throw err;
     });

     await publishAvailability(carId);
     return result;
};

/**
 * Block a car for a shared-ride trip (admin-service, synchronous). Stored as a
 * permanent BOOKED hold so rentals and other trips can't overlap it.
 */
const reserveCarForTrip = async (carId, reservationId, startAt, endAt) => {
     const { start, end } = parseRange(startAt, endAt);

     await retryTransaction(async () => prisma.$transaction(async (tx) => {
          const rows = await tx.$queryRaw`
               SELECT "carId", status FROM car_inventories WHERE "carId" = ${carId} FOR UPDATE NOWAIT
          `;
          if (rows.length === 0) throw new NotFoundError('Car not found in inventory');
          if (rows[0].status !== 'ACTIVE') throw new BadRequestError('Car is not active');

          const existing = await tx.rentalHold.findUnique({ where: { bookingId: reservationId } });
          if (existing) return;

          await tx.rentalHold.deleteMany({ where: { carId, status: 'LOCKED', lockExpiresAt: { lt: new Date() } } });
          const overlapping = await tx.rentalHold.findFirst({
               where: { carId, startAt: { lt: end }, endAt: { gt: start } },
               select: { startAt: true, endAt: true },
          });
          if (overlapping) {
               throw new ConflictError(
                    `Car is already booked from ${overlapping.startAt.toISOString()} to ${overlapping.endAt.toISOString()}`,
                    'CAR_UNAVAILABLE'
               );
          }

          await tx.rentalHold.create({
               data: { carId, bookingId: reservationId, startAt: start, endAt: end, status: 'BOOKED', lockedBy: 'trip', lockExpiresAt: null },
          });
     }, { timeout: 10000 }));

     await publishAvailability(carId);
     return { carId, reservationId, startAt: start, endAt: end };
};

const releaseCarReservation = async (carId, reservationId) => {
     const deleted = await prisma.rentalHold.deleteMany({ where: { carId, bookingId: reservationId } });
     if (deleted.count) await publishAvailability(carId);
     return { carId, reservationId, released: deleted.count > 0 };
};

const releaseCar = async (carId, bookingId, userId) => {
     const deleted = await prisma.rentalHold.deleteMany({
          where: { carId, bookingId, status: 'LOCKED' },
     });

     if (deleted.count > 0) {
          logger.info(`Released hold on car ${carId} for booking ${bookingId}`, { userId });
          await publishAvailability(carId);
     }

     return { carId, bookingId, released: deleted.count > 0 };
};

const confirmCar = async (carId, bookingId, userId) => {
     const result = await retryTransaction(async () => {
          return prisma.$transaction(async (tx) => {
               const hold = await tx.rentalHold.findUnique({ where: { bookingId } });

               if (!hold || hold.carId !== carId) {
                    throw new ConflictError('Hold expired or not found. Please book again.', 'LOCK_EXPIRED');
               }
               if (hold.lockedBy !== userId) {
                    throw new ForbiddenError('This hold belongs to another user');
               }
               if (hold.status === 'BOOKED') {
                    return { carId, bookingId, status: 'BOOKED' };
               }

               await tx.rentalHold.update({
                    where: { bookingId },
                    data: { status: 'BOOKED', lockExpiresAt: null, version: { increment: 1 } },
               });

               return { carId, bookingId, status: 'BOOKED' };
          }, { timeout: 10000 });
     });

     await publishAvailability(carId);
     return result;
};

const cancelBooking = async (carId, bookingId) => {
     const deleted = await prisma.rentalHold.deleteMany({ where: { carId, bookingId } });

     if (deleted.count === 0) {
          throw new NotFoundError('No reservation found for this booking');
     }

     await publishAvailability(carId);
     return { carId, bookingId, released: true };
};

module.exports = {
     upsertCar,
     handleCarStatusChanged,
     getAvailability,
     lockCar,
     releaseCar,
     reserveCarForTrip,
     releaseCarReservation,
     confirmCar,
     cancelBooking,
     publishAvailability,
};

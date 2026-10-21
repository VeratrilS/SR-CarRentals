const prisma = require('../config/prisma');
const logger = require('../config/logger');
const { retryTransaction } = require('../utils/retryTransaction');
const { BadRequestError, NotFoundError, ConflictError, ForbiddenError } = require('../utils/error');
const { config } = require('../config');

/**
 * Shared-ride seat inventory.
 *
 * A trip visits stops 1..N. A seat hold covers the half-open stretch [fromSeq, toSeq):
 * someone riding stop 1 → 2 and someone riding 2 → 3 can use the same seat.
 * This is classic segment booking (the same model railways use), applied to car seats.
 */

const activeHoldFilter = () => ({
     OR: [
          { status: 'BOOKED' },
          { status: 'LOCKED', lockExpiresAt: { gt: new Date() } },
     ],
});

const validateSegment = (trip, fromSeq, toSeq) => {
     const from = Number(fromSeq);
     const to = Number(toSeq);
     const last = trip.stops.length;
     if (!Number.isInteger(from) || !Number.isInteger(to) || from < 1 || to > last || from >= to) {
          throw new BadRequestError(`Invalid stretch: choose stops between 1 and ${last}, boarding before alighting`);
     }
     return { from, to };
};

// ─── Kafka Event Handlers ───────────────────────────────────────────────────

const upsertTrip = async (event) => {
     const { tripId } = event;
     if (!tripId || !Array.isArray(event.stops)) {
          logger.warn('Invalid TRIP_SCHEDULED event — missing tripId or stops');
          return;
     }

     const data = {
          carId: event.car.carId,
          routeName: event.routeName,
          departureAt: new Date(event.departureAt),
          arrivalAt: new Date(event.arrivalAt),
          status: event.status || 'SCHEDULED',
          passengerSeats: event.passengerSeats,
          farePerKm: event.farePerKm,
          driverName: event.driverName,
          stops: event.stops,
          car: event.car,
     };

     await prisma.tripInventory.upsert({
          where: { tripId },
          create: { tripId, ...data },
          update: { ...data, version: { increment: 1 } },
     });
     logger.info(`Seat inventory ready for trip ${tripId} (${event.passengerSeats} seats, ${event.stops.length} stops)`);
};

const markTripCancelled = async ({ tripId }) => {
     if (!tripId) return;
     const updated = await prisma.tripInventory.updateMany({
          where: { tripId },
          data: { status: 'CANCELLED', version: { increment: 1 } },
     });
     // Seat holds are released by booking-service as it cancels each booking
     if (updated.count) logger.info(`Trip ${tripId} marked cancelled in inventory`);
};

// ─── Reads ───────────────────────────────────────────────────────────────────

const getTrip = async (tripId) => {
     const trip = await prisma.tripInventory.findUnique({ where: { tripId } });
     if (!trip) throw new NotFoundError('Trip not found');
     return trip;
};

/**
 * Seat map for a trip. With a stretch, each seat says whether it is free for
 * *that* stretch (a seat taken only for an earlier stretch is still free).
 */
const getSeatMap = async (tripId, fromSeq, toSeq) => {
     const trip = await getTrip(tripId);
     const { from, to } = fromSeq && toSeq
          ? validateSegment(trip, fromSeq, toSeq)
          : { from: 1, to: trip.stops.length };

     const holds = await prisma.tripSeatHold.findMany({
          where: { tripId, fromSeq: { lt: to }, toSeq: { gt: from }, ...activeHoldFilter() },
          select: { seatNumber: true },
     });
     const taken = new Set(holds.map((h) => h.seatNumber));

     const seats = Array.from({ length: trip.passengerSeats }, (_, i) => ({
          seatNumber: i + 1,
          available: !taken.has(i + 1),
     }));

     return {
          tripId: trip.tripId,
          routeName: trip.routeName,
          status: trip.status,
          departureAt: trip.departureAt,
          arrivalAt: trip.arrivalAt,
          driverName: trip.driverName,
          farePerKm: trip.farePerKm,
          car: trip.car,
          stops: trip.stops,
          fromSeq: from,
          toSeq: to,
          passengerSeats: trip.passengerSeats,
          seatsLeft: seats.filter((s) => s.available).length,
          seats,
     };
};

/** Seats left for many (trip, stretch) pairs in one round trip — used by search. */
const getAvailabilityBatch = async (items = []) => {
     const tripIds = [...new Set(items.map((i) => i.tripId))];
     if (tripIds.length === 0) return [];

     const [trips, holds] = await Promise.all([
          prisma.tripInventory.findMany({ where: { tripId: { in: tripIds } }, select: { tripId: true, passengerSeats: true, status: true } }),
          prisma.tripSeatHold.findMany({
               where: { tripId: { in: tripIds }, ...activeHoldFilter() },
               select: { tripId: true, seatNumber: true, fromSeq: true, toSeq: true },
          }),
     ]);
     const tripById = new Map(trips.map((t) => [t.tripId, t]));

     return items.map(({ tripId, fromSeq, toSeq }) => {
          const trip = tripById.get(tripId);
          if (!trip || trip.status !== 'SCHEDULED') return { tripId, fromSeq, toSeq, seatsLeft: 0 };
          const taken = new Set(
               holds.filter((h) => h.tripId === tripId && h.fromSeq < toSeq && h.toSeq > fromSeq).map((h) => h.seatNumber)
          );
          return { tripId, fromSeq, toSeq, seatsLeft: trip.passengerSeats - taken.size };
     });
};

// ─── Holds (internal, called by booking-service) ─────────────────────────────

/**
 * Hold specific seats for a stretch. Row-locks the trip so all seat changes on one
 * trip are serialised; the exclusion constraint backs this up at the DB level.
 */
const lockSeats = async (tripId, bookingId, seatNumbers, fromSeq, toSeq, userId, ttlSeconds) => {
     const ttl = Math.min(Math.max(ttlSeconds || config.LOCK_TTL_SECONDS, 60), 900);
     const lockExpiresAt = new Date(Date.now() + ttl * 1000);
     const seatsWanted = [...new Set((seatNumbers || []).map(Number))];
     if (seatsWanted.length === 0) throw new BadRequestError('Select at least one seat');

     return retryTransaction(async () => prisma.$transaction(async (tx) => {
          const rows = await tx.$queryRaw`
               SELECT "tripId", status, "departureAt" FROM trip_inventories
               WHERE "tripId" = ${tripId}
               FOR UPDATE NOWAIT
          `;
          if (rows.length === 0) throw new NotFoundError('Trip not found');
          if (rows[0].status !== 'SCHEDULED') throw new BadRequestError('This trip is no longer running');

          const trip = await tx.tripInventory.findUnique({ where: { tripId } });
          const { from, to } = validateSegment(trip, fromSeq, toSeq);

          const boardingTime = new Date(trip.stops[from - 1].time);
          if (boardingTime <= new Date()) throw new BadRequestError('This trip has already left your boarding stop');

          const invalid = seatsWanted.filter((n) => !Number.isInteger(n) || n < 1 || n > trip.passengerSeats);
          if (invalid.length) throw new BadRequestError(`Seat(s) ${invalid.join(', ')} don't exist on this car`);

          // Idempotent: the same booking re-requesting its hold
          const existing = await tx.tripSeatHold.findMany({ where: { bookingId } });
          if (existing.length) {
               return { tripId, bookingId, seatNumbers: existing.map((h) => h.seatNumber), fromSeq: from, toSeq: to, lockExpiresAt: existing[0].lockExpiresAt };
          }

          await tx.tripSeatHold.deleteMany({ where: { tripId, status: 'LOCKED', lockExpiresAt: { lt: new Date() } } });

          const clash = await tx.tripSeatHold.findMany({
               where: { tripId, seatNumber: { in: seatsWanted }, fromSeq: { lt: to }, toSeq: { gt: from } },
               select: { seatNumber: true },
          });
          if (clash.length) {
               throw new ConflictError(
                    `Seat ${[...new Set(clash.map((c) => c.seatNumber))].join(', ')} was just taken for part of your trip. Please pick another seat.`,
                    'SEATS_UNAVAILABLE'
               );
          }

          await tx.tripSeatHold.createMany({
               data: seatsWanted.map((seatNumber) => ({
                    tripId, seatNumber, fromSeq: from, toSeq: to, status: 'LOCKED', bookingId, lockedBy: userId, lockExpiresAt,
               })),
          });
          await tx.tripInventory.update({ where: { tripId }, data: { version: { increment: 1 } } });

          return { tripId, bookingId, seatNumbers: seatsWanted, fromSeq: from, toSeq: to, lockExpiresAt };
     }, { timeout: 10000 })).catch((err) => {
          if (err.meta?.code === '23P01' || err.message?.includes('trip_seat_holds_no_overlap')) {
               throw new ConflictError('One of those seats was just taken. Please pick another seat.', 'SEATS_UNAVAILABLE');
          }
          throw err;
     });
};

const releaseSeats = async (tripId, bookingId) => {
     const deleted = await prisma.tripSeatHold.deleteMany({ where: { tripId, bookingId, status: 'LOCKED' } });
     return { tripId, bookingId, released: deleted.count };
};

const confirmSeats = async (tripId, bookingId, userId) => {
     const holds = await prisma.tripSeatHold.findMany({ where: { tripId, bookingId } });
     if (holds.length === 0) throw new ConflictError('Seat hold expired or not found. Please book again.', 'LOCK_EXPIRED');
     if (holds.some((h) => h.lockedBy !== userId)) throw new ForbiddenError('These seats are held by another user');

     await prisma.tripSeatHold.updateMany({
          where: { tripId, bookingId, status: 'LOCKED' },
          data: { status: 'BOOKED', lockExpiresAt: null },
     });
     return { tripId, bookingId, status: 'BOOKED', seatNumbers: holds.map((h) => h.seatNumber) };
};

const cancelSeatBooking = async (tripId, bookingId) => {
     const deleted = await prisma.tripSeatHold.deleteMany({ where: { tripId, bookingId } });
     return { tripId, bookingId, released: deleted.count };
};

/** Lock-expiry job hook: drop seat holds whose payment window passed. */
const cleanExpiredSeatHolds = async () => {
     const res = await prisma.tripSeatHold.deleteMany({ where: { status: 'LOCKED', lockExpiresAt: { lt: new Date() } } });
     if (res.count) logger.info(`Released ${res.count} expired seat hold(s)`);
     return res.count;
};

module.exports = {
     upsertTrip,
     markTripCancelled,
     getTrip,
     getSeatMap,
     getAvailabilityBatch,
     lockSeats,
     releaseSeats,
     confirmSeats,
     cancelSeatBooking,
     cleanExpiredSeatHolds,
};

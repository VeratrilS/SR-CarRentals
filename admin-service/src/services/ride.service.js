const crypto = require('crypto');
const prisma = require('../config/prisma');
const logger = require('../config/logger');
const adminProducer = require('../kafka/producer/admin.producer');
const { inventoryClient } = require('./inventoryClient');
const { BadRequestError, ConflictError, NotFoundError } = require('../utils/error');

const MIN_LEAD_TIME_MS = 60 * 60 * 1000; // trips must be scheduled at least 1h ahead

// ─── Routes ──────────────────────────────────────────────────────────────────

/**
 * stops: [{ branchId, offsetMinutes, distanceKm }] in travel order.
 * The first stop is the origin (0 min, 0 km); both values must strictly increase.
 */
const createRoute = async ({ name, stops }) => {
     if (!Array.isArray(stops) || stops.length < 2) {
          throw new BadRequestError('A route needs at least 2 stops');
     }

     const branchIds = stops.map((s) => s.branchId);
     if (new Set(branchIds).size !== branchIds.length) {
          throw new BadRequestError('A branch can appear only once in a route');
     }

     const normalised = stops.map((s, i) => ({
          branchId: s.branchId,
          sequence: i + 1,
          offsetMinutes: i === 0 ? 0 : Number(s.offsetMinutes),
          distanceKm: i === 0 ? 0 : Number(s.distanceKm),
     }));
     for (let i = 1; i < normalised.length; i++) {
          const prev = normalised[i - 1], cur = normalised[i];
          if (!(cur.offsetMinutes > prev.offsetMinutes)) throw new BadRequestError(`Stop ${i + 1}: time must be later than the previous stop`);
          if (!(cur.distanceKm > prev.distanceKm)) throw new BadRequestError(`Stop ${i + 1}: distance must be greater than the previous stop`);
     }

     const branches = await prisma.branch.findMany({ where: { id: { in: branchIds } } });
     if (branches.length !== branchIds.length) throw new BadRequestError('One or more branches do not exist');

     const byId = Object.fromEntries(branches.map((b) => [b.id, b]));
     const routeName = name?.trim() || `${byId[branchIds[0]].city} → ${byId[branchIds[branchIds.length - 1]].city}`;

     const existing = await prisma.route.findUnique({ where: { name: routeName } });
     if (existing) throw new ConflictError('A route with this name already exists');

     const route = await prisma.route.create({
          data: { name: routeName, stops: { create: normalised } },
          include: { stops: { include: { branch: true }, orderBy: { sequence: 'asc' } } },
     });
     logger.info(`Route created: ${route.name} (${route.stops.length} stops)`);
     return route;
};

const getRoutes = async () =>
     prisma.route.findMany({
          include: { stops: { include: { branch: true }, orderBy: { sequence: 'asc' } }, _count: { select: { trips: true } } },
          orderBy: { name: 'asc' },
     });

// ─── Trips ───────────────────────────────────────────────────────────────────

/** Everything inventory, search and booking need about a trip — no call-backs required. */
const toTripEvent = (trip) => ({
     tripId: trip.id,
     routeId: trip.routeId,
     routeName: trip.route.name,
     departureAt: trip.departureAt,
     arrivalAt: trip.arrivalAt,
     driverName: trip.driverName,
     farePerKm: trip.farePerKm,
     status: trip.status,
     car: {
          carId: trip.car.id,
          make: trip.car.make,
          model: trip.car.model,
          registrationNumber: trip.car.registrationNumber,
          category: trip.car.category,
          transmission: trip.car.transmission,
          fuelType: trip.car.fuelType,
          seats: trip.car.seats,
          imageUrl: trip.car.imageUrl,
     },
     passengerSeats: trip.car.seats - 1, // one seat is the driver's
     stops: trip.route.stops.map((s) => ({
          sequence: s.sequence,
          branchId: s.branchId,
          name: s.branch.name,
          code: s.branch.code,
          city: s.branch.city,
          offsetMinutes: s.offsetMinutes,
          distanceKm: s.distanceKm,
          time: new Date(trip.departureAt.getTime() + s.offsetMinutes * 60000),
     })),
});

const tripInclude = {
     car: true,
     route: { include: { stops: { include: { branch: true }, orderBy: { sequence: 'asc' } } } },
};

const scheduleTrip = async ({ routeId, carId, departureAt, driverName, farePerKm }) => {
     const departure = new Date(departureAt);
     if (isNaN(departure.getTime())) throw new BadRequestError('departureAt must be a valid date-time');
     if (departure.getTime() < Date.now() + MIN_LEAD_TIME_MS) throw new BadRequestError('Trips must be scheduled at least 1 hour ahead');
     if (!(Number(farePerKm) > 0)) throw new BadRequestError('farePerKm must be a positive number');
     if (!driverName?.trim()) throw new BadRequestError('driverName is required');

     const route = await prisma.route.findUnique({ where: { id: routeId }, include: { stops: { orderBy: { sequence: 'asc' } } } });
     if (!route) throw new NotFoundError('Route not found');

     const car = await prisma.car.findUnique({ where: { id: carId } });
     if (!car) throw new NotFoundError('Car not found');
     if (car.status !== 'ACTIVE') throw new BadRequestError('Only active cars can run trips');
     if (car.seats < 4) throw new BadRequestError('Shared rides need a car with at least 4 seats');

     const arrival = new Date(departure.getTime() + route.stops[route.stops.length - 1].offsetMinutes * 60000);
     const tripId = crypto.randomUUID();

     // 1. Block the car for the whole trip (fails with 409 if it's rented or on another trip)
     await inventoryClient.reserveCarForTrip(carId, tripId, departure, arrival);

     // 2. Persist the trip; undo the reservation if that fails
     let trip;
     try {
          trip = await prisma.trip.create({
               data: { id: tripId, routeId, carId, departureAt: departure, arrivalAt: arrival, driverName: driverName.trim(), farePerKm: Number(farePerKm) },
               include: tripInclude,
          });
     } catch (err) {
          await inventoryClient.releaseCarForTrip(carId, tripId).catch(() => {});
          throw err;
     }

     // 3. Inventory builds the seat map, search indexes the ride
     await adminProducer.publishTripScheduled(toTripEvent(trip));
     logger.info(`Trip scheduled: ${route.name} on ${departure.toISOString()} with ${car.make} ${car.model}`);
     return trip;
};

const cancelTrip = async (tripId, reason = 'trip_cancelled') => {
     const trip = await prisma.trip.findUnique({ where: { id: tripId }, include: tripInclude });
     if (!trip) throw new NotFoundError('Trip not found');
     if (trip.status === 'CANCELLED') return trip;

     const updated = await prisma.trip.update({ where: { id: tripId }, data: { status: 'CANCELLED' }, include: tripInclude });

     await inventoryClient.releaseCarForTrip(trip.carId, trip.id).catch((err) => {
          logger.error(`Could not release car reservation for trip ${trip.id}`, { error: err.message });
     });
     // booking-service cancels + refunds every seat booking on it; search hides it
     await adminProducer.publishTripCancelled({ tripId: trip.id, carId: trip.carId, reason });
     logger.info(`Trip ${trip.id} cancelled (${reason})`);
     return updated;
};

/** When a car leaves the fleet, its upcoming trips can't run. */
const cancelUpcomingTripsForCar = async (carId) => {
     const trips = await prisma.trip.findMany({
          where: { carId, status: 'SCHEDULED', arrivalAt: { gt: new Date() } },
          select: { id: true },
     });
     for (const t of trips) {
          await cancelTrip(t.id, 'car_unavailable');
     }
     return trips.length;
};

const getTrips = async (query = {}) => {
     const where = {};
     if (query.status) where.status = String(query.status).toUpperCase();
     if (query.routeId) where.routeId = query.routeId;
     if (query.upcoming === 'true') where.arrivalAt = { gt: new Date() };
     return prisma.trip.findMany({ where, include: tripInclude, orderBy: { departureAt: 'asc' } });
};

module.exports = { createRoute, getRoutes, scheduleTrip, cancelTrip, cancelUpcomingTripsForCar, getTrips };

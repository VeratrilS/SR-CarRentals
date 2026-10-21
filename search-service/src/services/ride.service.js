const { esClient, TRIP_INDEX, BRANCH_INDEX } = require('../config/elasticsearch');
const { config } = require('../config');
const logger = require('../config/logger');
const { resolveLocation } = require('./search.service');
const { BoolQueryBuilder } = require('../utils/boolQueryBuilder');

const MIN_SEAT_FARE = 100;                      // mirrors booking-service pricing
const SALES_CUTOFF_MS = 30 * 60 * 1000;         // stop selling 30 min before boarding

// ═══════════════════════════════════════════════════
//  INDEX OPERATIONS (Kafka consumer)
// ═══════════════════════════════════════════════════

const indexTrip = async (trip) => {
     if (!trip?.tripId) return;
     await esClient.index({
          index: TRIP_INDEX,
          id: trip.tripId,
          document: {
               tripId: trip.tripId,
               routeName: trip.routeName,
               status: trip.status || 'SCHEDULED',
               departureAt: trip.departureAt,
               arrivalAt: trip.arrivalAt,
               driverName: trip.driverName,
               farePerKm: trip.farePerKm,
               passengerSeats: trip.passengerSeats,
               car: trip.car,
               stops: trip.stops.map((s) => ({
                    sequence: s.sequence,
                    branchId: s.branchId,
                    name: s.name,
                    code: s.code,
                    city: s.city,
                    time: s.time,
                    distanceKm: s.distanceKm,
               })),
          },
          refresh: true,
     });
     logger.info(`Indexed trip ${trip.routeName} @ ${trip.departureAt}`);
};

const cancelTrip = async ({ tripId }) => {
     if (!tripId) return;
     try {
          await esClient.update({ index: TRIP_INDEX, id: tripId, doc: { status: 'CANCELLED' }, refresh: true });
          logger.info(`Trip ${tripId} hidden from search (cancelled)`);
     } catch (err) {
          if (err.meta?.statusCode !== 404) throw err;
     }
};

// ═══════════════════════════════════════════════════
//  SEARCH
// ═══════════════════════════════════════════════════

/** City or branch text → the branch ids it covers (+ a display label). */
const resolveBranchIds = async (input) => {
     const loc = await resolveLocation(input);
     if (!loc) return null;
     if (loc.type === 'branch') return { label: loc.label, ids: [loc.branchId] };

     const res = await esClient.search({
          index: BRANCH_INDEX,
          query: { term: { 'city.kw': loc.city.toLowerCase() } },
          size: 50,
          _source: ['branchId'],
     });
     return { label: loc.label, ids: res.hits.hits.map((h) => h._source.branchId) };
};

/** Ask inventory how many seats are free on each (trip, stretch). */
const fetchSeatsLeft = async (items) => {
     if (items.length === 0) return new Map();
     try {
          const res = await fetch(`${config.INVENTORY_SERVICE_URL}/internal/trips/availability`, {
               method: 'POST',
               headers: { 'Content-Type': 'application/json', 'x-internal-service-key': config.INTERNAL_SERVICE_KEY },
               body: JSON.stringify({ items }),
               signal: AbortSignal.timeout(5000),
          });
          if (!res.ok) throw new Error(`inventory responded ${res.status}`);
          const { data } = await res.json();
          return new Map(data.map((d) => [`${d.tripId}:${d.fromSeq}:${d.toSeq}`, d.seatsLeft]));
     } catch (err) {
          // Degrade gracefully: show rides without live counts rather than failing search
          logger.warn('Could not fetch live seat availability', { error: err.message });
          return null;
     }
};

const localDate = (d) => new Date(d).toLocaleDateString('en-CA', { timeZone: config.TIME_ZONE }); // YYYY-MM-DD

/**
 * Trips that stop in `from` and later in `to`, boarding on `date` (local),
 * with at least `seats` free on that stretch.
 */
const searchRides = async ({ from, to, date, seats = 1 }) => {
     const [origin, destination] = await Promise.all([resolveBranchIds(from), resolveBranchIds(to)]);
     if (!origin || origin.ids.length === 0) return { rides: [], count: 0, message: `No pickup point found for "${from}"` };
     if (!destination || destination.ids.length === 0) return { rides: [], count: 0, message: `No drop point found for "${to}"` };

     // Trips departing within ±1 day of the date; exact boarding-day check below
     const day = new Date(`${date}T00:00:00Z`);
     const result = await esClient.search({
          index: TRIP_INDEX,
          size: 100,
          query: new BoolQueryBuilder()
               .term('status', 'SCHEDULED')
               .range('departureAt', {
                    gte: new Date(day.getTime() - 864e5).toISOString(),
                    lt: new Date(day.getTime() + 2 * 864e5).toISOString(),
               })
               // The same trip must stop at the origin AND at the destination
               .nested('stops', { terms: { 'stops.branchId': origin.ids } }, 'from')
               .nested('stops', { terms: { 'stops.branchId': destination.ids } }, 'to')
               .build(),
     });

     const candidates = [];
     for (const hit of result.hits.hits) {
          const fromStops = hit.inner_hits.from.hits.hits.map((h) => h._source);
          const toStops = hit.inner_hits.to.hits.hits.map((h) => h._source);
          // Earliest boarding stop that has a later drop stop
          const pair = fromStops
               .sort((a, b) => a.sequence - b.sequence)
               .map((f) => ({ f, t: toStops.filter((t) => t.sequence > f.sequence).sort((a, b) => a.sequence - b.sequence)[0] }))
               .find((p) => p.t);
          if (!pair) continue;
          if (localDate(pair.f.time) !== date) continue;
          if (new Date(pair.f.time).getTime() < Date.now() + SALES_CUTOFF_MS) continue;
          candidates.push({ trip: hit._source, fromStop: pair.f, toStop: pair.t });
     }

     const seatsLeft = await fetchSeatsLeft(candidates.map((c) => ({ tripId: c.trip.tripId, fromSeq: c.fromStop.sequence, toSeq: c.toStop.sequence })));

     const rides = candidates
          .map(({ trip, fromStop, toStop }) => {
               const distanceKm = Math.max(0, toStop.distanceKm - fromStop.distanceKm);
               const left = seatsLeft ? seatsLeft.get(`${trip.tripId}:${fromStop.sequence}:${toStop.sequence}`) ?? 0 : null;
               return {
                    tripId: trip.tripId,
                    routeName: trip.routeName,
                    driverName: trip.driverName,
                    car: trip.car,
                    passengerSeats: trip.passengerSeats,
                    fromStop,
                    toStop,
                    stopsInBetween: toStop.sequence - fromStop.sequence - 1,
                    durationMinutes: Math.round((new Date(toStop.time) - new Date(fromStop.time)) / 60000),
                    distanceKm,
                    seatFare: Math.max(MIN_SEAT_FARE, Math.round(distanceKm * trip.farePerKm)),
                    seatsLeft: left,
               };
          })
          .filter((r) => r.seatsLeft === null || r.seatsLeft >= Number(seats))
          .sort((a, b) => new Date(a.fromStop.time) - new Date(b.fromStop.time));

     return {
          from: origin.label,
          to: destination.label,
          date,
          seats: Number(seats),
          liveAvailability: seatsLeft !== null,
          count: rides.length,
          rides,
     };
};

module.exports = { indexTrip, cancelTrip, searchRides };

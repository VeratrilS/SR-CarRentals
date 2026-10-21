const { esClient, CAR_INDEX, BRANCH_INDEX } = require('../config/elasticsearch');
const logger = require('../config/logger');

// Mirrors booking-service pricing so search can show an estimate.
// The authoritative price is always the booking-service quote.
const LONG_RENTAL_MIN_DAYS = 7;
const LONG_RENTAL_DISCOUNT_PCT = 10;
const GRACE_MINUTES = 30;

// ═══════════════════════════════════════════════════
//  INDEX OPERATIONS (called by Kafka consumer)
// ═══════════════════════════════════════════════════

/**
 * Event shape: { eventType, data: { id, name, code, city, state, address }, timestamp }
 */
const indexBranch = async (event) => {
     const branch = event.data;
     if (!branch) return;

     await esClient.index({
          index: BRANCH_INDEX,
          id: branch.id,
          document: {
               branchId: branch.id,
               name: branch.name,
               code: branch.code,
               city: branch.city,
               address: branch.address,
               suggest: {
                    input: [branch.name, branch.code, branch.city].filter(Boolean),
                    weight: 10,
               },
          },
          refresh: true,
     });
     logger.info(`Indexed branch ${branch.name} (${branch.code})`);
};

/**
 * CAR_CREATED / CAR_UPDATED. Uses a partial update with upsert so it merges with
 * blockedRanges that may already have arrived via CAR_AVAILABILITY_UPDATED
 * (the two topics are not ordered relative to each other).
 */
const upsertCar = async (car) => {
     if (!car || !car.carId) return;

     await esClient.update({
          index: CAR_INDEX,
          id: car.carId,
          doc: {
               carId: car.carId,
               registrationNumber: car.registrationNumber,
               make: car.make,
               model: car.model,
               year: car.year,
               category: car.category,
               transmission: car.transmission,
               fuelType: car.fuelType,
               seats: car.seats,
               dailyRate: car.dailyRate,
               imageUrl: car.imageUrl || null,
               status: car.status,
               branch: {
                    branchId: car.branch.branchId,
                    name: car.branch.name,
                    code: car.branch.code,
                    city: car.branch.city,
               },
          },
          doc_as_upsert: true,
          refresh: true,
     });
     logger.info(`Indexed car ${car.make} ${car.model} (${car.registrationNumber})`);
};

const updateCarStatus = async ({ carId, status }) => {
     if (!carId) return;
     await esClient.update({
          index: CAR_INDEX,
          id: carId,
          doc: { status },
          doc_as_upsert: true,
          refresh: true,
     });
     logger.info(`Car ${carId} status -> ${status}`);
};

/**
 * CAR_AVAILABILITY_UPDATED: replace the car's blocked ranges.
 */
const updateCarAvailability = async ({ carId, status, blockedRanges = [] }) => {
     if (!carId) return;
     await esClient.update({
          index: CAR_INDEX,
          id: carId,
          doc: {
               ...(status && { status }),
               blockedRanges: blockedRanges.map((r) => ({ gte: r.startAt, lt: r.endAt })),
          },
          doc_as_upsert: true,
          refresh: true,
     });
     logger.info(`Updated availability for car ${carId} (${blockedRanges.length} blocked range(s))`);
};

// ═══════════════════════════════════════════════════
//  SEARCH OPERATIONS (called by API)
// ═══════════════════════════════════════════════════

/**
 * Resolve free text to a location filter.
 *   1. exact branch code       → that branch
 *   2. exact city (any case)   → every branch in the city
 *   3. completion suggester    → best branch (handles typos)
 *   4. fuzzy name/city match   → best branch
 */
// Former / colloquial city names → the name branches are registered under.
// Too far apart for fuzzy matching (e.g. "Bangalore" vs "Bengaluru").
const CITY_ALIASES = {
     bangalore: 'Bengaluru',
     banglore: 'Bengaluru',
     blr: 'Bengaluru',
     bombay: 'Mumbai',
     madras: 'Chennai',
     calcutta: 'Kolkata',
     gurgaon: 'Gurugram',
     trivandrum: 'Thiruvananthapuram',
     vizag: 'Visakhapatnam',
     hyd: 'Hyderabad',
};

const resolveLocation = async (rawInput) => {
     const input = CITY_ALIASES[rawInput.trim().toLowerCase()] || rawInput.trim();

     const exactCode = await esClient.search({
          index: BRANCH_INDEX,
          query: { term: { code: input.toUpperCase() } },
          size: 1,
     });
     if (exactCode.hits.hits.length > 0) {
          const b = exactCode.hits.hits[0]._source;
          return { type: 'branch', branchId: b.branchId, label: `${b.name}, ${b.city}` };
     }

     const cityHit = await esClient.search({
          index: BRANCH_INDEX,
          query: { term: { 'city.kw': input.trim().toLowerCase() } },
          size: 1,
     });
     if (cityHit.hits.hits.length > 0) {
          const city = cityHit.hits.hits[0]._source.city;
          return { type: 'city', city, label: city };
     }

     try {
          const suggestResult = await esClient.search({
               index: BRANCH_INDEX,
               suggest: {
                    branch_suggest: {
                         prefix: input,
                         completion: { field: 'suggest', fuzzy: { fuzziness: 'AUTO' }, size: 1 },
                    },
               },
          });
          const option = suggestResult.suggest?.branch_suggest?.[0]?.options?.[0];
          if (option) {
               const b = option._source;
               return { type: 'branch', branchId: b.branchId, label: `${b.name}, ${b.city}` };
          }
     } catch (err) {
          logger.warn(`Suggest fallback failed: ${err.message}`);
     }

     const fuzzy = await esClient.search({
          index: BRANCH_INDEX,
          query: {
               multi_match: { query: input, fields: ['name', 'city'], fuzziness: 'AUTO', prefix_length: 1 },
          },
          size: 1,
     });
     if (fuzzy.hits.hits.length > 0) {
          const b = fuzzy.hits.hits[0]._source;
          return { type: 'branch', branchId: b.branchId, label: `${b.name}, ${b.city}` };
     }

     return null;
};

const estimatePrice = (dailyRate, pickup, dropoff) => {
     const hours = (dropoff.getTime() - pickup.getTime()) / 3600000 - GRACE_MINUTES / 60;
     const rentalDays = Math.max(1, Math.ceil(hours / 24));
     const base = Math.round(rentalDays * dailyRate);
     const discount = rentalDays >= LONG_RENTAL_MIN_DAYS ? Math.round(base * LONG_RENTAL_DISCOUNT_PCT / 100) : 0;
     return { rentalDays, estimatedTotal: base - discount };
};

const SORTS = {
     price_asc: [{ dailyRate: 'asc' }],
     price_desc: [{ dailyRate: 'desc' }],
     newest: [{ year: 'desc' }, { dailyRate: 'asc' }],
     seats: [{ seats: 'desc' }, { dailyRate: 'asc' }],
};

/**
 * Find cars at a location that are free for the whole [pickupAt, dropoffAt) window.
 */
const searchCars = async ({ location, pickupAt, dropoffAt, category, transmission, fuelType, minSeats, maxPrice, sort }) => {
     const resolved = await resolveLocation(location);
     if (!resolved) {
          return { cars: [], count: 0, message: `No branch found for "${location}"` };
     }

     const filter = [{ term: { status: 'ACTIVE' } }];
     if (resolved.type === 'branch') filter.push({ term: { 'branch.branchId': resolved.branchId } });
     if (resolved.type === 'city') filter.push({ term: { 'branch.city': resolved.city } });
     if (category) filter.push({ terms: { category: String(category).toUpperCase().split(',') } });
     if (transmission) filter.push({ term: { transmission: String(transmission).toUpperCase() } });
     if (fuelType) filter.push({ terms: { fuelType: String(fuelType).toUpperCase().split(',') } });
     if (minSeats) filter.push({ range: { seats: { gte: Number(minSeats) } } });
     if (maxPrice) filter.push({ range: { dailyRate: { lte: Number(maxPrice) } } });

     const mustNot = [];
     let pickup = null;
     let dropoff = null;
     if (pickupAt && dropoffAt) {
          pickup = new Date(pickupAt);
          dropoff = new Date(dropoffAt);
          // Exclude cars with any booked/held interval intersecting the requested window
          mustNot.push({
               range: {
                    blockedRanges: {
                         gte: pickup.toISOString(),
                         lt: dropoff.toISOString(),
                         relation: 'intersects',
                    },
               },
          });
     }

     const result = await esClient.search({
          index: CAR_INDEX,
          query: { bool: { filter, must_not: mustNot } },
          sort: SORTS[sort] || SORTS.price_asc,
          size: 100,
          aggs: {
               categories: { terms: { field: 'category' } },
               transmissions: { terms: { field: 'transmission' } },
               fuelTypes: { terms: { field: 'fuelType' } },
               priceRange: { stats: { field: 'dailyRate' } },
          },
     });

     const cars = result.hits.hits.map((hit) => {
          const c = hit._source;
          return {
               carId: c.carId,
               make: c.make,
               model: c.model,
               year: c.year,
               category: c.category,
               transmission: c.transmission,
               fuelType: c.fuelType,
               seats: c.seats,
               dailyRate: c.dailyRate,
               imageUrl: c.imageUrl,
               branch: c.branch,
               ...(pickup && dropoff ? estimatePrice(c.dailyRate, pickup, dropoff) : {}),
          };
     });

     const bucketMap = (agg) => Object.fromEntries((agg?.buckets || []).map((b) => [b.key, b.doc_count]));

     return {
          location: resolved.label,
          pickupAt: pickup,
          dropoffAt: dropoff,
          count: cars.length,
          cars,
          facets: {
               category: bucketMap(result.aggregations?.categories),
               transmission: bucketMap(result.aggregations?.transmissions),
               fuelType: bucketMap(result.aggregations?.fuelTypes),
               price: {
                    min: result.aggregations?.priceRange?.min ?? null,
                    max: result.aggregations?.priceRange?.max ?? null,
               },
          },
     };
};

/**
 * Cities with active cars — powers the "popular locations" shortcuts.
 */
const getLocations = async () => {
     const result = await esClient.search({
          index: CAR_INDEX,
          size: 0,
          query: { term: { status: 'ACTIVE' } },
          aggs: {
               cities: {
                    terms: { field: 'branch.city', size: 50, order: { _count: 'desc' } },
                    aggs: {
                         fromPrice: { min: { field: 'dailyRate' } },
                         branches: { cardinality: { field: 'branch.branchId' } },
                         sample: { top_hits: { size: 1, _source: ['branch.city'] } },
                    },
               },
          },
     });

     return (result.aggregations?.cities?.buckets || []).map((b) => ({
          city: b.sample.hits.hits[0]?._source?.branch?.city || b.key,
          cars: b.doc_count,
          branches: b.branches.value,
          fromPrice: b.fromPrice.value,
     }));
};

/**
 * Autocomplete pickup locations (branches) as the user types.
 */
const autocompleteBranch = async (prefix) => {
     const result = await esClient.search({
          index: BRANCH_INDEX,
          suggest: {
               branch_suggest: {
                    prefix,
                    completion: { field: 'suggest', fuzzy: { fuzziness: 'AUTO' }, size: 10 },
               },
          },
     });

     const options = result.suggest.branch_suggest[0]?.options || [];
     return options.map((o) => ({
          branchId: o._source.branchId,
          name: o._source.name,
          code: o._source.code,
          city: o._source.city,
     }));
};

/**
 * Debug: get all indexed branches
 */
const getAllBranches = async () => {
     const result = await esClient.search({ index: BRANCH_INDEX, query: { match_all: {} }, size: 100 });
     return result.hits.hits.map((h) => h._source);
};

/**
 * Debug: get all indexed cars
 */
const getAllCars = async () => {
     const result = await esClient.search({ index: CAR_INDEX, query: { match_all: {} }, size: 100 });
     return result.hits.hits.map((h) => h._source);
};

module.exports = {
     indexBranch,
     upsertCar,
     updateCarStatus,
     updateCarAvailability,
     searchCars,
     resolveLocation,
     autocompleteBranch,
     getLocations,
     getAllBranches,
     getAllCars,
};

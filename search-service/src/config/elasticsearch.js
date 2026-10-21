const { Client } = require('@elastic/elasticsearch');
const { config } = require('.');
const logger = require('./logger');

const esClient = new Client({ node: config.ELASTICSEARCH_URL });

const BRANCH_INDEX = 'branches';
const CAR_INDEX = 'cars';
const TRIP_INDEX = 'trips';

/**
 * Create indices with mappings that power:
 *   • Fuzzy search  (match + fuzziness)
 *   • Autocomplete  (completion suggester)
 *   • Availability  (date_range field — cars whose booked ranges intersect
 *                    the requested pickup/drop-off window are filtered out)
 */
const initIndices = async () => {
     // ── Branch index (for location autocomplete) ──
     const branchExists = await esClient.indices.exists({ index: BRANCH_INDEX });
     if (!branchExists) {
          await esClient.indices.create({
               index: BRANCH_INDEX,
               settings: {
                    analysis: {
                         analyzer: {
                              autocomplete_analyzer: {
                                   type: 'custom',
                                   tokenizer: 'autocomplete_tokenizer',
                                   filter: ['lowercase'],
                              },
                              search_analyzer: {
                                   type: 'custom',
                                   tokenizer: 'standard',
                                   filter: ['lowercase'],
                              },
                         },
                         tokenizer: {
                              autocomplete_tokenizer: {
                                   type: 'edge_ngram',
                                   min_gram: 2,
                                   max_gram: 20,
                                   token_chars: ['letter', 'digit'],
                              },
                         },
                         normalizer: {
                              lowercase_normalizer: { type: 'custom', filter: ['lowercase'] },
                         },
                    },
               },
               mappings: {
                    properties: {
                         branchId: { type: 'keyword' },
                         name: { type: 'text', analyzer: 'autocomplete_analyzer', search_analyzer: 'search_analyzer' },
                         code: { type: 'keyword' },
                         city: {
                              type: 'text',
                              analyzer: 'autocomplete_analyzer',
                              search_analyzer: 'search_analyzer',
                              fields: { kw: { type: 'keyword', normalizer: 'lowercase_normalizer' } },
                         },
                         address: { type: 'text' },
                         suggest: { type: 'completion' },
                    },
               },
          });
          logger.info('Branch index created');
     }

     // ── Car index ──
     const carExists = await esClient.indices.exists({ index: CAR_INDEX });
     if (!carExists) {
          await esClient.indices.create({
               index: CAR_INDEX,
               settings: {
                    analysis: {
                         normalizer: {
                              lowercase_normalizer: { type: 'custom', filter: ['lowercase'] },
                         },
                    },
               },
               mappings: {
                    properties: {
                         carId: { type: 'keyword' },
                         registrationNumber: { type: 'keyword' },
                         make: { type: 'text', fields: { kw: { type: 'keyword' } } },
                         model: { type: 'text', fields: { kw: { type: 'keyword' } } },
                         year: { type: 'integer' },
                         category: { type: 'keyword' },
                         transmission: { type: 'keyword' },
                         fuelType: { type: 'keyword' },
                         seats: { type: 'integer' },
                         dailyRate: { type: 'float' },
                         imageUrl: { type: 'keyword', index: false },
                         status: { type: 'keyword' },
                         branch: {
                              properties: {
                                   branchId: { type: 'keyword' },
                                   name: { type: 'text' },
                                   code: { type: 'keyword' },
                                   city: { type: 'keyword', normalizer: 'lowercase_normalizer' },
                              },
                         },
                         // Each entry is { gte: startAt, lt: endAt } — a booked/held interval
                         blockedRanges: { type: 'date_range' },
                    },
               },
          });
          logger.info('Car index created');
     }

     // -- Trip index (shared rides) --
     const tripExists = await esClient.indices.exists({ index: TRIP_INDEX });
     if (!tripExists) {
          await esClient.indices.create({
               index: TRIP_INDEX,
               mappings: {
                    properties: {
                         tripId: { type: 'keyword' },
                         routeName: { type: 'text' },
                         status: { type: 'keyword' },
                         departureAt: { type: 'date' },
                         arrivalAt: { type: 'date' },
                         driverName: { type: 'text' },
                         farePerKm: { type: 'float' },
                         passengerSeats: { type: 'integer' },
                         car: { type: 'object', enabled: false },
                         stops: {
                              type: 'nested',
                              properties: {
                                   sequence: { type: 'integer' },
                                   branchId: { type: 'keyword' },
                                   name: { type: 'text' },
                                   code: { type: 'keyword' },
                                   city: { type: 'keyword' },
                                   time: { type: 'date' },
                                   distanceKm: { type: 'float' },
                              },
                         },
                    },
               },
          });
          logger.info('Trip index created');
     }
};

const recreateIndices = async () => {
     for (const index of [BRANCH_INDEX, CAR_INDEX, TRIP_INDEX]) {
          const exists = await esClient.indices.exists({ index });
          if (exists) {
               await esClient.indices.delete({ index });
               logger.info(`Deleted index: ${index}`);
          }
     }
     await initIndices();
     logger.info('All indices recreated');
};

module.exports = { esClient, BRANCH_INDEX, CAR_INDEX, TRIP_INDEX, initIndices, recreateIndices };

const { kafka, consumer, producer, connectProducer } = require('../../config/kafka');
const searchService = require('../../services/search.service');
const rideService = require('../../services/ride.service');
const logger = require('../../config/logger');
const { KAFKA_TOPICS } = require('../../../../shared/constants/kafka-topics');
const { withDLQ } = require('../../../../shared/utils/dlqHandler');
const { ensureTopics } = require('../../../../shared/utils/ensureTopics');

const TOPICS = [
     KAFKA_TOPICS.BRANCH_CREATED,
     KAFKA_TOPICS.CAR_CREATED,
     KAFKA_TOPICS.CAR_UPDATED,
     KAFKA_TOPICS.CAR_STATUS_CHANGED,
     KAFKA_TOPICS.CAR_AVAILABILITY_UPDATED,
     KAFKA_TOPICS.TRIP_SCHEDULED,
     KAFKA_TOPICS.TRIP_CANCELLED,
];

/**
 * When the Elasticsearch indices were just recreated, rebuild them from the full
 * event history: once this member joins the group, seek every partition it was
 * assigned back to offset 0. (Resetting offsets via the admin API is fragile —
 * it fails while a previous instance's session is still registered.)
 */
function replayFromStartOnJoin() {
     let replayed = false;
     consumer.on(consumer.events.GROUP_JOIN, ({ payload }) => {
          if (replayed) return;
          replayed = true;
          for (const [topic, partitions] of Object.entries(payload.memberAssignment)) {
               for (const partition of partitions) {
                    consumer.seek({ topic, partition, offset: '0' });
               }
          }
          logger.info('Replaying Kafka history to rebuild search indices');
     });
}

class SearchConsumer {
     async start({ replay = false } = {}) {
          await ensureTopics(kafka, logger);
          if (replay) replayFromStartOnJoin();

          await consumer.connect();
          await connectProducer(); // needed for DLQ publishing
          logger.info('Search consumer connected');

          await consumer.subscribe({ topics: TOPICS, fromBeginning: true });

          await consumer.run({
               eachMessage: withDLQ(producer, KAFKA_TOPICS.DLQ_SEARCH, logger, async ({ topic, partition, message, parsedValue }) => {
                    logger.info(`Processing ${topic}`, { partition, offset: message.offset });

                    switch (topic) {
                         case KAFKA_TOPICS.BRANCH_CREATED:
                              await searchService.indexBranch(parsedValue);
                              break;
                         case KAFKA_TOPICS.CAR_CREATED:
                         case KAFKA_TOPICS.CAR_UPDATED:
                              await searchService.upsertCar(parsedValue);
                              break;
                         case KAFKA_TOPICS.CAR_STATUS_CHANGED:
                              await searchService.updateCarStatus(parsedValue);
                              break;
                         case KAFKA_TOPICS.CAR_AVAILABILITY_UPDATED:
                              await searchService.updateCarAvailability(parsedValue);
                              break;
                         case KAFKA_TOPICS.TRIP_SCHEDULED:
                              await rideService.indexTrip(parsedValue);
                              break;
                         case KAFKA_TOPICS.TRIP_CANCELLED:
                              await rideService.cancelTrip(parsedValue);
                              break;
                         default:
                              logger.warn(`Unknown topic: ${topic}`);
                    }
               }),
          });

          logger.info('Search consumer running...');
     }
}

module.exports = new SearchConsumer();

const { kafka, consumer, producer, connectProducer } = require('../../config/kafka');
const searchService = require('../../services/search.service');
const rideService = require('../../services/ride.service');
const logger = require('../../config/logger');
const { KAFKA_TOPICS } = require('../../../../shared/constants/kafka-topics');
const { EventConsumer } = require('../../../../shared/utils/eventConsumer');

class SearchConsumer extends EventConsumer {
     // Observer: the events that keep the search indices in sync (CQRS read side)
     handlers() {
          return {
               [KAFKA_TOPICS.BRANCH_CREATED]: (event) => searchService.indexBranch(event),
               [KAFKA_TOPICS.CAR_CREATED]: (event) => searchService.upsertCar(event),
               [KAFKA_TOPICS.CAR_UPDATED]: (event) => searchService.upsertCar(event),
               [KAFKA_TOPICS.CAR_STATUS_CHANGED]: (event) => searchService.updateCarStatus(event),
               [KAFKA_TOPICS.CAR_AVAILABILITY_UPDATED]: (event) => searchService.updateCarAvailability(event),
               [KAFKA_TOPICS.TRIP_SCHEDULED]: (event) => rideService.indexTrip(event),
               [KAFKA_TOPICS.TRIP_CANCELLED]: (event) => rideService.cancelTrip(event),
          };
     }

     /**
      * When the Elasticsearch indices were just recreated, rebuild them from the full
      * event history: seek each partition back to offset 0 the FIRST time this member
      * is assigned it. Partitions can arrive over several joins — right after a restart
      * the previous instance's session may still hold some of them until it times out —
      * so we track per partition rather than only rewinding on the first join.
      * (Resetting offsets via the admin API is fragile for the same reason.)
      */
     async beforeConnect({ replay = false } = {}) {
          if (!replay) return;
          const rewound = new Set();
          this.consumer.on(this.consumer.events.GROUP_JOIN, ({ payload }) => {
               let count = 0;
               for (const [topic, partitions] of Object.entries(payload.memberAssignment)) {
                    for (const partition of partitions) {
                         const key = `${topic}:${partition}`;
                         if (rewound.has(key)) continue;
                         rewound.add(key);
                         this.consumer.seek({ topic, partition, offset: '0' });
                         count++;
                    }
               }
               if (count) this.logger.info(`Replaying Kafka history of ${count} partition(s) to rebuild search indices`);
          });
     }
}

module.exports = new SearchConsumer({
     name: 'Search',
     kafka, consumer, producer, connectProducer, logger,
     dlqTopic: KAFKA_TOPICS.DLQ_SEARCH,
     fromBeginning: true,
});

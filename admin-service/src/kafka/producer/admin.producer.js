const { producer, connectProducer } = require('../../config/kafka');
const logger = require('../../config/logger');
const { KAFKA_TOPICS } = require('../../../../shared/constants/kafka-topics');

class AdminProducer {
     constructor() { this.isInitialized = false; }

     async initialize() {
          if (!this.isInitialized) {
               await connectProducer();
               this.isInitialized = true;
          }
     }

     async sendMessage(topic, key, value) {
          try {
               await this.initialize();
               const result = await producer.send({
                    topic,
                    messages: [{
                         key: key || `${topic}-${Date.now()}`,
                         value: JSON.stringify(value),
                         timestamp: Date.now().toString(),
                    }],
               });
               logger.info(`Message sent to topic: ${topic}`, {
                    key,
                    partition: result[0].partition,
                    offset: result[0].offset,
               });
               return result;
          } catch (error) {
               logger.error(`Failed to send message to topic: ${topic}`, {
                    error: error.message,
                    key,
               });
               throw error;
          }
     }


     async publishBranchCreated(branch) {
          return this.sendMessage(
               KAFKA_TOPICS.BRANCH_CREATED,
               `branch-${branch.id}`,
               { eventType: 'BRANCH_CREATED', data: branch, timestamp: new Date().toISOString() }
          );
     }

     async publishCarCreated(carEvent) {
          return this.sendMessage(
               KAFKA_TOPICS.CAR_CREATED,
               `car-${carEvent.carId}`,
               carEvent
          );
     }

     async publishCarUpdated(carEvent) {
          return this.sendMessage(
               KAFKA_TOPICS.CAR_UPDATED,
               `car-${carEvent.carId}`,
               carEvent
          );
     }

     async publishTripScheduled(tripEvent) {
          return this.sendMessage(KAFKA_TOPICS.TRIP_SCHEDULED, `trip-${tripEvent.tripId}`, tripEvent);
     }

     async publishTripCancelled(event) {
          return this.sendMessage(
               KAFKA_TOPICS.TRIP_CANCELLED,
               `trip-${event.tripId}`,
               { ...event, timestamp: new Date().toISOString() }
          );
     }

     async publishCarStatusChanged(statusEvent) {
          return this.sendMessage(
               KAFKA_TOPICS.CAR_STATUS_CHANGED,
               `car-${statusEvent.carId}`,
               { ...statusEvent, timestamp: new Date().toISOString() }
          );
     }
}

module.exports = new AdminProducer();
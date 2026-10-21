const { kafka, consumer, producer, connectProducer } = require('../../config/kafka');
const logger = require('../../config/logger');
const { KAFKA_TOPICS } = require('../../../../shared/constants/kafka-topics');
const { withDLQ } = require('../../../../shared/utils/dlqHandler');
const { ensureTopics } = require('../../../../shared/utils/ensureTopics');
const inventoryService = require('../../services/inventory.service');
const tripService = require('../../services/trip.service');

class InventoryConsumer {
     async start() {
          await ensureTopics(kafka, logger);
          await consumer.connect();
          await connectProducer(); // needed for DLQ publishing
          logger.info('Inventory consumer connected');

          await consumer.subscribe({
               topics: [
                    KAFKA_TOPICS.CAR_CREATED,
                    KAFKA_TOPICS.CAR_UPDATED,
                    KAFKA_TOPICS.CAR_STATUS_CHANGED,
                    KAFKA_TOPICS.TRIP_SCHEDULED,
                    KAFKA_TOPICS.TRIP_CANCELLED,
               ],
               fromBeginning: true,
          });

          await consumer.run({
               eachMessage: withDLQ(producer, KAFKA_TOPICS.DLQ_INVENTORY, logger, async ({ topic, partition, message, parsedValue }) => {
                    logger.info(`Processing ${topic}`, {
                         partition,
                         offset: message.offset,
                    });

                    switch (topic) {
                         case KAFKA_TOPICS.CAR_CREATED:
                              await inventoryService.upsertCar(parsedValue, 'CAR_CREATED');
                              break;

                         case KAFKA_TOPICS.CAR_UPDATED:
                              await inventoryService.upsertCar(parsedValue, 'CAR_UPDATED');
                              break;

                         case KAFKA_TOPICS.CAR_STATUS_CHANGED:
                              await inventoryService.handleCarStatusChanged(parsedValue);
                              break;

                         case KAFKA_TOPICS.TRIP_SCHEDULED:
                              await tripService.upsertTrip(parsedValue);
                              break;

                         case KAFKA_TOPICS.TRIP_CANCELLED:
                              await tripService.markTripCancelled(parsedValue);
                              break;

                         default:
                              logger.warn(`Unhandled topic: ${topic}`);
                    }
               }),
          });

          logger.info('Inventory consumer running...');
     }
}

module.exports = new InventoryConsumer();

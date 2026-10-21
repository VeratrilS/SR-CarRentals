const { kafka, consumer, producer, connectProducer } = require('../../config/kafka');
const logger = require('../../config/logger');
const { KAFKA_TOPICS } = require('../../../../shared/constants/kafka-topics');
const { EventConsumer } = require('../../../../shared/utils/eventConsumer');
const inventoryService = require('../../services/inventory.service');
const tripService = require('../../services/trip.service');

class InventoryConsumer extends EventConsumer {
     // Observer: the events inventory-service reacts to, one handler each
     handlers() {
          return {
               [KAFKA_TOPICS.CAR_CREATED]: (event) => inventoryService.upsertCar(event, 'CAR_CREATED'),
               [KAFKA_TOPICS.CAR_UPDATED]: (event) => inventoryService.upsertCar(event, 'CAR_UPDATED'),
               [KAFKA_TOPICS.CAR_STATUS_CHANGED]: (event) => inventoryService.handleCarStatusChanged(event),
               [KAFKA_TOPICS.TRIP_SCHEDULED]: (event) => tripService.upsertTrip(event),
               [KAFKA_TOPICS.TRIP_CANCELLED]: (event) => tripService.markTripCancelled(event),
          };
     }
}

module.exports = new InventoryConsumer({
     name: 'Inventory',
     kafka, consumer, producer, connectProducer, logger,
     dlqTopic: KAFKA_TOPICS.DLQ_INVENTORY,
     fromBeginning: true,
});

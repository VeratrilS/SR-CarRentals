const { kafka, consumer, producer, connectProducer } = require('../../config/kafka');
const logger = require('../../config/logger');
const { KAFKA_TOPICS } = require('../../../../shared/constants/kafka-topics');
const { withDLQ } = require('../../../../shared/utils/dlqHandler');
const { ensureTopics } = require('../../../../shared/utils/ensureTopics');
const bookingService = require('../../services/booking.service');

const start = async () => {
     await ensureTopics(kafka, logger);
     await consumer.connect();
     await connectProducer(); // needed for DLQ publishing
     logger.info('Booking consumer connected');

     await consumer.subscribe({
          topics: [
               KAFKA_TOPICS.PAYMENT_SUCCESS,
               KAFKA_TOPICS.PAYMENT_FAILED,
               KAFKA_TOPICS.CAR_STATUS_CHANGED,
               KAFKA_TOPICS.TRIP_CANCELLED,
          ],
          fromBeginning: false,
     });

     await consumer.run({
          eachMessage: withDLQ(producer, KAFKA_TOPICS.DLQ_BOOKING, logger, async ({ topic, partition, message, parsedValue }) => {
               logger.info(`Received message on topic: ${topic}`, {
                    partition,
                    offset: message.offset,
                    key: message.key?.toString(),
               });

               switch (topic) {
                    case KAFKA_TOPICS.PAYMENT_SUCCESS:
                         await bookingService.handlePaymentSuccess(parsedValue.paymentOrderId);
                         break;

                    case KAFKA_TOPICS.PAYMENT_FAILED:
                         await bookingService.handlePaymentFailure(
                              parsedValue.paymentOrderId,
                              parsedValue.reason
                         );
                         break;

                    case KAFKA_TOPICS.CAR_STATUS_CHANGED:
                         if (parsedValue.status !== 'ACTIVE') {
                              await bookingService.handleCarDeactivated(parsedValue.carId, parsedValue.status);
                         }
                         break;

                    case KAFKA_TOPICS.TRIP_CANCELLED:
                         await bookingService.handleTripCancelled(parsedValue.tripId, parsedValue.reason);
                         break;

                    default:
                         logger.warn(`Unknown topic: ${topic}`);
               }
          }),
     });

     logger.info('Booking consumer running');
};

module.exports = { start };

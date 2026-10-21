const { kafka, consumer, producer, connectProducer } = require('../../config/kafka');
const logger = require('../../config/logger');
const { KAFKA_TOPICS } = require('../../../../shared/constants/kafka-topics');
const { EventConsumer } = require('../../../../shared/utils/eventConsumer');
const bookingService = require('../../services/booking.service');

class BookingConsumer extends EventConsumer {
     // Observer: the events booking-service reacts to, one handler each
     handlers() {
          return {
               [KAFKA_TOPICS.PAYMENT_SUCCESS]: (event) => bookingService.handlePaymentSuccess(event.paymentOrderId),
               [KAFKA_TOPICS.PAYMENT_FAILED]: (event) => bookingService.handlePaymentFailure(event.paymentOrderId, event.reason),
               [KAFKA_TOPICS.CAR_STATUS_CHANGED]: async (event) => {
                    if (event.status !== 'ACTIVE') {
                         await bookingService.handleCarDeactivated(event.carId, event.status);
                    }
               },
               [KAFKA_TOPICS.TRIP_CANCELLED]: (event) => bookingService.handleTripCancelled(event.tripId, event.reason),
          };
     }
}

module.exports = new BookingConsumer({
     name: 'Booking',
     kafka, consumer, producer, connectProducer, logger,
     dlqTopic: KAFKA_TOPICS.DLQ_BOOKING,
     fromBeginning: false,
});

const { kafka, consumer, producer, connectProducer } = require('../../config/kafka');
const emailService = require('../../services/email.service');
const logger = require('../../config/logger');
const { KAFKA_TOPICS } = require('../../../../shared/constants/kafka-topics');
const { EventConsumer } = require('../../../../shared/utils/eventConsumer');

class EmailConsumer extends EventConsumer {
     // Observer: one handler per event this service reacts to
     handlers() {
          return {
               [KAFKA_TOPICS.OTP_EMAIL]: (event) => this.handleOtpEmail(event),
               [KAFKA_TOPICS.WELCOME_EMAIL]: (event) => this.handleWelcomeEmail(event),
               [KAFKA_TOPICS.BOOKING_CONFIRMED]: (event) => this.handleBookingConfirmed(event),
               [KAFKA_TOPICS.BOOKING_FAILED]: (event) => this.handleBookingFailed(event),
               [KAFKA_TOPICS.BOOKING_CANCELLED]: (event) => this.handleBookingCancelled(event),
          };
     }

     async handleOtpEmail(data) {
          const { email, otp, ttlMinutes } = data;

          if (!email || !otp) {
               throw new Error('Missing required fields: email or otp');
          }

          await emailService.sendOtpEmail(email, otp, ttlMinutes || 5);
          logger.info(`OTP email sent to ${email}`);
     }

     async handleWelcomeEmail(data) {
          const { email, firstName } = data;

          if (!email || !firstName) {
               throw new Error('Missing required fields: email or firstName');
          }

          await emailService.sendWelcomeEmail(email, firstName);
          logger.info(`Welcome email sent to ${email}`);
     }

     async handleBookingConfirmed(data) {
          const { email, bookingId } = data;

          if (!email) {
               logger.warn(`Skipping booking-confirmed email — no email on event`, { bookingId });
               return;
          }

          await emailService.sendBookingConfirmedEmail(email, data);
          logger.info(`Booking confirmed email sent to ${email}`, { bookingId });
     }

     async handleBookingFailed(data) {
          const { email, bookingId } = data;

          if (!email) {
               logger.warn(`Skipping booking-failed email — no email on event`, { bookingId });
               return;
          }

          await emailService.sendBookingFailedEmail(email, data);
          logger.info(`Booking failed email sent to ${email}`, { bookingId });
     }

     async handleBookingCancelled(data) {
          const { email, bookingId } = data;

          if (!email) {
               logger.warn(`Skipping booking-cancelled email — no email on event`, { bookingId });
               return;
          }

          await emailService.sendBookingCancelledEmail(email, data);
          logger.info(`Booking cancelled email sent to ${email}`, { bookingId });
     }
}

module.exports = new EmailConsumer({
     name: 'Email',
     kafka, consumer, producer, connectProducer, logger,
     dlqTopic: KAFKA_TOPICS.DLQ_NOTIFICATION,
     fromBeginning: false,
});

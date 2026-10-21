/**
 * Centralized Kafka topic definitions.
 * Every service imports from here so topic names stay in sync.
 */
const KAFKA_TOPICS = {
     // Notification topics (user-service -> notification-service)
     OTP_EMAIL: 'notification.otp-email',
     WELCOME_EMAIL: 'notification.welcome-email',
     BOOKING_EMAIL: 'notification.booking-email',
     PAYMENT_EMAIL: 'notification.payment-email',

     // Admin topics (admin-service -> inventory/search/booking)
     BRANCH_CREATED: 'admin.branch-created',
     CAR_CREATED: 'admin.car-created',
     CAR_UPDATED: 'admin.car-updated',
     CAR_STATUS_CHANGED: 'admin.car-status-changed',

     // Shared rides (admin-service -> inventory/search/booking)
     TRIP_SCHEDULED: 'admin.trip-scheduled',
     TRIP_CANCELLED: 'admin.trip-cancelled',

     // Inventory topics (inventory-service -> search-service)
     CAR_AVAILABILITY_UPDATED: 'inventory.car-availability-updated',

     // Booking topics (booking-service -> notification-service)
     BOOKING_CONFIRMED: 'booking.confirmed',
     BOOKING_CANCELLED: 'booking.cancelled',
     BOOKING_FAILED: 'booking.failed',

     // Payment topics (payment-service -> booking-service)
     PAYMENT_SUCCESS: 'payment.success',
     PAYMENT_FAILED: 'payment.failed',

     // Dead-letter queues (per service — poison messages land here)
     DLQ_BOOKING: 'dlq.booking-service',
     DLQ_INVENTORY: 'dlq.inventory-service',
     DLQ_SEARCH: 'dlq.search-service',
     DLQ_NOTIFICATION: 'dlq.notification-service',
};

/**
 * Max retries before a consumer message is sent to the DLQ.
 * After this many failures the message is considered poison.
 */
const DLQ_MAX_RETRIES = 3;

module.exports = { KAFKA_TOPICS, DLQ_MAX_RETRIES };

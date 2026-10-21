const { inventoryClient } = require('./inventoryClient');

/**
 * One place that knows how to talk to inventory for each booking type,
 * so the saga, expiry job and cancellation flows stay type-agnostic.
 *
 *   RENTAL → a hold on the whole car for [pickupAt, dropoffAt)
 *   SEAT   → holds on specific seats of a trip for stops [fromSeq, toSeq)
 */
const isSeat = (booking) => booking.type === 'SEAT';

const placeHold = (booking, ttlSeconds) => (isSeat(booking)
     ? inventoryClient.holdTripSeats(booking.tripId, booking.id, booking.seatNumbers, booking.fromSeq, booking.toSeq, booking.userId, ttlSeconds)
     : inventoryClient.holdCar(booking.carId, booking.id, booking.pickupAt, booking.dropoffAt, booking.userId, ttlSeconds));

/** Unpaid hold → released. */
const releaseHold = (booking) => (isSeat(booking)
     ? inventoryClient.releaseTripSeats(booking.tripId, booking.id)
     : inventoryClient.releaseCar(booking.carId, booking.id, booking.userId));

/** Hold → confirmed reservation (after payment). */
const confirmHold = (booking) => (isSeat(booking)
     ? inventoryClient.confirmTripSeats(booking.tripId, booking.id, booking.userId)
     : inventoryClient.confirmCar(booking.carId, booking.id, booking.userId));

/** Confirmed reservation → released (cancellation). */
const cancelReservation = (booking) => (isSeat(booking)
     ? inventoryClient.cancelTripSeatBooking(booking.tripId, booking.id)
     : inventoryClient.cancelBooking(booking.carId, booking.id));

const holdStep = (booking) => (isSeat(booking) ? 'HOLD_SEATS' : 'HOLD_CAR');
const confirmStep = (booking) => (isSeat(booking) ? 'CONFIRM_SEATS' : 'CONFIRM_CAR');

module.exports = { isSeat, placeHold, releaseHold, confirmHold, cancelReservation, holdStep, confirmStep };

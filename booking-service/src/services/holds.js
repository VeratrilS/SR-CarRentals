const { inventoryClient } = require('./inventoryClient');

/**
 * Strategy pattern: one strategy per booking type, each knowing how to talk to
 * inventory for that type. The saga, expiry job and cancellation flows only call
 * strategyFor(booking).x(), so they stay type-agnostic — a third booking type
 * means one new strategy object, not another `if` in every flow.
 *
 *   RENTAL → a hold on the whole car for [pickupAt, dropoffAt)
 *   SEAT   → holds on specific seats of a trip for stops [fromSeq, toSeq)
 */
const RentalStrategy = Object.freeze({
     holdStep: 'HOLD_CAR',
     confirmStep: 'CONFIRM_CAR',
     holdRequest: (b, ttlSeconds) => ({ carId: b.carId, pickupAt: b.pickupAt, dropoffAt: b.dropoffAt, ttlSeconds }),
     placeHold: (b, ttlSeconds) => inventoryClient.holdCar(b.carId, b.id, b.pickupAt, b.dropoffAt, b.userId, ttlSeconds),
     releaseHold: (b) => inventoryClient.releaseCar(b.carId, b.id, b.userId),
     confirmHold: (b) => inventoryClient.confirmCar(b.carId, b.id, b.userId),
     cancelReservation: (b) => inventoryClient.cancelBooking(b.carId, b.id),
});

const SeatStrategy = Object.freeze({
     holdStep: 'HOLD_SEATS',
     confirmStep: 'CONFIRM_SEATS',
     holdRequest: (b, ttlSeconds) => ({ tripId: b.tripId, seatNumbers: b.seatNumbers, fromSeq: b.fromSeq, toSeq: b.toSeq, ttlSeconds }),
     placeHold: (b, ttlSeconds) => inventoryClient.holdTripSeats(b.tripId, b.id, b.seatNumbers, b.fromSeq, b.toSeq, b.userId, ttlSeconds),
     releaseHold: (b) => inventoryClient.releaseTripSeats(b.tripId, b.id),
     confirmHold: (b) => inventoryClient.confirmTripSeats(b.tripId, b.id, b.userId),
     cancelReservation: (b) => inventoryClient.cancelTripSeatBooking(b.tripId, b.id),
});

const STRATEGIES = { RENTAL: RentalStrategy, SEAT: SeatStrategy };

const strategyFor = (booking) => STRATEGIES[booking.type] || RentalStrategy;

const isSeat = (booking) => booking.type === 'SEAT';

/** Unpaid hold placed for the payment window. */
const placeHold = (booking, ttlSeconds) => strategyFor(booking).placeHold(booking, ttlSeconds);
/** Unpaid hold → released. */
const releaseHold = (booking) => strategyFor(booking).releaseHold(booking);
/** Hold → confirmed reservation (after payment). */
const confirmHold = (booking) => strategyFor(booking).confirmHold(booking);
/** Confirmed reservation → released (cancellation). */
const cancelReservation = (booking) => strategyFor(booking).cancelReservation(booking);

const holdStep = (booking) => strategyFor(booking).holdStep;
const confirmStep = (booking) => strategyFor(booking).confirmStep;

module.exports = { strategyFor, isSeat, placeHold, releaseHold, confirmHold, cancelReservation, holdStep, confirmStep };

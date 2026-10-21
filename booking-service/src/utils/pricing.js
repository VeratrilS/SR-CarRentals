/**
 * Rental pricing and cancellation policy — pure functions, no I/O.
 *
 *   rentalDays  = ceil((hours − grace) / 24), min 1  (every started 24h block is billed,
 *                 after a GRACE_MINUTES late-return allowance)
 *   baseAmount  = rentalDays × dailyRate
 *   discount    = LONG_RENTAL_DISCOUNT_PCT of base when rentalDays ≥ LONG_RENTAL_MIN_DAYS
 *   All amounts are whole rupees.
 *
 * Cancellation of a confirmed booking:
 *   ≥ FREE_CANCELLATION_HOURS before pickup → full refund
 *   less than that, but before pickup        → LATE_CANCELLATION_REFUND_PCT refund
 *   after pickup                             → not cancellable
 */

const HOUR_MS = 60 * 60 * 1000;
const GRACE_MINUTES = 30;

const LONG_RENTAL_MIN_DAYS = 7;
const LONG_RENTAL_DISCOUNT_PCT = 10;
const FREE_CANCELLATION_HOURS = 24;
const LATE_CANCELLATION_REFUND_PCT = 50;

const MIN_LEAD_TIME_HOURS = 1;     // pickup must be at least 1h from now
const MAX_ADVANCE_DAYS = 180;      // cannot book more than 6 months ahead
const MAX_RENTAL_DAYS = 30;
const MIN_DRIVER_AGE = 18;
const MIN_DRIVER_AGE_LUXURY = 25;

const rupees = (n) => Math.round(n);

function calculatePrice(dailyRate, pickupAt, dropoffAt) {
     const hours = (dropoffAt.getTime() - pickupAt.getTime()) / HOUR_MS - GRACE_MINUTES / 60;
     const rentalDays = Math.max(1, Math.ceil(hours / 24));
     const baseAmount = rupees(rentalDays * dailyRate);
     const discountAmount = rentalDays >= LONG_RENTAL_MIN_DAYS
          ? rupees(baseAmount * LONG_RENTAL_DISCOUNT_PCT / 100)
          : 0;

     return {
          rentalDays,
          dailyRate,
          baseAmount,
          discountAmount,
          totalAmount: baseAmount - discountAmount,
     };
}

/**
 * Returns null if the window is valid, otherwise a human-readable reason.
 */
/**
 * Shared-ride fare: distance travelled × the trip's per-km rate, per seat,
 * with a minimum fare for very short hops. Whole rupees.
 */
const MIN_SEAT_FARE = 100;

function calculateSeatFare(farePerKm, fromKm, toKm, seatCount) {
     const distanceKm = Math.max(0, toKm - fromKm);
     const seatFare = Math.max(MIN_SEAT_FARE, rupees(distanceKm * farePerKm));
     const total = seatFare * seatCount;
     return { distanceKm, seatFare, seatCount, baseAmount: total, discountAmount: 0, totalAmount: total };
}

function validateRentalWindow(pickupAt, dropoffAt, now = new Date()) {
     if (isNaN(pickupAt.getTime()) || isNaN(dropoffAt.getTime())) {
          return 'pickupAt and dropoffAt must be valid ISO date-times';
     }
     if (dropoffAt <= pickupAt) {
          return 'Drop-off must be after pickup';
     }
     if (pickupAt.getTime() < now.getTime() + MIN_LEAD_TIME_HOURS * HOUR_MS) {
          return `Pickup must be at least ${MIN_LEAD_TIME_HOURS} hour(s) from now`;
     }
     if (pickupAt.getTime() > now.getTime() + MAX_ADVANCE_DAYS * 24 * HOUR_MS) {
          return `Bookings can be made at most ${MAX_ADVANCE_DAYS} days in advance`;
     }
     if (dropoffAt.getTime() - pickupAt.getTime() > MAX_RENTAL_DAYS * 24 * HOUR_MS) {
          return `Maximum rental duration is ${MAX_RENTAL_DAYS} days`;
     }
     return null;
}

function minDriverAge(category) {
     return category === 'LUXURY' ? MIN_DRIVER_AGE_LUXURY : MIN_DRIVER_AGE;
}

/**
 * How much of a confirmed booking is refunded if cancelled at `now`.
 * Returns { refundable: boolean, refundAmount, policy }.
 */
function calculateRefund(totalAmount, pickupAt, now = new Date()) {
     const hoursToPickup = (pickupAt.getTime() - now.getTime()) / HOUR_MS;

     if (hoursToPickup <= 0) {
          return { refundable: false, refundAmount: 0, policy: 'rental_started' };
     }
     if (hoursToPickup >= FREE_CANCELLATION_HOURS) {
          return { refundable: true, refundAmount: rupees(totalAmount), policy: 'full_refund' };
     }
     return {
          refundable: true,
          refundAmount: rupees(totalAmount * LATE_CANCELLATION_REFUND_PCT / 100),
          policy: 'late_cancellation',
     };
}

module.exports = {
     calculatePrice,
     calculateSeatFare,
     validateRentalWindow,
     minDriverAge,
     calculateRefund,
     GRACE_MINUTES,
     LONG_RENTAL_MIN_DAYS,
     LONG_RENTAL_DISCOUNT_PCT,
     FREE_CANCELLATION_HOURS,
     LATE_CANCELLATION_REFUND_PCT,
};

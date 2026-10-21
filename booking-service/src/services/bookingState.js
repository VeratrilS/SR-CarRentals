const prisma = require('../config/prisma');
const { StaleStateError } = require('../utils/error');

/**
 * State pattern (table-driven): the whole booking lifecycle in one table.
 *
 *   PENDING ──hold──▶ CAR_HELD ──order──▶ PAYMENT_PENDING ──paid──▶ CONFIRMING ──▶ CONFIRMED
 *      │                 │                      │                       │              │
 *      └─────────────────┴──────────────────────┴──▶ FAILED / EXPIRED   └──▶ FAILED    ├──▶ CANCELLING ──▶ CANCELLED
 *                                                                                      └──▶ CANCELLED (car/trip withdrawn)
 *
 * Several processes race on the same booking: the saga creating it, the payment
 * webhook, the expiry job, a user cancelling, an admin withdrawing the car.
 * Every status change therefore goes through transition(), which writes ONLY if
 * the booking is still in a state allowed to move — check and write are one
 * atomic UPDATE ... WHERE status IN (...) in Postgres, so exactly one racer wins.
 */
const TRANSITIONS = Object.freeze({
     PENDING:         ['CAR_HELD', 'FAILED', 'EXPIRED', 'CANCELLING', 'CANCELLED'],
     CAR_HELD:        ['PAYMENT_PENDING', 'FAILED', 'EXPIRED', 'CANCELLING', 'CANCELLED'],
     PAYMENT_PENDING: ['CONFIRMING', 'FAILED', 'EXPIRED', 'CANCELLING', 'CANCELLED'],
     CONFIRMING:      ['CONFIRMED', 'FAILED'],
     CONFIRMED:       ['CANCELLING', 'CANCELLED'],
     CANCELLING:      ['CANCELLED', 'CONFIRMED'], // back to CONFIRMED if inventory release fails
     FAILED:          [],
     CANCELLED:       [],
     EXPIRED:         [],
});

/** Bookings that still hold (or are about to hold) a car or seats */
const ACTIVE_STATUSES = ['PENDING', 'CAR_HELD', 'PAYMENT_PENDING', 'CONFIRMED'];
/** Not yet paid — these time out if payment never arrives */
const UNPAID_STATUSES = ['PENDING', 'CAR_HELD', 'PAYMENT_PENDING'];

const canTransition = (from, to) => TRANSITIONS[from]?.includes(to) ?? false;
const isTerminal = (status) => TRANSITIONS[status]?.length === 0;

/**
 * Move a booking to `to` if it is still in one of `from` (and at `version`, if given).
 * @returns {Promise<boolean>} true if this caller won the transition
 */
async function transition(bookingId, to, { from, version, data = {} }) {
     const sources = [].concat(from);
     const illegal = sources.filter((s) => !canTransition(s, to));
     if (illegal.length) {
          // A programming error, not a race: the table forbids this move
          throw new Error(`Illegal booking transition ${illegal.join('|')} → ${to}`);
     }

     const result = await prisma.booking.updateMany({
          where: { id: bookingId, status: { in: sources }, ...(version !== undefined && { version }) },
          data: { ...data, status: to, version: { increment: 1 } },
     });
     return result.count === 1;
}

/** Same as transition(), but losing the race is an error (StaleStateError) */
async function transitionOrThrow(bookingId, to, options) {
     const moved = await transition(bookingId, to, options);
     if (!moved) {
          throw new StaleStateError(`Booking ${bookingId} was changed by another process before it could become ${to}`);
     }
}

module.exports = {
     TRANSITIONS,
     ACTIVE_STATUSES,
     UNPAID_STATUSES,
     canTransition,
     isTerminal,
     transition,
     transitionOrThrow,
};

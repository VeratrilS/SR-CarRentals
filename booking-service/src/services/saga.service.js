const prisma = require('../config/prisma');
const logger = require('../config/logger');
const { paymentClient } = require('./paymentClient');
const holds = require('./holds');

/**
 * Saga orchestrator for the booking lifecycle (rentals and seat bookings alike).
 * Each step is logged to SagaLog for auditability and crash recovery.
 *
 * Forward flow:  HOLD (car | seats) -> CREATE_PAYMENT -> CONFIRM (car | seats)
 * Compensation:  reverse order of completed steps
 */

async function runStep(booking, step, request, action) {
     const sagaLog = await prisma.sagaLog.create({
          data: { bookingId: booking.id, step, status: 'PENDING', request },
     });

     try {
          const result = await action();
          await prisma.sagaLog.update({
               where: { id: sagaLog.id },
               data: { status: 'COMPLETED', response: result ?? {} },
          });
          logger.info(`Saga ${step} completed for booking ${booking.id}`);
          return result;
     } catch (error) {
          const errorMsg = error.response?.data?.message || error.message;
          await prisma.sagaLog.update({
               where: { id: sagaLog.id },
               data: { status: 'FAILED', error: errorMsg },
          });
          throw error;
     }
}

// ─── Forward Steps ───────────────────────────────────────────────────────────

async function executeHold(booking, ttlSeconds) {
     const result = await runStep(
          booking,
          holds.holdStep(booking),
          holds.isSeat(booking)
               ? { tripId: booking.tripId, seatNumbers: booking.seatNumbers, fromSeq: booking.fromSeq, toSeq: booking.toSeq, ttlSeconds }
               : { carId: booking.carId, pickupAt: booking.pickupAt, dropoffAt: booking.dropoffAt, ttlSeconds },
          () => holds.placeHold(booking, ttlSeconds)
     );

     await prisma.booking.update({ where: { id: booking.id }, data: { status: 'CAR_HELD' } });
     return result;
}

async function executeCreatePayment(booking) {
     const result = await runStep(
          booking,
          'CREATE_PAYMENT',
          { bookingId: booking.id, amount: booking.totalAmount, userId: booking.userId },
          () => paymentClient.createPaymentOrder(booking.id, booking.totalAmount, booking.userId, `${booking.id}-payment`)
     );

     await prisma.booking.update({
          where: { id: booking.id },
          data: { status: 'PAYMENT_PENDING', paymentOrderId: result.paymentOrderId },
     });
     return result;
}

async function executeConfirm(booking) {
     return runStep(
          booking,
          holds.confirmStep(booking),
          { bookingId: booking.id, userId: booking.userId },
          () => holds.confirmHold(booking)
     );
}

// ─── Compensation Steps ──────────────────────────────────────────────────────

async function markCompensated(booking, step) {
     await prisma.sagaLog.updateMany({
          where: { bookingId: booking.id, step, status: 'COMPLETED' },
          data: { status: 'COMPENSATED' },
     });
}

async function compensateHold(booking) {
     logger.info(`Compensating hold for booking ${booking.id}`);
     try {
          await holds.releaseHold(booking);
          await markCompensated(booking, holds.holdStep(booking));
     } catch (error) {
          // Inventory lock expiry will eventually clean this up
          logger.error(`Failed to compensate hold for booking ${booking.id}`, { error: error.message });
     }
}

async function compensateCreatePayment(booking) {
     if (!booking.paymentOrderId) return;

     logger.info(`Compensating CREATE_PAYMENT for booking ${booking.id}`);
     try {
          await paymentClient.initiateRefund(
               booking.paymentOrderId,
               booking.totalAmount,
               'booking_compensation',
               `${booking.id}-refund-compensation`
          );
          await markCompensated(booking, 'CREATE_PAYMENT');
     } catch (error) {
          logger.error(`Failed to compensate CREATE_PAYMENT for booking ${booking.id}`, { error: error.message });
     }
}

async function compensateConfirm(booking) {
     logger.info(`Compensating confirmation for booking ${booking.id}`);
     try {
          await holds.cancelReservation(booking);
          await markCompensated(booking, holds.confirmStep(booking));
     } catch (error) {
          logger.error(`Failed to compensate confirmation for booking ${booking.id}`, { error: error.message });
     }
}

/**
 * Compensate all completed saga steps in reverse order.
 * Used when a booking needs to be rolled back (failure, timeout, cancellation).
 */
async function compensateAll(booking) {
     const completedSteps = await prisma.sagaLog.findMany({
          where: { bookingId: booking.id, status: 'COMPLETED' },
          orderBy: { createdAt: 'desc' },
     });

     for (const step of completedSteps) {
          switch (step.step) {
               case 'CONFIRM_CAR':
               case 'CONFIRM_SEATS':
                    await compensateConfirm(booking);
                    break;
               case 'CREATE_PAYMENT':
                    await compensateCreatePayment(booking);
                    break;
               case 'HOLD_CAR':
               case 'HOLD_SEATS':
                    await compensateHold(booking);
                    break;
          }
     }
}

module.exports = {
     executeHold,
     executeCreatePayment,
     executeConfirm,
     compensateHold,
     compensateCreatePayment,
     compensateConfirm,
     compensateAll,
};

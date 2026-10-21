const prisma = require('../config/prisma');
const logger = require('../config/logger');
const { paymentClient } = require('./paymentClient');
const holds = require('./holds');
const { transitionOrThrow } = require('./bookingState');

/**
 * Saga orchestrator for the booking lifecycle (rentals and seat bookings alike).
 * Each step is logged to SagaLog for auditability and crash recovery.
 *
 * Forward flow:  HOLD (car | seats) -> CREATE_PAYMENT -> CONFIRM (car | seats)
 * Compensation:  reverse order of completed steps
 *
 * Command pattern: every step is an object with
 *   name(booking)        → the SagaLog step name
 *   request(booking,…)   → what gets logged as the step's input
 *   execute(booking,…)   → do the work in another service
 *   compensate(booking)  → undo it
 * so the orchestrator can run and undo any step without knowing what it does.
 */

const HoldCommand = {
     name: (booking) => holds.holdStep(booking),
     request: (booking, ttlSeconds) => holds.strategyFor(booking).holdRequest(booking, ttlSeconds),
     execute: (booking, ttlSeconds) => holds.placeHold(booking, ttlSeconds),
     compensate: (booking) => holds.releaseHold(booking),
};

const CreatePaymentCommand = {
     name: () => 'CREATE_PAYMENT',
     request: (booking) => ({ bookingId: booking.id, amount: booking.totalAmount, userId: booking.userId }),
     execute: (booking) => paymentClient.createPaymentOrder(booking.id, booking.totalAmount, booking.userId, `${booking.id}-payment`),
     compensate: async (booking) => {
          if (!booking.paymentOrderId) return;
          await paymentClient.initiateRefund(
               booking.paymentOrderId,
               booking.totalAmount,
               'booking_compensation',
               `${booking.id}-refund-compensation`
          );
     },
};

const ConfirmCommand = {
     name: (booking) => holds.confirmStep(booking),
     request: (booking) => ({ bookingId: booking.id, userId: booking.userId }),
     execute: (booking) => holds.confirmHold(booking),
     compensate: (booking) => holds.cancelReservation(booking),
};

/** SagaLog step name → the command that can undo it */
const COMMANDS_BY_STEP = {
     HOLD_CAR: HoldCommand,
     HOLD_SEATS: HoldCommand,
     CREATE_PAYMENT: CreatePaymentCommand,
     CONFIRM_CAR: ConfirmCommand,
     CONFIRM_SEATS: ConfirmCommand,
};

// ─── Invoker ─────────────────────────────────────────────────────────────────

async function runStep(command, booking, ...args) {
     const step = command.name(booking);
     const sagaLog = await prisma.sagaLog.create({
          data: { bookingId: booking.id, step, status: 'PENDING', request: command.request(booking, ...args) },
     });

     try {
          const result = await command.execute(booking, ...args);
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

async function undoStep(command, booking) {
     const step = command.name(booking);
     logger.info(`Compensating ${step} for booking ${booking.id}`);
     try {
          await command.compensate(booking);
          await prisma.sagaLog.updateMany({
               where: { bookingId: booking.id, step, status: 'COMPLETED' },
               data: { status: 'COMPENSATED' },
          });
     } catch (error) {
          // Inventory lock expiry / payment reconciliation will eventually clean this up
          logger.error(`Failed to compensate ${step} for booking ${booking.id}`, { error: error.message });
     }
}

// ─── Forward Steps ───────────────────────────────────────────────────────────
// Each forward step also moves the booking one state ahead. If the booking was
// cancelled/expired while the step ran, the transition loses the race and throws,
// so the caller compensates instead of resurrecting a cancelled booking.

async function executeHold(booking, ttlSeconds) {
     const result = await runStep(HoldCommand, booking, ttlSeconds);
     await transitionOrThrow(booking.id, 'CAR_HELD', { from: 'PENDING' });
     return result;
}

async function executeCreatePayment(booking) {
     const result = await runStep(CreatePaymentCommand, booking);
     await transitionOrThrow(booking.id, 'PAYMENT_PENDING', {
          from: 'CAR_HELD',
          data: { paymentOrderId: result.paymentOrderId },
     });
     return result;
}

async function executeConfirm(booking) {
     return runStep(ConfirmCommand, booking);
}

// ─── Compensation Steps ──────────────────────────────────────────────────────

const compensateHold = (booking) => undoStep(HoldCommand, booking);
const compensateCreatePayment = (booking) => undoStep(CreatePaymentCommand, booking);
const compensateConfirm = (booking) => undoStep(ConfirmCommand, booking);

/**
 * Compensate all completed saga steps in reverse order.
 * Used when a booking needs to be rolled back (failure, timeout, cancellation).
 */
async function compensateAll(booking) {
     const completedSteps = await prisma.sagaLog.findMany({
          where: { bookingId: booking.id, status: 'COMPLETED' },
          orderBy: { createdAt: 'desc' },
     });

     for (const { step } of completedSteps) {
          const command = COMMANDS_BY_STEP[step];
          if (command) await undoStep(command, booking);
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

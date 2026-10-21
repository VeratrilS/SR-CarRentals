const prisma = require('../config/prisma');
const logger = require('../config/logger');
const { config } = require('../config');
const { inventoryClient } = require('./inventoryClient');
const { paymentClient } = require('./paymentClient');
const { userClient } = require('./userClient');
const { acquireCarLock, releaseCarLock, forceReleaseBookingLock, acquireKeys, releaseKeys, tripSeatLockKeys } = require('../utils/distributedLock');
const { calculatePrice, validateRentalWindow, minDriverAge, calculateRefund, calculateSeatFare } = require('../utils/pricing');
const holds = require('./holds');
const saga = require('./saga.service');
const bookingProducer = require('../kafka/producer/booking.producer');
const { BadRequestError, NotFoundError, ConflictError } = require('../utils/error');
const { TRANSITIONS, ACTIVE_STATUSES, UNPAID_STATUSES, canTransition, isTerminal, transition, transitionOrThrow } = require('./bookingState');

// ─── Optimistic Lock Helper (CAS — Compare-And-Swap) ────────────────────────
// Moves the booking to `to` ONLY IF neither its status nor its version changed
// since we read it (and the state machine allows the move).
// Throws StaleStateError if another process got there first.

const casUpdateBooking = (booking, to, data = {}) =>
     transitionOrThrow(booking.id, to, { from: booking.status, version: booking.version, data });

// ─── Notification Helpers ────────────────────────────────────────────────────
// Looks up the user so booking events can carry email/firstName directly.
// Failures here must never break the booking workflow — log and return {}.

const fetchUserForNotification = async (userId) => {
     try {
          const user = await userClient.getUserById(userId);
          return user ? { email: user.email, firstName: user.firstName } : {};
     } catch (err) {
          logger.warn('Failed to enrich booking event with user details', {
               userId,
               error: err.message,
          });
          return {};
     }
};

const toEventPayload = (booking, userInfo) => ({
     bookingId: booking.id,
     type: booking.type,
     userId: booking.userId,
     email: userInfo.email,
     firstName: userInfo.firstName,
     carId: booking.carId,
     carName: booking.carName,
     registrationNumber: booking.registrationNumber,
     category: booking.category,
     branchName: booking.branchName,
     city: booking.city,
     pickupAt: booking.pickupAt,
     dropoffAt: booking.dropoffAt,
     rentalDays: booking.rentalDays,
     dailyRate: booking.dailyRate,
     baseAmount: booking.baseAmount,
     discountAmount: booking.discountAmount,
     totalAmount: booking.totalAmount,
     driverName: booking.driverName,
     // shared rides
     tripId: booking.tripId,
     routeName: booking.routeName,
     fromStopName: booking.fromStopName,
     toStopName: booking.toStopName,
     seatNumbers: booking.seatNumbers,
     seatFare: booking.seatFare,
     passengers: booking.passengers,
});

// ─── Idempotency Helper ──────────────────────────────────────────────────────

const checkIdempotency = async (key) => {
     const existing = await prisma.idempotencyRecord.findUnique({ where: { eventKey: key } });
     if (existing) {
          logger.info(`Idempotent request: ${key}`);
          return existing.response;
     }
     return null;
};

const saveIdempotency = async (key, response) => {
     await prisma.idempotencyRecord.create({
          data: { eventKey: key, response },
     });
};

// booking.idempotencyKey is unique: the key was already used by an earlier attempt
// that failed (successful ones are answered from the cache above), or by someone else
const rethrowDuplicateKey = (err) => {
     if (err.code === 'P2002') {
          throw new ConflictError('This booking request was already used. Please start a new booking.', 'DUPLICATE_REQUEST');
     }
     throw err;
};

// ─── Validation ──────────────────────────────────────────────────────────────

const validateDriver = (driver, category) => {
     if (!driver || typeof driver !== 'object') {
          throw new BadRequestError('driver details are required');
     }
     const { name, age, licenseNumber, phone } = driver;
     if (!name || !age || !licenseNumber || !phone) {
          throw new BadRequestError('driver.name, driver.age, driver.licenseNumber and driver.phone are required');
     }
     const minAge = minDriverAge(category);
     if (!Number.isInteger(Number(age)) || Number(age) < minAge || Number(age) > 80) {
          throw new BadRequestError(`Driver must be between ${minAge} and 80 years old for a ${category} car`);
     }
     if (!/^[A-Z0-9-]{8,20}$/i.test(String(licenseNumber).replace(/\s+/g, ''))) {
          throw new BadRequestError('driver.licenseNumber looks invalid');
     }
     if (!/^\+?[0-9]{10,13}$/.test(String(phone).replace(/[\s-]+/g, ''))) {
          throw new BadRequestError('driver.phone must be a valid 10–13 digit number');
     }
};

// ─── Quote (price preview, no side effects) ─────────────────────────────────

const getQuote = async (carId, pickupAtRaw, dropoffAtRaw) => {
     const pickupAt = new Date(pickupAtRaw);
     const dropoffAt = new Date(dropoffAtRaw);

     const windowError = validateRentalWindow(pickupAt, dropoffAt);
     if (windowError) throw new BadRequestError(windowError);

     const availability = await inventoryClient.getAvailability(carId, pickupAt, dropoffAt);

     return {
          carId,
          carName: `${availability.make} ${availability.model}`,
          category: availability.category,
          branchName: availability.branchName,
          city: availability.city,
          pickupAt,
          dropoffAt,
          available: availability.requested?.available ?? false,
          minDriverAge: minDriverAge(availability.category),
          ...calculatePrice(availability.dailyRate, pickupAt, dropoffAt),
     };
};

// ─── Create Booking ──────────────────────────────────────────────────────────

const createBooking = async (userId, carId, pickupAtRaw, dropoffAtRaw, driver, idempotencyKey) => {
     // 1. Validate input
     if (!carId || !pickupAtRaw || !dropoffAtRaw) {
          throw new BadRequestError('carId, pickupAt and dropoffAt are required');
     }
     if (!idempotencyKey) {
          throw new BadRequestError('idempotencyKey is required');
     }

     const pickupAt = new Date(pickupAtRaw);
     const dropoffAt = new Date(dropoffAtRaw);
     const windowError = validateRentalWindow(pickupAt, dropoffAt);
     if (windowError) throw new BadRequestError(windowError);

     // 2. Check idempotency
     const cached = await checkIdempotency(`booking:${userId}:${idempotencyKey}`);
     if (cached) return cached;

     // 3. Fetch the car and check the window is free (fast fail — inventory re-checks under lock)
     const car = await inventoryClient.getAvailability(carId, pickupAt, dropoffAt);
     if (car.status !== 'ACTIVE') {
          throw new BadRequestError('This car is not available for rent right now');
     }
     if (!car.requested?.available) {
          throw new ConflictError('This car is already reserved for part of the selected period', 'CAR_UNAVAILABLE');
     }

     validateDriver(driver, car.category);
     const price = calculatePrice(car.dailyRate, pickupAt, dropoffAt);

     // 4. Acquire Redis distributed lock for this car + window
     const { acquired, lockValue } = await acquireCarLock(
          carId,
          pickupAt,
          dropoffAt,
          `pre-${Date.now()}`, // temporary owner before booking is created
          config.BOOKING_TTL_SECONDS
     );

     if (!acquired) {
          throw new ConflictError(
               'Someone else is booking this car for the same dates. Please try again.',
               'CAR_LOCKED'
          );
     }

     let booking;
     try {
          // 5. Create booking record in DB
          const lockExpiresAt = new Date(Date.now() + config.BOOKING_TTL_SECONDS * 1000);

          booking = await prisma.booking.create({
               data: {
                    userId,
                    carId,
                    registrationNumber: car.registrationNumber,
                    carName: `${car.make} ${car.model}`,
                    category: car.category,
                    branchId: car.branchId,
                    branchName: car.branchName,
                    city: car.city,
                    pickupAt,
                    dropoffAt,
                    status: 'PENDING',
                    ...price,
                    driverName: driver.name.trim(),
                    driverAge: Number(driver.age),
                    driverLicenseNumber: String(driver.licenseNumber).replace(/\s+/g, '').toUpperCase(),
                    driverPhone: String(driver.phone).replace(/[\s-]+/g, ''),
                    idempotencyKey,
                    lockExpiresAt,
               },
          }).catch(rethrowDuplicateKey);

          // 6. Saga Step 1: hold the car in inventory
          await saga.executeHold(booking, config.LOCK_TTL_SECONDS);

          // 7. Saga Step 2: create payment order
          const paymentOrder = await saga.executeCreatePayment(booking);

          booking = await prisma.booking.findUnique({ where: { id: booking.id } });

          // 8. Save idempotency
          const response = {
               bookingId: booking.id,
               status: booking.status,
               carName: booking.carName,
               pickupAt: booking.pickupAt,
               dropoffAt: booking.dropoffAt,
               rentalDays: booking.rentalDays,
               baseAmount: booking.baseAmount,
               discountAmount: booking.discountAmount,
               totalAmount: booking.totalAmount,
               lockExpiresAt: booking.lockExpiresAt,
               paymentOrder: {
                    paymentOrderId: paymentOrder.paymentOrderId,
                    gatewayOrderId: paymentOrder.gatewayOrderId,
                    amount: paymentOrder.amount,
                    currency: paymentOrder.currency,
                    keyId: paymentOrder.keyId,
               },
          };

          await saveIdempotency(`booking:${userId}:${idempotencyKey}`, response);

          return response;

     } catch (error) {
          // Compensate on failure
          logger.error(`Booking creation failed for user ${userId}`, { error: error.message });

          if (booking) {
               await saga.compensateAll(booking);
               // Only if still unpaid — a booking cancelled meanwhile stays CANCELLED
               await transition(booking.id, 'FAILED', {
                    from: UNPAID_STATUSES,
                    data: { failureReason: error.response?.data?.message || error.message },
               });
          }

          await releaseCarLock(carId, pickupAt, dropoffAt, lockValue);

          throw error;
     }
};

// ─── Handle Payment Success (Kafka consumer) ─────────────────────────────────

const handlePaymentSuccess = async (paymentOrderId) => {
     const booking = await prisma.booking.findUnique({ where: { paymentOrderId } });

     if (!booking) {
          logger.warn(`No booking found for paymentOrderId: ${paymentOrderId}`);
          return;
     }

     // Idempotent: already confirmed
     if (booking.status === 'CONFIRMED') {
          logger.info(`Booking ${booking.id} already confirmed`);
          return;
     }

     // Payment landed after the booking expired / was cancelled — the customer was
     // charged for a car they no longer hold, so refund it in full.
     if (isTerminal(booking.status)) {
          logger.warn(`Late payment for ${booking.status} booking ${booking.id} — refunding`);
          try {
               await paymentClient.initiateRefund(
                    paymentOrderId,
                    booking.totalAmount,
                    'late_payment',
                    `${booking.id}-late-payment-refund`
               );
          } catch (err) {
               logger.error(`Failed to refund late payment for booking ${booking.id}`, { error: err.message });
               throw err; // let the consumer retry / DLQ — money must not be kept silently
          }
          return;
     }

     if (booking.status !== 'PAYMENT_PENDING') {
          logger.warn(`Booking ${booking.id} in unexpected status: ${booking.status}`);
          return;
     }

     try {
          // Atomically claim this booking — if expiry job or cancel already changed it, bail out
          await casUpdateBooking(booking, 'CONFIRMING');

          // Saga Step 3: confirm the hold in inventory
          await saga.executeConfirm(booking);

          await transition(booking.id, 'CONFIRMED', { from: 'CONFIRMING', data: { lockExpiresAt: null } });

          await forceReleaseBookingLock(booking);

          // Publish BOOKING_CONFIRMED (retried by producer — log but don't fail the booking)
          try {
               const userInfo = await fetchUserForNotification(booking.userId);
               await bookingProducer.publishBookingConfirmed(toEventPayload(booking, userInfo));
          } catch (err) {
               logger.error('CRITICAL: Failed to publish BOOKING_CONFIRMED after retries — notification may be missed', {
                    bookingId: booking.id,
                    error: err.message,
               });
          }

          logger.info(`Booking ${booking.id} confirmed successfully`);

     } catch (error) {
          // If StaleStateError, another process already handled this booking — do nothing
          if (error.code === 'STALE_STATE') {
               logger.info(`Booking ${booking.id} already handled by another process, skipping`);
               return;
          }

          logger.error(`Failed to confirm booking ${booking.id}`, { error: error.message });

          // Compensate: refund payment and release the car
          await saga.compensateAll(booking);

          await transition(booking.id, 'FAILED', {
               from: ['PAYMENT_PENDING', 'CONFIRMING'],
               data: { failureReason: `confirm_failed: ${error.message}` },
          });

          await forceReleaseBookingLock(booking);

          try {
               const userInfo = await fetchUserForNotification(booking.userId);
               await bookingProducer.publishBookingFailed({
                    ...toEventPayload(booking, userInfo),
                    reason: 'confirm_car_failed',
               });
          } catch (err) {
               logger.error('Failed to publish BOOKING_FAILED after retries', { bookingId: booking.id, error: err.message });
          }
     }
};

// ─── Handle Payment Failure (Kafka consumer) ─────────────────────────────────

const handlePaymentFailure = async (paymentOrderId, reason) => {
     const booking = await prisma.booking.findUnique({ where: { paymentOrderId } });

     if (!booking) {
          logger.warn(`No booking found for paymentOrderId: ${paymentOrderId}`);
          return;
     }

     // Idempotent
     if (isTerminal(booking.status)) {
          logger.info(`Booking ${booking.id} already in terminal state: ${booking.status}`);
          return;
     }

     if (booking.status !== 'PAYMENT_PENDING') {
          logger.warn(`Booking ${booking.id} in unexpected status: ${booking.status}`);
          return;
     }

     // Atomically claim this booking before compensating
     try {
          await casUpdateBooking(booking, 'FAILED', { failureReason: reason || 'payment_failed' });
     } catch (error) {
          if (error.code === 'STALE_STATE') {
               logger.info(`Booking ${booking.id} already handled by another process, skipping`);
               return;
          }
          throw error;
     }

     await saga.compensateHold(booking);
     await forceReleaseBookingLock(booking);

     try {
          const userInfo = await fetchUserForNotification(booking.userId);
          await bookingProducer.publishBookingFailed({
               ...toEventPayload(booking, userInfo),
               reason: reason || 'payment_failed',
          });
     } catch (err) {
          logger.error('Failed to publish BOOKING_FAILED after retries', { bookingId: booking.id, error: err.message });
     }

     logger.info(`Booking ${booking.id} failed: ${reason}`);
};

// ─── Cancel Booking ──────────────────────────────────────────────────────────

const cancelBooking = async (bookingId, userId) => {
     const booking = await prisma.booking.findUnique({ where: { id: bookingId } });

     if (!booking || booking.userId !== userId) {
          throw new NotFoundError('Booking not found');
     }

     if (!canTransition(booking.status, 'CANCELLING')) {
          throw new ConflictError(`Booking is already ${booking.status}`);
     }

     // Cancellation policy only applies to paid (confirmed) bookings
     const refund = booking.status === 'CONFIRMED'
          ? calculateRefund(booking.totalAmount, booking.pickupAt)
          : { refundable: true, refundAmount: 0, policy: 'unpaid' };

     if (!refund.refundable) {
          throw new BadRequestError('This rental has already started and can no longer be cancelled');
     }

     // Atomically claim this booking — prevents race with payment webhook or expiry job
     try {
          await casUpdateBooking(booking, 'CANCELLING', { failureReason: 'user_cancelled' });
     } catch (error) {
          if (error.code === 'STALE_STATE') {
               const fresh = await prisma.booking.findUnique({ where: { id: bookingId } });
               throw new ConflictError(
                    `Booking status changed to ${fresh?.status || 'unknown'} while cancelling. Please refresh.`
               );
          }
          throw error;
     }

     let refundInitiated = false;

     if (booking.status === 'CONFIRMED') {
          // Release the car + refund according to the policy
          try {
               await holds.cancelReservation(booking);
          } catch (error) {
               logger.error(`Failed to release car in inventory for booking ${booking.id}`, {
                    error: error.message,
               });
               // Roll back from CANCELLING to CONFIRMED so the user can retry
               await transition(booking.id, 'CONFIRMED', { from: 'CANCELLING', data: { failureReason: null } });
               throw error;
          }

          if (booking.paymentOrderId && refund.refundAmount > 0) {
               try {
                    await paymentClient.initiateRefund(
                         booking.paymentOrderId,
                         refund.refundAmount,
                         `user_cancelled:${refund.policy}`,
                         `${booking.id}-cancel-refund`
                    );
                    refundInitiated = true;
               } catch (error) {
                    logger.error(`Failed to initiate refund for booking ${booking.id}`, {
                         error: error.message,
                    });
               }
          }
     } else if (['PAYMENT_PENDING', 'CAR_HELD'].includes(booking.status)) {
          try {
               await holds.releaseHold(booking);
          } catch (error) {
               logger.error(`Failed to release car during cancel`, { error: error.message });
          }
     }

     const refundAmount = refundInitiated ? refund.refundAmount : 0;

     await transition(booking.id, 'CANCELLED', { from: 'CANCELLING', data: { refundAmount } });

     await forceReleaseBookingLock(booking);

     try {
          const userInfo = await fetchUserForNotification(booking.userId);
          await bookingProducer.publishBookingCancelled({
               ...toEventPayload(booking, userInfo),
               reason: 'user_cancelled',
               refundPolicy: refund.policy,
               refundAmount,
          });
     } catch (err) {
          logger.error('Failed to publish BOOKING_CANCELLED after retries', { bookingId: booking.id, error: err.message });
     }

     logger.info(`Booking ${booking.id} cancelled by user ${userId}`, { refundAmount, policy: refund.policy });

     return {
          bookingId: booking.id,
          status: 'CANCELLED',
          refundInitiated,
          refundAmount,
          refundPolicy: refund.policy,
     };
};

// ─── Read APIs ───────────────────────────────────────────────────────────────

const toBookingView = (b) => ({
     id: b.id,
     type: b.type,
     status: b.status,
     carId: b.carId,
     carName: b.carName,
     registrationNumber: b.registrationNumber,
     category: b.category,
     branchId: b.branchId,
     branchName: b.branchName,
     city: b.city,
     pickupAt: b.pickupAt,
     dropoffAt: b.dropoffAt,
     rentalDays: b.rentalDays,
     dailyRate: b.dailyRate,
     baseAmount: b.baseAmount,
     discountAmount: b.discountAmount,
     totalAmount: b.totalAmount,
     refundAmount: b.refundAmount,
     driver: b.driverName ? {
          name: b.driverName,
          age: b.driverAge,
          licenseNumber: b.driverLicenseNumber,
          phone: b.driverPhone,
     } : null,
     // shared rides
     tripId: b.tripId,
     routeName: b.routeName,
     fromSeq: b.fromSeq,
     toSeq: b.toSeq,
     fromStopName: b.fromStopName,
     toStopName: b.toStopName,
     seatNumbers: b.seatNumbers,
     seatFare: b.seatFare,
     passengers: b.passengers,
     paymentOrderId: b.paymentOrderId,
     lockExpiresAt: b.lockExpiresAt,
     failureReason: b.failureReason,
     createdAt: b.createdAt,
     updatedAt: b.updatedAt,
});

const getBooking = async (bookingId, userId) => {
     const booking = await prisma.booking.findUnique({ where: { id: bookingId } });

     if (!booking || booking.userId !== userId) {
          throw new NotFoundError('Booking not found');
     }

     const view = toBookingView(booking);
     if (booking.status === 'CONFIRMED') {
          view.cancellationPreview = calculateRefund(booking.totalAmount, booking.pickupAt);
     }

     // Let the customer reopen checkout if they closed the payment window while the car is held
     if (booking.status === 'PAYMENT_PENDING' && booking.lockExpiresAt > new Date()) {
          const step = await prisma.sagaLog.findFirst({
               where: { bookingId: booking.id, step: 'CREATE_PAYMENT', status: 'COMPLETED' },
               orderBy: { createdAt: 'desc' },
          });
          if (step?.response?.gatewayOrderId) {
               view.payment = {
                    gatewayOrderId: step.response.gatewayOrderId,
                    amount: step.response.amount,
                    currency: step.response.currency,
                    keyId: step.response.keyId,
               };
          }
     }
     return view;
};

const getUserBookings = async (userId, { status, when, page = 1, limit = 10 } = {}) => {
     // Clamp: NaN / negative values reach Prisma as an invalid skip/take (500)
     page = Number.isInteger(page) && page > 0 ? page : 1;
     limit = Number.isInteger(limit) ? Math.min(50, Math.max(1, limit)) : 10;
     const skip = (page - 1) * limit;
     const where = { userId };
     if (status) {
          const wanted = String(status).toUpperCase();
          if (!(wanted in TRANSITIONS)) throw new BadRequestError(`status must be one of ${Object.keys(TRANSITIONS).join(', ')}`);
          where.status = wanted;
     }

     // upcoming = still relevant (active and not yet returned); past = everything else
     const now = new Date();
     if (when === 'upcoming') {
          where.status = { in: ACTIVE_STATUSES };
          where.dropoffAt = { gt: now };
     } else if (when === 'past') {
          where.OR = [
               { status: { notIn: ACTIVE_STATUSES } },
               { dropoffAt: { lte: now } },
          ];
     }

     const [bookings, total] = await Promise.all([
          prisma.booking.findMany({
               where,
               orderBy: when === 'upcoming' ? { pickupAt: 'asc' } : { createdAt: 'desc' },
               skip,
               take: limit,
          }),
          prisma.booking.count({ where }),
     ]);

     return {
          bookings: bookings.map(toBookingView),
          pagination: {
               page,
               limit,
               total,
               totalPages: Math.ceil(total / limit),
          },
     };
};

// ─── Verify Payment (client-side verification after Razorpay checkout) ───────

const verifyPayment = async (bookingId, userId, razorpayPaymentId, razorpaySignature) => {
     const booking = await prisma.booking.findUnique({ where: { id: bookingId } });

     if (!booking || booking.userId !== userId) {
          throw new NotFoundError('Booking not found');
     }

     if (!booking.paymentOrderId) {
          throw new BadRequestError('Booking has no payment order');
     }

     if (booking.status === 'CONFIRMED') {
          return { bookingId: booking.id, status: 'CONFIRMED', message: 'Already confirmed' };
     }

     if (booking.status !== 'PAYMENT_PENDING') {
          throw new ConflictError(`Booking is in ${booking.status} status, cannot verify payment`);
     }

     const result = await paymentClient.verifyPayment(
          booking.paymentOrderId,
          razorpayPaymentId,
          razorpaySignature
     );

     logger.info(`Payment verified for booking ${bookingId}`, { result });

     return {
          bookingId: booking.id,
          paymentStatus: result.status,
     };
};

// ─── Bulk cancellation (Kafka consumers) ─────────────────────────────────────
// When a car leaves the fleet or a shared-ride trip is cancelled, every upcoming
// booking it affects is cancelled with a FULL refund — the customer did nothing wrong.

const cancelAffectedBookings = async (where, reason, label) => {
     const affected = await prisma.booking.findMany({
          where: { ...where, status: { in: ACTIVE_STATUSES }, dropoffAt: { gt: new Date() } },
     });

     if (affected.length === 0) {
          logger.info(`No upcoming bookings affected (${label})`);
          return 0;
     }
     logger.info(`Cancelling ${affected.length} booking(s): ${label}`);

     for (const booking of affected) {
          try {
               const refundDue = booking.status === 'CONFIRMED' ? booking.totalAmount : 0;
               const claimed = await transition(booking.id, 'CANCELLED', {
                    from: ACTIVE_STATUSES,
                    version: booking.version,
                    data: { failureReason: reason },
               });
               if (!claimed) {
                    logger.info(`Booking ${booking.id} already handled, skipping`);
                    continue;
               }

               try {
                    await holds.cancelReservation(booking);
               } catch (err) {
                    // No hold (e.g. PENDING) is fine; anything else is cleaned by lock expiry
                    logger.warn(`Could not release hold for booking ${booking.id}`, { error: err.message });
               }
               await forceReleaseBookingLock(booking);

               // Record the refund only once it has actually been initiated (same as user cancellations)
               let refundAmount = 0;
               if (refundDue > 0 && booking.paymentOrderId) {
                    try {
                         await paymentClient.initiateRefund(booking.paymentOrderId, refundDue, reason, `${booking.id}-${reason}-refund`);
                         refundAmount = refundDue;
                         await prisma.booking.update({ where: { id: booking.id }, data: { refundAmount } });
                    } catch (refundErr) {
                         logger.error(`Failed to initiate refund for booking ${booking.id}`, { error: refundErr.message });
                    }
               }

               try {
                    const userInfo = await fetchUserForNotification(booking.userId);
                    await bookingProducer.publishBookingCancelled({ ...toEventPayload(booking, userInfo), reason, refundAmount });
               } catch (err) {
                    logger.error('Failed to publish BOOKING_CANCELLED', { bookingId: booking.id, error: err.message });
               }
          } catch (error) {
               logger.error(`Failed to cancel booking ${booking.id} (${label})`, { error: error.message });
          }
     }
     return affected.length;
};

const handleCarDeactivated = (carId, status) => {
     if (!carId) return logger.warn('handleCarDeactivated called without carId');
     return cancelAffectedBookings({ carId }, 'car_unavailable', `car ${carId} went ${status}`);
};

const handleTripCancelled = (tripId, reason) => {
     if (!tripId) return logger.warn('handleTripCancelled called without tripId');
     return cancelAffectedBookings({ tripId }, reason === 'car_unavailable' ? 'car_unavailable' : 'trip_cancelled', `trip ${tripId} cancelled`);
};

// ─── Shared rides: seat bookings ─────────────────────────────────────────────

const MAX_SEATS_PER_BOOKING = 6;
const SEAT_BOOKING_CUTOFF_MS = 30 * 60 * 1000; // stop selling 30 min before boarding
const GENDERS = ['MALE', 'FEMALE', 'OTHER'];

/** Live seat map for the stretch + the two stops, with sales-cutoff checks. */
const loadTripStretch = async (tripId, fromSeq, toSeq) => {
     if (!tripId || !fromSeq || !toSeq) throw new BadRequestError('tripId, fromSeq and toSeq are required');
     const seatMap = await inventoryClient.getSeatMap(tripId, fromSeq, toSeq);
     if (seatMap.status !== 'SCHEDULED') throw new BadRequestError('This trip is no longer running');

     const fromStop = seatMap.stops[seatMap.fromSeq - 1];
     const toStop = seatMap.stops[seatMap.toSeq - 1];
     if (new Date(fromStop.time).getTime() < Date.now() + SEAT_BOOKING_CUTOFF_MS) {
          throw new BadRequestError('Booking for this stop has closed (it departs in less than 30 minutes)');
     }
     return { seatMap, fromStop, toStop };
};

const getSeatQuote = async (tripId, fromSeq, toSeq, seatCount = 1) => {
     const count = Math.max(1, Math.min(MAX_SEATS_PER_BOOKING, Number(seatCount) || 1));
     const { seatMap, fromStop, toStop } = await loadTripStretch(tripId, fromSeq, toSeq);
     return {
          tripId,
          routeName: seatMap.routeName,
          car: seatMap.car,
          driverName: seatMap.driverName,
          fromSeq: seatMap.fromSeq,
          toSeq: seatMap.toSeq,
          fromStop,
          toStop,
          seatsLeft: seatMap.seatsLeft,
          seats: seatMap.seats,
          ...calculateSeatFare(seatMap.farePerKm, fromStop.distanceKm, toStop.distanceKm, count),
     };
};

const validatePassengers = (passengers, seatNumbers) => {
     if (!Array.isArray(passengers) || passengers.length !== seatNumbers.length) {
          throw new BadRequestError('Add one passenger for each selected seat');
     }
     passengers.forEach((p, i) => {
          if (!p?.name || String(p.name).trim().length < 2) throw new BadRequestError(`Passenger ${i + 1}: name is required`);
          const age = Number(p.age);
          if (!Number.isInteger(age) || age < 1 || age > 120) throw new BadRequestError(`Passenger ${i + 1}: enter a valid age`);
          if (!GENDERS.includes(String(p.gender).toUpperCase())) throw new BadRequestError(`Passenger ${i + 1}: select a gender`);
     });
};

const createSeatBooking = async (userId, { tripId, fromSeq, toSeq, seatNumbers, passengers, idempotencyKey }) => {
     if (!idempotencyKey) throw new BadRequestError('idempotencyKey is required');
     const seats = [...new Set((seatNumbers || []).map(Number))];
     if (seats.length === 0) throw new BadRequestError('Select at least one seat');
     if (seats.length !== (seatNumbers || []).length) throw new BadRequestError('Each seat can be selected only once');
     if (seats.length > MAX_SEATS_PER_BOOKING) throw new BadRequestError(`You can book up to ${MAX_SEATS_PER_BOOKING} seats at a time`);
     validatePassengers(passengers, seats);

     const cached = await checkIdempotency(`booking:${userId}:${idempotencyKey}`);
     if (cached) return cached;

     const { seatMap, fromStop, toStop } = await loadTripStretch(tripId, fromSeq, toSeq);
     const missing = seats.filter((n) => !Number.isInteger(n) || n < 1 || n > seatMap.passengerSeats);
     if (missing.length) {
          throw new BadRequestError(`Seat ${missing.join(', ')} doesn't exist — this car has seats 1 to ${seatMap.passengerSeats}`);
     }
     const taken = seats.filter((n) => !seatMap.seats.find((s) => s.seatNumber === n)?.available);
     if (taken.length) {
          throw new ConflictError(`Seat ${taken.join(', ')} is no longer available for your stretch`, 'SEATS_UNAVAILABLE');
     }
     const fare = calculateSeatFare(seatMap.farePerKm, fromStop.distanceKm, toStop.distanceKm, seats.length);
     const from = seatMap.fromSeq;
     const to = seatMap.toSeq;

     const lockKeys = tripSeatLockKeys(tripId, seats, from, to);
     const { acquired, lockValue } = await acquireKeys(lockKeys, `pre-${Date.now()}`, config.BOOKING_TTL_SECONDS);
     if (!acquired) {
          throw new ConflictError('Someone else is booking one of these seats right now. Please try again.', 'SEATS_LOCKED');
     }

     let booking;
     try {
          booking = await prisma.booking.create({
               data: {
                    type: 'SEAT',
                    userId,
                    carId: seatMap.car.carId,
                    registrationNumber: seatMap.car.registrationNumber,
                    carName: `${seatMap.car.make} ${seatMap.car.model}`,
                    category: seatMap.car.category,
                    branchId: fromStop.branchId,
                    branchName: fromStop.name,
                    city: fromStop.city,
                    pickupAt: new Date(fromStop.time),
                    dropoffAt: new Date(toStop.time),
                    status: 'PENDING',
                    baseAmount: fare.baseAmount,
                    discountAmount: 0,
                    totalAmount: fare.totalAmount,
                    tripId,
                    routeName: seatMap.routeName,
                    fromSeq: from,
                    toSeq: to,
                    fromStopName: fromStop.name,
                    toStopName: toStop.name,
                    seatNumbers: seats,
                    seatFare: fare.seatFare,
                    passengers: passengers.map((p, i) => ({
                         name: String(p.name).trim(),
                         age: Number(p.age),
                         gender: String(p.gender).toUpperCase(),
                         seatNumber: seats[i],
                    })),
                    idempotencyKey,
                    lockExpiresAt: new Date(Date.now() + config.BOOKING_TTL_SECONDS * 1000),
               },
          }).catch(rethrowDuplicateKey);

          await saga.executeHold(booking, config.LOCK_TTL_SECONDS);
          const paymentOrder = await saga.executeCreatePayment(booking);
          booking = await prisma.booking.findUnique({ where: { id: booking.id } });

          const response = {
               bookingId: booking.id,
               type: 'SEAT',
               status: booking.status,
               carName: booking.carName,
               routeName: booking.routeName,
               fromStopName: booking.fromStopName,
               toStopName: booking.toStopName,
               pickupAt: booking.pickupAt,
               dropoffAt: booking.dropoffAt,
               seatNumbers: booking.seatNumbers,
               seatFare: booking.seatFare,
               totalAmount: booking.totalAmount,
               lockExpiresAt: booking.lockExpiresAt,
               paymentOrder: {
                    paymentOrderId: paymentOrder.paymentOrderId,
                    gatewayOrderId: paymentOrder.gatewayOrderId,
                    amount: paymentOrder.amount,
                    currency: paymentOrder.currency,
                    keyId: paymentOrder.keyId,
               },
          };
          await saveIdempotency(`booking:${userId}:${idempotencyKey}`, response);
          return response;
     } catch (error) {
          logger.error(`Seat booking failed for user ${userId}`, { error: error.message });
          if (booking) {
               await saga.compensateAll(booking);
               await transition(booking.id, 'FAILED', {
                    from: UNPAID_STATUSES,
                    data: { failureReason: error.response?.data?.message || error.message },
               });
          }
          await releaseKeys(lockKeys, lockValue);
          throw error;
     }
};

module.exports = {
     getQuote,
     createBooking,
     getSeatQuote,
     createSeatBooking,
     handlePaymentSuccess,
     handlePaymentFailure,
     handleCarDeactivated,
     handleTripCancelled,
     cancelBooking,
     getBooking,
     getUserBookings,
     verifyPayment,
};

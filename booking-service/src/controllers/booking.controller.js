const asyncHandler = require('../utils/asyncHandler');
const { BadRequestError } = require('../utils/error');
const bookingService = require('../services/booking.service');

exports.getQuote = asyncHandler(async (req, res) => {
     const { carId, pickupAt, dropoffAt } = req.query;

     if (!carId || !pickupAt || !dropoffAt) {
          throw new BadRequestError('carId, pickupAt and dropoffAt are required');
     }

     const result = await bookingService.getQuote(carId, pickupAt, dropoffAt);

     res.status(200).json({ success: true, data: result });
});

exports.getSeatQuote = asyncHandler(async (req, res) => {
     const { tripId, fromSeq, toSeq, seats } = req.query;
     if (!tripId || !fromSeq || !toSeq) throw new BadRequestError('tripId, fromSeq and toSeq are required');
     const result = await bookingService.getSeatQuote(tripId, Number(fromSeq), Number(toSeq), seats);
     res.status(200).json({ success: true, data: result });
});

exports.createBooking = asyncHandler(async (req, res) => {
     const userId = req.user.id;

     // Shared ride: { type: 'SEAT', tripId, fromSeq, toSeq, seatNumbers, passengers, idempotencyKey }
     if (req.body.type === 'SEAT') {
          const result = await bookingService.createSeatBooking(userId, req.body);
          return res.status(201).json({ success: true, data: result });
     }

     const { carId, pickupAt, dropoffAt, driver, idempotencyKey } = req.body;

     if (!carId || !pickupAt || !dropoffAt || !driver || !idempotencyKey) {
          throw new BadRequestError('carId, pickupAt, dropoffAt, driver and idempotencyKey are required');
     }

     const result = await bookingService.createBooking(userId, carId, pickupAt, dropoffAt, driver, idempotencyKey);

     res.status(201).json({ success: true, data: result });
});

exports.getBooking = asyncHandler(async (req, res) => {
     const userId = req.user.id;
     const { bookingId } = req.params;

     const result = await bookingService.getBooking(bookingId, userId);

     res.status(200).json({ success: true, data: result });
});

exports.getUserBookings = asyncHandler(async (req, res) => {
     const userId = req.user.id;
     const { status, when, page, limit } = req.query;

     const result = await bookingService.getUserBookings(userId, {
          status,
          when,
          page: page ? parseInt(page, 10) : 1,
          limit: limit ? parseInt(limit, 10) : 10,
     });

     res.status(200).json({ success: true, data: result });
});

exports.verifyPayment = asyncHandler(async (req, res) => {
     const userId = req.user.id;
     const { bookingId } = req.params;
     const { razorpayPaymentId, razorpaySignature } = req.body;

     if (!razorpayPaymentId || !razorpaySignature) {
          throw new BadRequestError('razorpayPaymentId and razorpaySignature are required');
     }

     const result = await bookingService.verifyPayment(bookingId, userId, razorpayPaymentId, razorpaySignature);

     res.status(200).json({ success: true, data: result });
});

exports.cancelBooking = asyncHandler(async (req, res) => {
     const userId = req.user.id;
     const { bookingId } = req.params;

     const result = await bookingService.cancelBooking(bookingId, userId);

     res.status(200).json({
          success: true,
          message: 'Booking cancelled successfully',
          data: result,
     });
});

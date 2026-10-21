const asyncHandler = require('../utils/asyncHandler');
const { BadRequestError } = require('../utils/error');
const tripService = require('../services/trip.service');
const inventoryService = require('../services/inventory.service');

// Public seat map (optionally for a stretch of the route)
exports.getSeatMap = asyncHandler(async (req, res) => {
     const { fromSeq, toSeq } = req.query;
     const data = await tripService.getSeatMap(req.params.tripId, fromSeq, toSeq);
     res.status(200).json({ success: true, data });
});

// Internal: full trip snapshot for booking-service
exports.getTripInternal = asyncHandler(async (req, res) => {
     res.status(200).json({ success: true, data: await tripService.getTrip(req.params.tripId) });
});

// Internal: seats left for many (trip, stretch) pairs - used by search-service
exports.availabilityBatch = asyncHandler(async (req, res) => {
     const { items } = req.body;
     if (!Array.isArray(items)) throw new BadRequestError('items (array) is required');
     res.status(200).json({ success: true, data: await tripService.getAvailabilityBatch(items.slice(0, 200)) });
});

exports.lockSeats = asyncHandler(async (req, res) => {
     const { tripId, bookingId, seatNumbers, fromSeq, toSeq, userId, ttlSeconds } = req.body;
     if (!tripId || !bookingId || !Array.isArray(seatNumbers) || !fromSeq || !toSeq || !userId) {
          throw new BadRequestError('tripId, bookingId, seatNumbers, fromSeq, toSeq and userId are required');
     }
     const data = await tripService.lockSeats(tripId, bookingId, seatNumbers, fromSeq, toSeq, userId, ttlSeconds);
     res.status(200).json({ success: true, message: 'Seats held', data });
});

exports.releaseSeats = asyncHandler(async (req, res) => {
     const { tripId, bookingId } = req.body;
     if (!tripId || !bookingId) throw new BadRequestError('tripId and bookingId are required');
     res.status(200).json({ success: true, data: await tripService.releaseSeats(tripId, bookingId) });
});

exports.confirmSeats = asyncHandler(async (req, res) => {
     const { tripId, bookingId, userId } = req.body;
     if (!tripId || !bookingId || !userId) throw new BadRequestError('tripId, bookingId and userId are required');
     res.status(200).json({ success: true, data: await tripService.confirmSeats(tripId, bookingId, userId) });
});

exports.cancelSeatBooking = asyncHandler(async (req, res) => {
     const { tripId, bookingId } = req.body;
     if (!tripId || !bookingId) throw new BadRequestError('tripId and bookingId are required');
     res.status(200).json({ success: true, data: await tripService.cancelSeatBooking(tripId, bookingId) });
});

// Internal (admin-service): block / unblock a car for a trip window
exports.reserveCar = asyncHandler(async (req, res) => {
     const { carId, reservationId, startAt, endAt } = req.body;
     if (!carId || !reservationId || !startAt || !endAt) throw new BadRequestError('carId, reservationId, startAt and endAt are required');
     res.status(200).json({ success: true, data: await inventoryService.reserveCarForTrip(carId, reservationId, startAt, endAt) });
});

exports.releaseCarReservation = asyncHandler(async (req, res) => {
     const { carId, reservationId } = req.body;
     if (!carId || !reservationId) throw new BadRequestError('carId and reservationId are required');
     res.status(200).json({ success: true, data: await inventoryService.releaseCarReservation(carId, reservationId) });
});

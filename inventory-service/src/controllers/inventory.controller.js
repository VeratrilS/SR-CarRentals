const asyncHandler = require('../utils/asyncHandler');
const { BadRequestError } = require('../utils/error');
const inventoryService = require('../services/inventory.service');

exports.getCarAvailability = asyncHandler(async (req, res) => {
     const { carId } = req.params;
     const { startAt, endAt } = req.query;

     const data = await inventoryService.getAvailability(carId, startAt, endAt);

     res.status(200).json({ success: true, data });
});

exports.lockCar = asyncHandler(async (req, res) => {
     const { carId, bookingId, startAt, endAt, userId, ttlSeconds } = req.body;

     if (!carId || !bookingId || !startAt || !endAt) {
          throw new BadRequestError('carId, bookingId, startAt and endAt are required');
     }
     if (!userId) {
          throw new BadRequestError('userId is required');
     }

     const result = await inventoryService.lockCar(carId, bookingId, startAt, endAt, userId, ttlSeconds);

     res.status(200).json({
          success: true,
          message: 'Car held successfully',
          data: result,
     });
});

exports.releaseCar = asyncHandler(async (req, res) => {
     const { carId, bookingId, userId } = req.body;

     if (!carId || !bookingId) {
          throw new BadRequestError('carId and bookingId are required');
     }

     const result = await inventoryService.releaseCar(carId, bookingId, userId);

     res.status(200).json({ success: true, message: 'Hold released', data: result });
});

exports.confirmCar = asyncHandler(async (req, res) => {
     const { carId, bookingId, userId } = req.body;

     if (!carId || !bookingId) {
          throw new BadRequestError('carId and bookingId are required');
     }
     if (!userId) {
          throw new BadRequestError('userId is required');
     }

     const result = await inventoryService.confirmCar(carId, bookingId, userId);

     res.status(200).json({ success: true, message: 'Reservation confirmed', data: result });
});

exports.cancelBooking = asyncHandler(async (req, res) => {
     const { carId, bookingId } = req.body;

     if (!carId || !bookingId) {
          throw new BadRequestError('carId and bookingId are required');
     }

     const result = await inventoryService.cancelBooking(carId, bookingId);

     res.status(200).json({ success: true, message: 'Reservation released', data: result });
});

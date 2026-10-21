const asyncHandler = require('../utils/asyncHandler');
const { BadRequestError } = require('../utils/error');
const rideService = require('../services/ride.service');

exports.createRoute = asyncHandler(async (req, res) => {
     const { name, stops } = req.body;
     if (!Array.isArray(stops)) throw new BadRequestError('stops (array) is required');
     const route = await rideService.createRoute({ name, stops });
     res.status(201).json({ success: true, message: 'Route created', data: route });
});

exports.getRoutes = asyncHandler(async (req, res) => {
     res.status(200).json({ success: true, data: await rideService.getRoutes() });
});

exports.scheduleTrip = asyncHandler(async (req, res) => {
     const { routeId, carId, departureAt, driverName, farePerKm } = req.body;
     if (!routeId || !carId || !departureAt || !driverName || farePerKm === undefined) {
          throw new BadRequestError('routeId, carId, departureAt, driverName and farePerKm are required');
     }
     const trip = await rideService.scheduleTrip({ routeId, carId, departureAt, driverName, farePerKm });
     res.status(201).json({ success: true, message: 'Trip scheduled', data: trip });
});

exports.getTrips = asyncHandler(async (req, res) => {
     res.status(200).json({ success: true, data: await rideService.getTrips(req.query) });
});

exports.cancelTrip = asyncHandler(async (req, res) => {
     const trip = await rideService.cancelTrip(req.params.tripId);
     res.status(200).json({ success: true, message: 'Trip cancelled', data: trip });
});

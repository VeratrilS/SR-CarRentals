const express = require('express');
const { internalAuth } = require('../middlewares/internalAuth.middleware');
const {
     getCarAvailability,
     lockCar,
     releaseCar,
     confirmCar,
     cancelBooking,
} = require('../controllers/inventory.controller');
const trip = require('../controllers/trip.controller');

const router = express.Router();

// Public: a car's blocked ranges, and whether a requested window is free
router.get('/cars/:carId/availability', getCarAvailability);

// Internal: called by booking-service (protected by service key)
router.post('/holds/lock', internalAuth, lockCar);
router.post('/holds/release', internalAuth, releaseCar);
router.post('/holds/confirm', internalAuth, confirmCar);
router.post('/holds/cancel-booking', internalAuth, cancelBooking);

// --- Shared rides ---
// Public: seat map for a trip (optionally for a stretch ?fromSeq=&toSeq=)
router.get('/trips/:tripId/seats', trip.getSeatMap);

// Internal
router.get('/internal/trips/:tripId', internalAuth, trip.getTripInternal);
router.post('/internal/trips/availability', internalAuth, trip.availabilityBatch);
router.post('/trip-holds/lock', internalAuth, trip.lockSeats);
router.post('/trip-holds/release', internalAuth, trip.releaseSeats);
router.post('/trip-holds/confirm', internalAuth, trip.confirmSeats);
router.post('/trip-holds/cancel-booking', internalAuth, trip.cancelSeatBooking);
router.post('/internal/cars/reserve', internalAuth, trip.reserveCar);
router.post('/internal/cars/release-reservation', internalAuth, trip.releaseCarReservation);

module.exports = router;

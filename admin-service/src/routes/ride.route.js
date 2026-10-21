const express = require('express');
const { createRoute, getRoutes, scheduleTrip, getTrips, cancelTrip } = require('../controllers/ride.controller');
const { getUserContext } = require('../middlewares/getUserContext.middleware');

const router = express.Router();

router.post('/route', getUserContext, createRoute);
router.get('/route', getUserContext, getRoutes);
router.post('/trip', getUserContext, scheduleTrip);
router.get('/trip', getUserContext, getTrips);
router.patch('/trip/:tripId/cancel', getUserContext, cancelTrip);

module.exports = router;

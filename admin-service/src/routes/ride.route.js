const express = require('express');
const { createRoute, getRoutes, scheduleTrip, getTrips, cancelTrip } = require('../controllers/ride.controller');
const { getUserContext, requireAdminRole } = require('../middlewares/getUserContext.middleware');

const router = express.Router();

router.post('/route', getUserContext, requireAdminRole, createRoute);
router.get('/route', getUserContext, requireAdminRole, getRoutes);
router.post('/trip', getUserContext, requireAdminRole, scheduleTrip);
router.get('/trip', getUserContext, requireAdminRole, getTrips);
router.patch('/trip/:tripId/cancel', getUserContext, requireAdminRole, cancelTrip);

module.exports = router;

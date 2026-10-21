const { Router } = require('express');
const ctrl = require('../controllers/search.controller');
const router = Router();

// GET /search/cars?location=Hyderabad&pickupAt=2026-11-01T10:00:00Z&dropoffAt=2026-11-04T10:00:00Z&category=SUV
router.get('/cars', ctrl.searchCars);

// GET /search/autocomplete?q=hyd
router.get('/autocomplete', ctrl.autocomplete);

// GET /search/rides?from=Hyderabad&to=Vijayawada&date=2026-10-20&seats=1
router.get('/rides', ctrl.searchRides);

// GET /search/locations — cities with active cars (for quick picks)
router.get('/locations', ctrl.locations);

// Debug endpoints
router.get('/debug/branches', ctrl.debugBranches);
router.get('/debug/cars', ctrl.debugCars);

module.exports = router;

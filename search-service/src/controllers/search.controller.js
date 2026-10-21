const asyncHandler = require('../utils/asyncHandler');
const { BadRequestError } = require('../utils/error');
const searchService = require('../services/search.service');
const rideService = require('../services/ride.service');

exports.searchCars = asyncHandler(async (req, res) => {
     const { location, pickupAt, dropoffAt, category, transmission, fuelType, minSeats, maxPrice, sort } = req.query;
     if (!location) throw new BadRequestError('location (city, branch name or code) is required');

     if ((pickupAt && !dropoffAt) || (!pickupAt && dropoffAt)) {
          throw new BadRequestError('Provide both pickupAt and dropoffAt, or neither');
     }
     if (pickupAt && dropoffAt) {
          const p = new Date(pickupAt);
          const d = new Date(dropoffAt);
          if (isNaN(p.getTime()) || isNaN(d.getTime())) throw new BadRequestError('pickupAt/dropoffAt must be ISO date-times');
          if (d <= p) throw new BadRequestError('dropoffAt must be after pickupAt');
     }

     const results = await searchService.searchCars({
          location, pickupAt, dropoffAt, category, transmission, fuelType, minSeats, maxPrice, sort,
     });
     res.json({ success: true, data: results });
});

exports.autocomplete = asyncHandler(async (req, res) => {
     const { q } = req.query;
     if (!q || q.length < 2) throw new BadRequestError('Provide at least 2 characters');
     const suggestions = await searchService.autocompleteBranch(q);
     res.json({ success: true, data: suggestions });
});

// GET /search/rides?from=Hyderabad&to=Vijayawada&date=2026-10-20&seats=2
exports.searchRides = asyncHandler(async (req, res) => {
     const { from, to, date, seats } = req.query;
     if (!from || !to || !date) throw new BadRequestError('from, to and date are required');
     if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new BadRequestError('date must be YYYY-MM-DD');
     const n = Number(seats || 1);
     if (!Number.isInteger(n) || n < 1 || n > 6) throw new BadRequestError('seats must be between 1 and 6');
     const results = await rideService.searchRides({ from, to, date, seats: n });
     res.json({ success: true, data: results });
});

exports.locations = asyncHandler(async (req, res) => {
     const data = await searchService.getLocations();
     res.json({ success: true, data });
});

exports.debugBranches = asyncHandler(async (req, res) => {
     const data = await searchService.getAllBranches();
     res.json({ success: true, count: data.length, data });
});

exports.debugCars = asyncHandler(async (req, res) => {
     const data = await searchService.getAllCars();
     res.json({ success: true, count: data.length, data });
});

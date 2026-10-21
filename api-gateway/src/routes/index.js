const express = require('express');
const { requireAuth, requireAdmin } = require('../middlewares/auth.middleware');
const { createProxy, getCircuitBreakerStatus } = require('../services/proxy');
const { ipRateLimit, endpointRateLimit, combinedRateLimit } = require('../middlewares/rateLimiting.middleware')
const { config } = require('../config');

const router = express.Router();

// ===========================
// Service Proxy Routes
// ===========================

/**
 * USER SERVICE ROUTES
 * Gateway Path: /api/users/auth/login
 * Service Path: /auth/login
**/

const userServiceProxy = createProxy('userService', config.SERVICES.USER_SERVICE_URL);

// public routes
router.post(
     '/users/auth/send-otp',
     endpointRateLimit(5, 3600000), // 5 requests per hour
     userServiceProxy
);

router.post(
     '/users/auth/verify-otp',
     endpointRateLimit(10, 3600000), // 10 requests per hour
     userServiceProxy
);

router.post(
     '/users/auth/login',
     endpointRateLimit(100, 900000),// 100 requests per 15 minutes
     userServiceProxy
);

router.post(
     '/users/auth/google-auth',
     endpointRateLimit(10, 900000), // 10 requests per 15 minutes
     userServiceProxy
);

router.post(
     '/users/auth/logout',
     endpointRateLimit(30, 900000), // 30 requests per 15 minutes
     userServiceProxy
);

router.post(
     '/users/auth/refresh',
     endpointRateLimit(20, 900000), // 20 requests per 15 minutes
     userServiceProxy
);

// private routes
router.get(
     '/users/user/profile',
     requireAuth,
     combinedRateLimit(),
     userServiceProxy
)

router.put(
     '/users/user/profile',
     requireAuth,
     combinedRateLimit(),
     userServiceProxy
)

router.delete(
     '/users/user/profile',
     requireAuth,
     combinedRateLimit(),
     userServiceProxy
)

// ===========================
// ADMIN SERVICE ROUTES (fleet management — ADMIN role only)
// ===========================
const adminServiceProxy = createProxy('adminService', config.SERVICES.ADMIN_SERVICE_URL);
const adminOnly = [requireAuth, requireAdmin, combinedRateLimit()];

router.post('/admins/branches/branch', ...adminOnly, adminServiceProxy);
router.get('/admins/branches/branch', ...adminOnly, adminServiceProxy);
router.get('/admins/branches/branch/:branchId', ...adminOnly, adminServiceProxy);

router.post('/admins/cars/car', ...adminOnly, adminServiceProxy);
router.get('/admins/cars/car', ...adminOnly, adminServiceProxy);
router.get('/admins/cars/car/:carId', ...adminOnly, adminServiceProxy);
router.put('/admins/cars/car/:carId', ...adminOnly, adminServiceProxy);
router.patch('/admins/cars/car/:carId/status', ...adminOnly, adminServiceProxy);

// Shared rides: routes + scheduled trips
router.post('/admins/rides/route', ...adminOnly, adminServiceProxy);
router.get('/admins/rides/route', ...adminOnly, adminServiceProxy);
router.post('/admins/rides/trip', ...adminOnly, adminServiceProxy);
router.get('/admins/rides/trip', ...adminOnly, adminServiceProxy);
router.patch('/admins/rides/trip/:tripId/cancel', ...adminOnly, adminServiceProxy);

// ===========================
// SEARCH SERVICE ROUTES (public - no auth required)
// ===========================
const searchServiceProxy = createProxy('searchService', config.SERVICES.SEARCH_SERVICE_URL);

router.get(
     '/search/cars',
     endpointRateLimit(60, 60000), // 60 requests per minute
     searchServiceProxy
);

router.get(
     '/search/rides',
     endpointRateLimit(60, 60000), // 60 requests per minute
     searchServiceProxy
);

router.get(
     '/search/locations',
     endpointRateLimit(120, 60000), // 120 requests per minute
     searchServiceProxy
);

router.get(
     '/search/autocomplete',
     endpointRateLimit(120, 60000), // 120 requests per minute
     searchServiceProxy
);

// ===========================
// INVENTORY SERVICE ROUTES (public read-only)
// ===========================
const inventoryServiceProxy = createProxy('inventoryService', config.SERVICES.INVENTORY_SERVICE_URL);

// Public: a car's booked periods + whether a requested window is free
router.get(
     '/inventory/cars/:carId/availability',
     endpointRateLimit(120, 60000), // 120 requests per minute
     inventoryServiceProxy
);

// Public: seat map of a shared-ride trip (optionally for a stretch)
router.get(
     '/inventory/trips/:tripId/seats',
     endpointRateLimit(120, 60000), // 120 requests per minute
     inventoryServiceProxy
);

// Note: hold/release/confirm/cancel-booking are internal-only
// (called by booking-service directly, not through the gateway)

// ===========================
// BOOKING SERVICE ROUTES
// ===========================
const bookingServiceProxy = createProxy('bookingService', config.SERVICES.BOOKING_SERVICE_URL);

// Price quote for a car + window (no side effects)
router.get(
     '/bookings/bookings/quote',
     requireAuth,
     combinedRateLimit(),
     bookingServiceProxy
);

// Price quote for seats on a shared ride
router.get(
     '/bookings/bookings/seat-quote',
     requireAuth,
     combinedRateLimit(),
     bookingServiceProxy
);

router.post(
     '/bookings/bookings',
     requireAuth,
     endpointRateLimit(5, 60000), // 5 booking attempts per minute
     bookingServiceProxy
);

router.get(
     '/bookings/bookings',
     requireAuth,
     combinedRateLimit(),
     bookingServiceProxy
);

router.get(
     '/bookings/bookings/:bookingId',
     requireAuth,
     combinedRateLimit(),
     bookingServiceProxy
);

router.post(
     '/bookings/bookings/:bookingId/verify-payment',
     requireAuth,
     combinedRateLimit(),
     bookingServiceProxy
);

router.post(
     '/bookings/bookings/:bookingId/cancel',
     requireAuth,
     combinedRateLimit(),
     bookingServiceProxy
);

// ===========================
// PAYMENT SERVICE ROUTES (webhook only - public)
// ===========================
const paymentServiceProxy = createProxy('paymentService', config.SERVICES.PAYMENT_SERVICE_URL);

// Razorpay webhook (public — no auth, signature-verified by payment-service)
router.post(
     '/payments/webhooks/razorpay',
     paymentServiceProxy
);

// Gateway Health Status

router.get('/gateway/health', (req, res) => {
     res.status(200).json({
          success: true,
          message: "API Gateway is healthy",
          timestamp: new Date().toISOString()
     });
});

router.get('/gateway/circuit-breakers', (req, res) => {
     const status = getCircuitBreakerStatus();
     res.status(200).json({
          success: true,
          circuitBreakers: status,
     });
});

module.exports = router;
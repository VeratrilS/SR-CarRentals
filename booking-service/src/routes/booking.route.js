const express = require('express');
const { getUserContext } = require('../middlewares/getUserContext.middleware');
const {
     getQuote,
     getSeatQuote,
     createBooking,
     getBooking,
     getUserBookings,
     cancelBooking,
     verifyPayment,
} = require('../controllers/booking.controller');

const router = express.Router();

// All booking routes require authentication (user context from gateway)
router.get('/bookings/quote', getUserContext, getQuote);
router.get('/bookings/seat-quote', getUserContext, getSeatQuote);
router.post('/bookings', getUserContext, createBooking);
router.get('/bookings', getUserContext, getUserBookings);
router.get('/bookings/:bookingId', getUserContext, getBooking);
router.post('/bookings/:bookingId/verify-payment', getUserContext, verifyPayment);
router.post('/bookings/:bookingId/cancel', getUserContext, cancelBooking);

module.exports = router;

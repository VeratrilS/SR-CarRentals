const { config } = require('../config');

const BRAND = 'SR-CarRentals';
const BRAND_COLOR = '#0F766E';
const BRAND_TINT = '#F0FDFA';

function layout(title, body, footer = `Drive safe! 🚗<br/><strong>Team ${BRAND}</strong>`) {
  return `
    <div style="
      font-family: Arial, sans-serif;
      max-width: 600px;
      margin: auto;
      padding: 20px;
      border: 1px solid #e5e5e5;
      border-radius: 10px;
      background: #ffffff;
      box-shadow: 0 4px 10px rgba(0,0,0,0.05);
    ">
      <div style="text-align: center; margin-bottom: 20px;">
        <p style="margin: 0 0 6px; font-size: 13px; letter-spacing: 2px; color: ${BRAND_COLOR}; font-weight: bold;">${BRAND.toUpperCase()}</p>
        <h2 style="color: #111827; margin: 0;">${title}</h2>
      </div>
      ${body}
      <hr style="border: none; border-top: 1px solid #eee; margin: 25px 0;" />
      <p style="font-size: 14px; color: #888; text-align: center;">${footer}</p>
    </div>
  `;
}

const greeting = (firstName) =>
  `<p style="font-size: 16px; color: #333;">Hi ${firstName ? `<strong>${firstName}</strong>` : 'there'},</p>`;

const infoBox = (rows) => `
  <div style="background: ${BRAND_TINT}; padding: 15px; border-radius: 8px; margin: 20px 0;">
    ${rows.filter(Boolean).map(([k, v]) => `<p style="margin: 6px 0; font-size: 15px;"><strong>${k}:</strong> ${v}</p>`).join('')}
  </div>`;

function formatDateTime(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: true,
    timeZone: 'Asia/Kolkata',
  });
}

const inr = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

function getOtpTemplate(otp, ttlMinutes) {
  return layout('Verify your email', `
      <p style="font-size: 16px; color: #333;">Hi,</p>
      <p style="font-size: 16px; color: #333;">
        Welcome to <strong>${BRAND}</strong> 👋 Use the verification code below to complete your sign up:
      </p>
      <div style="text-align: center; margin: 30px 0;">
        <div style="
          display: inline-block;
          padding: 14px 26px;
          font-size: 32px;
          letter-spacing: 8px;
          font-weight: bold;
          background: ${BRAND_TINT};
          border-radius: 8px;
          color: ${BRAND_COLOR};
          border: 1px solid #99F6E4;
        ">${otp}</div>
      </div>
      <p style="font-size: 15px; color: #555;">This code will expire in <strong>${ttlMinutes} minutes</strong>.</p>
      <p style="font-size: 15px; color: #555;">If this wasn't you, please ignore this email.</p>
  `, `<strong>Team ${BRAND}</strong>`);
}

function getWelcomeTemplate(firstName) {
  return layout('Welcome aboard!', `
      ${greeting(firstName)}
      <p style="font-size: 16px; color: #333;">
        Your <strong>${BRAND}</strong> account has been created and verified. Find a car near you and hit the road.
      </p>
      <div style="text-align: center; margin: 25px 0;">
        <a href="${config.FRONTEND_URL}"
          style="
            display: inline-block;
            padding: 12px 22px;
            background: ${BRAND_COLOR};
            color: white;
            font-size: 16px;
            font-weight: bold;
            text-decoration: none;
            border-radius: 6px;
          ">
          Log in to your account
        </a>
      </div>
      <p style="font-size: 15px; color: #555;">
        If you did not create this account, please contact our support team immediately.
      </p>
  `);
}

const FAILURE_REASON_MESSAGES = {
  payment_failed: 'Your payment could not be processed.',
  confirm_car_failed: 'We could not confirm the car reservation.',
  booking_timeout: 'Your booking expired before payment was completed.',
};

const CANCELLATION_REASON_MESSAGES = {
  user_cancelled: 'You requested to cancel this booking.',
  car_unavailable: `The car became unavailable (maintenance or fleet change). We're sorry for the inconvenience.`,
  trip_cancelled: 'The shared ride was cancelled by the operator. You have been fully refunded.',
};

/** Shared ride: seats on a trip for a stretch of its route. */
function getSeatBookingConfirmedTemplate(data) {
  const {
    bookingId, firstName, carName, registrationNumber, routeName,
    fromStopName, toStopName, pickupAt, dropoffAt, seatNumbers = [], seatFare,
    passengers = [], totalAmount,
  } = data;

  return layout('🚗 Seats Confirmed', `
      ${greeting(firstName)}
      <p style="font-size: 16px; color: #333;">Your seats on the shared ride are confirmed:</p>
      ${infoBox([
        ['Booking ID', bookingId],
        routeName && ['Route', routeName],
        ['Board at', `${fromStopName} · ${formatDateTime(pickupAt)}`],
        ['Get off at', `${toStopName} · ${formatDateTime(dropoffAt)}`],
        ['Car', `${carName}${registrationNumber ? ` (${registrationNumber})` : ''}`],
        ['Seat(s)', seatNumbers.join(', ')],
      ])}
      ${passengers.length ? `
      <p style="font-size: 15px; font-weight: bold; margin: 16px 0 6px;">Passengers</p>
      ${passengers.map((p, i) => `<p style="margin: 4px 0; font-size: 14px;">${i + 1}. ${p.name} (${p.age}, ${p.gender}) — seat ${p.seatNumber}</p>`).join('')}` : ''}
      <table style="width: 100%; font-size: 15px; border-collapse: collapse; margin-top: 12px;">
        <tr><td style="padding: 6px 0;">${seatNumbers.length} seat(s) × ${inr(seatFare)}</td><td style="text-align: right;">${inr(totalAmount)}</td></tr>
        <tr><td style="padding: 8px 0; border-top: 1px solid #eee;"><strong>Total paid</strong></td><td style="text-align: right; border-top: 1px solid #eee;"><strong>${inr(totalAmount)}</strong></td></tr>
      </table>
      <p style="font-size: 14px; color: #555; margin-top: 20px;">
        Please reach your boarding point 10 minutes early and carry a photo ID.
        Free cancellation up to 24 hours before departure.
      </p>
  `);
}

function getBookingConfirmedTemplate(data) {
  if (data.type === 'SEAT') return getSeatBookingConfirmedTemplate(data);
  const {
    bookingId, firstName, carName, registrationNumber, category,
    branchName, city, pickupAt, dropoffAt, rentalDays, dailyRate,
    baseAmount, discountAmount, totalAmount, driverName,
  } = data;

  return layout('🚗 Booking Confirmed', `
      ${greeting(firstName)}
      <p style="font-size: 16px; color: #333;">Your car is reserved. Here are your rental details:</p>
      ${infoBox([
        ['Booking ID', bookingId],
        ['Car', `${carName}${category ? ` (${category})` : ''}`],
        registrationNumber && ['Registration', registrationNumber],
        ['Pickup & drop-off', `${branchName}${city ? `, ${city}` : ''}`],
        ['Pickup', formatDateTime(pickupAt)],
        ['Drop-off', formatDateTime(dropoffAt)],
        driverName && ['Driver', driverName],
      ])}
      <table style="width: 100%; font-size: 15px; border-collapse: collapse;">
        <tr><td style="padding: 6px 0;">${rentalDays} day(s) × ${inr(dailyRate)}</td><td style="text-align: right;">${inr(baseAmount)}</td></tr>
        ${discountAmount > 0 ? `<tr><td style="padding: 6px 0; color: ${BRAND_COLOR};">Long-rental discount</td><td style="text-align: right; color: ${BRAND_COLOR};">−${inr(discountAmount)}</td></tr>` : ''}
        <tr><td style="padding: 8px 0; border-top: 1px solid #eee;"><strong>Total paid</strong></td><td style="text-align: right; border-top: 1px solid #eee;"><strong>${inr(totalAmount)}</strong></td></tr>
      </table>
      <p style="font-size: 14px; color: #555; margin-top: 20px;">
        Please bring a valid driving licence and a government photo ID to pickup.
        Free cancellation up to 24 hours before pickup.
      </p>
  `);
}

function getBookingFailedTemplate(data) {
  const { bookingId, firstName, carName, reason } = data;
  const friendlyReason = FAILURE_REASON_MESSAGES[reason] || 'Your booking could not be completed.';

  return layout('Booking Unsuccessful', `
      ${greeting(firstName)}
      <p style="font-size: 16px; color: #333;">We're sorry — we were unable to complete your booking.</p>
      ${infoBox([
        ['Booking ID', bookingId],
        carName && ['Car', carName],
        ['Reason', friendlyReason],
      ])}
      <p style="font-size: 15px; color: #555;">
        If any amount was debited, it will be refunded to your original payment method automatically.
        You can try booking again from your ${BRAND} account.
      </p>
  `, `We're sorry for the inconvenience.<br/><strong>Team ${BRAND}</strong>`);
}

function getBookingCancelledTemplate(data) {
  const { bookingId, firstName, carName, pickupAt, reason, refundAmount, refundPolicy } = data;
  const friendlyReason = CANCELLATION_REASON_MESSAGES[reason] || 'Your booking has been cancelled.';

  let refundLine = 'No refund is applicable for this cancellation.';
  if (refundAmount && refundAmount > 0) {
    refundLine = `A refund of <strong>${inr(refundAmount)}</strong> has been initiated and will be credited to your original payment method within 5–7 business days.`;
    if (refundPolicy === 'late_cancellation') {
      refundLine += ' (Cancellations within 24 hours of pickup are refunded at 50%.)';
    }
  }

  return layout('Booking Cancelled', `
      ${greeting(firstName)}
      <p style="font-size: 16px; color: #333;">Your booking has been cancelled.</p>
      ${infoBox([
        ['Booking ID', bookingId],
        carName && ['Car', carName],
        pickupAt && ['Was due for pickup', formatDateTime(pickupAt)],
        ['Reason', friendlyReason],
      ])}
      <p style="font-size: 15px; color: #555;">${refundLine}</p>
  `, `We hope to see you on the road again soon.<br/><strong>Team ${BRAND}</strong>`);
}

module.exports = {
  BRAND,
  getOtpTemplate,
  getWelcomeTemplate,
  getBookingConfirmedTemplate,
  getBookingFailedTemplate,
  getBookingCancelledTemplate,
};

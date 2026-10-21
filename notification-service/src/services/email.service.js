const sgMail = require('@sendgrid/mail');
const logger = require('../config/logger');
const { config } = require('../config');
const {
     BRAND,
     getOtpTemplate,
     getWelcomeTemplate,
     getBookingConfirmedTemplate,
     getBookingFailedTemplate,
     getBookingCancelledTemplate,
} = require('../templates');

sgMail.setApiKey(config.SENDGRID_API_KEY);

class EmailService {
     constructor() {
          this.from = { email: config.MAIL_SEND, name: BRAND };
          this.maxRetries = 3;
     }

     async sendWithRetry(msg, retries = 0) {
          try {
               await sgMail.send(msg);
               logger.info(`Email sent successfully to ${msg.to}`, {
                    subject: msg.subject,
                    attempt: retries + 1
               });
               return { success: true };
          } catch (error) {
               logger.error(`Email sending failed (attempt ${retries + 1}/${this.maxRetries})`, {
                    to: msg.to,
                    error: error.message,
                    code: error.code,
               });

               if (retries < this.maxRetries - 1) {
                    const delay = Math.pow(2, retries) * 1000;
                    await new Promise(resolve => setTimeout(resolve, delay));
                    return this.sendWithRetry(msg, retries + 1);
               }

               throw error;
          }
     }

     async sendOtpEmail(email, otp, ttlMinutes) {
          const msg = {
               to: email,
               from: this.from,
               subject: `Your ${BRAND} verification code`,
               html: getOtpTemplate(otp, ttlMinutes),
          };

          return this.sendWithRetry(msg);
     }

     async sendWelcomeEmail(email, firstName) {
          const msg = {
               to: email,
               from: this.from,
               subject: `Welcome to ${BRAND} - Email Verified`,
               html: getWelcomeTemplate(firstName),
          };

          return this.sendWithRetry(msg);
     }

     async sendBookingConfirmedEmail(email, bookingData) {
          const msg = {
               to: email,
               from: this.from,
               subject: bookingData.type === 'SEAT'
                    ? `Seats Confirmed - ${bookingData.fromStopName} → ${bookingData.toStopName} | ${BRAND}`
                    : `Booking Confirmed - ${bookingData.carName || 'Your Rental'} | ${BRAND}`,
               html: getBookingConfirmedTemplate(bookingData),
          };

          return this.sendWithRetry(msg);
     }

     async sendBookingFailedEmail(email, bookingData) {
          const msg = {
               to: email,
               from: this.from,
               subject: `Booking Unsuccessful - Please Try Again | ${BRAND}`,
               html: getBookingFailedTemplate(bookingData),
          };

          return this.sendWithRetry(msg);
     }

     async sendBookingCancelledEmail(email, bookingData) {
          const msg = {
               to: email,
               from: this.from,
               subject: `Booking Cancelled - Refund Update | ${BRAND}`,
               html: getBookingCancelledTemplate(bookingData),
          };

          return this.sendWithRetry(msg);
     }
}

module.exports = new EmailService();
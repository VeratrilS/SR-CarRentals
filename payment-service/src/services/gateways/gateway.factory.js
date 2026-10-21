const { config } = require('../../config');
const RazorpayGateway = require('./razorpay.gateway');

/**
 * Factory Method + Singleton: payment.service asks for "the gateway" and gets
 * a BaseGateway; it never knows which provider class was built.
 * One gateway instance per process.
 *
 * To add a new gateway (e.g., Stripe):
 *   1. Create stripe.gateway.js extending BaseGateway (an Adapter over Stripe's SDK)
 *   2. Register its creator below
 *   3. Set PAYMENT_GATEWAY=stripe in .env
 */
const CREATORS = {
     razorpay: () => new RazorpayGateway(
          config.RAZORPAY_KEY_ID,
          config.RAZORPAY_KEY_SECRET,
          config.RAZORPAY_WEBHOOK_SECRET
     ),
     // stripe: () => new StripeGateway(config.STRIPE_KEY, ...),
};

let gatewayInstance = null;

function getGateway() {
     if (gatewayInstance) return gatewayInstance;

     const create = CREATORS[config.PAYMENT_GATEWAY];
     if (!create) {
          throw new Error(`Unknown payment gateway provider: ${config.PAYMENT_GATEWAY}`);
     }

     gatewayInstance = create();
     return gatewayInstance;
}

module.exports = { getGateway };

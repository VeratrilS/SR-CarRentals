const { config } = require('../config');
const { CircuitBreaker } = require('./circuitBreaker');

/**
 * Service Registry — the single place that knows which downstream services
 * exist, where they live and which circuit breaker guards each one.
 * Routes refer to a service only by its key, so adding a service is one line here.
 */
const SERVICES = {
     userService: { name: 'user-service', url: config.SERVICES.USER_SERVICE_URL },
     searchService: { name: 'search-service', url: config.SERVICES.SEARCH_SERVICE_URL },
     adminService: { name: 'admin-service', url: config.SERVICES.ADMIN_SERVICE_URL },
     notificationService: { name: 'notification-service', url: config.SERVICES.NOTIFICATION_SERVICE_URL },
     bookingService: { name: 'booking-service', url: config.SERVICES.BOOKING_SERVICE_URL },
     paymentService: { name: 'payment-service', url: config.SERVICES.PAYMENT_SERVICE_URL },
     inventoryService: { name: 'inventory-service', url: config.SERVICES.INVENTORY_SERVICE_URL },
};

const registry = new Map(
     Object.entries(SERVICES).map(([key, svc]) => [key, { ...svc, breaker: new CircuitBreaker(svc.name) }])
);

function getService(key) {
     const service = registry.get(key);
     if (!service) {
          throw new Error(`Unknown service: ${key}`);
     }
     return service;
}

const listServices = () => [...registry.values()];

module.exports = { getService, listServices };

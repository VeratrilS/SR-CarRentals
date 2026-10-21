export const APP_NAME = 'SR-CarRentals';

export const CAR_CATEGORIES = ['HATCHBACK', 'SEDAN', 'SUV', 'MUV', 'LUXURY'];

export const CATEGORY_LABELS = {
  HATCHBACK: 'Hatchback',
  SEDAN: 'Sedan',
  SUV: 'SUV',
  MUV: 'MUV / 7-seater',
  LUXURY: 'Luxury',
};

export const CATEGORY_ICONS = {
  HATCHBACK: '🚗',
  SEDAN: '🚘',
  SUV: '🚙',
  MUV: '🚐',
  LUXURY: '🏎️',
};

export const TRANSMISSIONS = ['MANUAL', 'AUTOMATIC'];
export const FUEL_TYPES = ['PETROL', 'DIESEL', 'CNG', 'ELECTRIC', 'HYBRID'];
export const CAR_STATUSES = ['ACTIVE', 'MAINTENANCE', 'RETIRED'];

export const SORT_OPTIONS = [
  { value: 'price_asc', label: 'Price: low to high' },
  { value: 'price_desc', label: 'Price: high to low' },
  { value: 'newest', label: 'Newest models' },
  { value: 'seats', label: 'Most seats' },
];

export const BOOKING_REASON_MESSAGES = {
  user_cancelled: 'You cancelled this booking.',
  car_unavailable: 'The car was taken off the fleet (maintenance). You were not charged, or have been fully refunded.',
  booking_timeout: 'Payment was not completed in time, so the car was released.',
  payment_failed: 'The payment did not go through.',
  late_payment: 'Payment arrived after the hold expired and has been refunded.',
};

// Mirrors booking-service pricing rules (the server quote is authoritative)
export const LONG_RENTAL_MIN_DAYS = 7;
export const LONG_RENTAL_DISCOUNT_PCT = 10;
export const FREE_CANCELLATION_HOURS = 24;

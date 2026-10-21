import { format, parseISO } from 'date-fns';
import { CATEGORY_LABELS } from './constants';

const toDate = (v) => (typeof v === 'string' ? parseISO(v) : v);

export function formatDate(dateStr) {
  if (!dateStr) return '—';
  try {
    return format(toDate(dateStr), 'dd MMM yyyy');
  } catch {
    return dateStr;
  }
}

export function formatDateTime(dateStr) {
  if (!dateStr) return '—';
  try {
    return format(toDate(dateStr), 'dd MMM yyyy, hh:mm a');
  } catch {
    return dateStr;
  }
}

export function formatShortDateTime(dateStr) {
  if (!dateStr) return '—';
  try {
    return format(toDate(dateStr), 'EEE, dd MMM · hh:mm a');
  } catch {
    return dateStr;
  }
}

export function formatCurrency(amount) {
  if (amount == null) return '—';
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatCategory(category) {
  return CATEGORY_LABELS[category] || category;
}

const ACRONYMS = new Set(['CNG', 'SUV', 'MUV', 'EV']);

export function titleCase(value) {
  if (!value) return '';
  if (ACRONYMS.has(value)) return value;
  return value.charAt(0) + value.slice(1).toLowerCase();
}

/** Date → value for <input type="datetime-local"> in the user's local time. */
export function toLocalInputValue(date) {
  const d = new Date(date);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Default search window: tomorrow 10:00 → day after 10:00 (local time). */
export function defaultRentalWindow() {
  const pickup = new Date();
  pickup.setDate(pickup.getDate() + 1);
  pickup.setHours(10, 0, 0, 0);
  const dropoff = new Date(pickup);
  dropoff.setDate(dropoff.getDate() + 2);
  return { pickupAt: toLocalInputValue(pickup), dropoffAt: toLocalInputValue(dropoff) };
}

/** Billable rental days: every started 24h block counts, after a 30-minute grace period. */
export function rentalDays(pickupAt, dropoffAt) {
  const hours = (new Date(dropoffAt) - new Date(pickupAt)) / 36e5 - 0.5;
  return Math.max(1, Math.ceil(hours / 24));
}

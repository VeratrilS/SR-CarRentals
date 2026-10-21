import { useState, useEffect, useRef, useCallback } from 'react';
import { bookingApi } from '../api/booking.api';

const TERMINAL_STATUSES = ['CONFIRMED', 'CANCELLED', 'FAILED', 'EXPIRED'];
const POLL_INTERVAL = 3000;
const MAX_POLLS = 40;              // ~2 minutes of watching an in-progress booking
const MAX_CONSECUTIVE_ERRORS = 3;  // tolerate brief network blips while polling

/**
 * Loads a booking and keeps polling while it is still in progress.
 * `refresh()` reloads immediately and restarts polling (e.g. after a payment attempt).
 */
export function useBookingPolling(bookingId) {
  const [booking, setBooking] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const pollCount = useRef(0);
  const errorCount = useRef(0);
  const intervalRef = useRef(null);

  const stop = () => clearInterval(intervalRef.current);

  const fetchBooking = useCallback(async () => {
    try {
      const res = await bookingApi.getById(bookingId);
      const data = res.data || res;
      setBooking(data);
      setError(null);
      setLoading(false);
      errorCount.current = 0;

      pollCount.current += 1;
      if (TERMINAL_STATUSES.includes(data.status) || pollCount.current >= MAX_POLLS) stop();
    } catch (err) {
      errorCount.current += 1;
      setLoading(false);
      // A 404/403 is final; for network/server errors keep trying a few times
      if (err.status === 404 || err.status === 403 || err.sessionExpired || errorCount.current >= MAX_CONSECUTIVE_ERRORS) {
        setError(err);
        stop();
      }
    }
  }, [bookingId]);

  const start = useCallback(() => {
    stop();
    pollCount.current = 0;
    errorCount.current = 0;
    fetchBooking();
    intervalRef.current = setInterval(fetchBooking, POLL_INTERVAL);
  }, [fetchBooking]);

  useEffect(() => {
    if (!bookingId) return undefined;
    setLoading(true);
    start();
    return stop;
  }, [bookingId, start]);

  return { booking, loading, error, refresh: start };
}

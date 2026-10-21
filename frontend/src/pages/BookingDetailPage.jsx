import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useBookingPolling } from '../hooks/useBookingPolling';
import { useCheckout } from '../hooks/useCheckout';
import { bookingApi } from '../api/booking.api';
import { useToast } from '../components/ui/Toast';
import Badge from '../components/ui/Badge';
import Button from '../components/ui/Button';
import Modal from '../components/ui/Modal';
import Spinner from '../components/ui/Spinner';
import ErrorState from '../components/ui/ErrorState';
import BookingStatusPoller from '../components/booking/BookingStatusPoller';
import BookingSummary from '../components/booking/BookingSummary';
import SeatBookingSummary from '../components/booking/SeatBookingSummary';
import HoldCountdown from '../components/booking/HoldCountdown';
import { formatDateTime, formatCurrency } from '../utils/format';
import { BOOKING_REASON_MESSAGES } from '../utils/constants';

export default function BookingDetailPage() {
  const { bookingId } = useParams();
  const { booking, loading, error, refresh } = useBookingPolling(bookingId);
  const [showCancel, setShowCancel] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [paying, setPaying] = useState(false);
  const startCheckout = useCheckout();
  const showToast = useToast();

  const handleCancel = async () => {
    setCancelling(true);
    try {
      const res = await bookingApi.cancel(bookingId);
      const r = res.data || res;
      showToast(
        r.refundAmount > 0 ? `Booking cancelled — ${formatCurrency(r.refundAmount)} refund initiated` : 'Booking cancelled',
        'success'
      );
      setShowCancel(false);
      refresh();
    } catch (err) {
      showToast(err.message || 'Failed to cancel', 'error');
    } finally {
      setCancelling(false);
    }
  };

  const handleResumePayment = async () => {
    setPaying(true);
    try {
      await startCheckout({
        bookingId: booking.id,
        payment: booking.payment,
        description: `${booking.carName} · ${booking.rentalDays} day(s)`,
        onDone: refresh,
      });
    } catch (err) {
      showToast(err.message || 'Could not open payment', 'error');
    } finally {
      setPaying(false);
    }
  };

  if (loading) {
    return <div className="flex justify-center py-20"><Spinner size="lg" /></div>;
  }

  if (error) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-8">
        <ErrorState
          title={error.status === 404 ? 'Booking not found' : "Couldn't load this booking"}
          message={error.status === 404 ? 'It may belong to another account, or the link is wrong.' : error.message}
          onRetry={error.status === 404 ? undefined : refresh}
        />
        <p className="text-center mt-4"><Link to="/bookings" className="text-sm text-primary-700 dark:text-primary-400 hover:underline">← Back to my trips</Link></p>
      </div>
    );
  }

  if (!booking) return null;

  const canCancel = ['CONFIRMED', 'PAYMENT_PENDING', 'CAR_HELD'].includes(booking.status)
    && (booking.status !== 'CONFIRMED' || booking.cancellationPreview?.refundable);
  const preview = booking.cancellationPreview;
  const reason = BOOKING_REASON_MESSAGES[booking.failureReason] || booking.failureReason;
  const isSeat = booking.type === 'SEAT';
  const rebookUrl = isSeat ? '/rides' : `/search?${new URLSearchParams({ location: booking.city })}`;

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 animate-fade-in-up">
      <Link to="/bookings" className="text-sm text-primary-700 dark:text-primary-400 hover:underline">← My trips</Link>
      <div className="flex items-center justify-between mt-2 mb-6">
        <h1 className="text-2xl font-bold">Booking details</h1>
        <Badge status={booking.status} />
      </div>

      {/* Car held, waiting for payment — let the customer finish paying */}
      {booking.status === 'PAYMENT_PENDING' && booking.payment ? (
        <div className="bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 rounded-xl p-5 mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <p className="font-semibold text-amber-900 dark:text-amber-200">
              {isSeat ? 'Your seats are held' : 'Your car is held'} — complete payment to confirm
            </p>
            <p className="text-sm text-amber-800 dark:text-amber-200 mt-0.5">
              Hold expires in <HoldCountdown until={booking.lockExpiresAt} onExpire={refresh} />
            </p>
          </div>
          <Button onClick={handleResumePayment} loading={paying} className="shrink-0">
            Complete payment {formatCurrency(booking.totalAmount)}
          </Button>
        </div>
      ) : (
        <BookingStatusPoller status={booking.status} />
      )}

      {booking.status === 'CONFIRMED' && (
        <div className="bg-green-50 dark:bg-green-950/40 border border-green-200 dark:border-green-900 rounded-xl p-4 flex items-center gap-3 mb-6">
          <span className="text-2xl">✓</span>
          <div>
            <p className="font-semibold text-green-800 dark:text-green-200">{isSeat ? 'Your seats are confirmed!' : 'Your car is confirmed!'}</p>
            <p className="text-sm text-green-700 dark:text-green-300">
              {isSeat ? 'Reach your boarding point 10 minutes early with a photo ID.' : 'Bring your driving licence and a photo ID to the branch at pickup.'}
            </p>
          </div>
        </div>
      )}

      {['CANCELLED', 'EXPIRED', 'FAILED'].includes(booking.status) && (
        <div className="bg-gray-50 dark:bg-gray-800/60 border border-gray-200 dark:border-gray-700 rounded-xl p-4 mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="text-sm text-gray-700 dark:text-gray-200">
            {reason && <p className="font-medium text-gray-900 dark:text-gray-100">{reason}</p>}
            {booking.refundAmount > 0 && (
              <p className="mt-0.5">Refund of <strong>{formatCurrency(booking.refundAmount)}</strong> initiated to your original payment method.</p>
            )}
          </div>
          <Link to={rebookUrl} className="shrink-0"><Button variant="secondary">{isSeat ? 'Find another ride' : 'Find another car'}</Button></Link>
        </div>
      )}

      {isSeat ? <SeatBookingSummary booking={booking} /> : <BookingSummary data={booking} title="Your rental" />}

      <div className="card mb-6">
        <h3 className="font-semibold mb-3">{isSeat ? 'Booking' : 'Driver & booking'}</h3>
        <div className="grid grid-cols-2 gap-4 text-sm">
          {booking.driver && (
            <>
              <div>
                <p className="text-gray-500 dark:text-gray-400">Driver</p>
                <p className="font-medium">{booking.driver.name} ({booking.driver.age})</p>
              </div>
              <div>
                <p className="text-gray-500 dark:text-gray-400">Licence</p>
                <p className="font-mono">{booking.driver.licenseNumber}</p>
              </div>
              <div>
                <p className="text-gray-500 dark:text-gray-400">Mobile</p>
                <p>{booking.driver.phone}</p>
              </div>
            </>
          )}
          <div>
            <p className="text-gray-500 dark:text-gray-400">Booked on</p>
            <p>{formatDateTime(booking.createdAt)}</p>
          </div>
          <div className="col-span-2">
            <p className="text-gray-500 dark:text-gray-400">Booking ID</p>
            <p className="font-mono text-xs">{booking.id}</p>
          </div>
        </div>
      </div>

      {canCancel && (
        <Button variant="danger" onClick={() => setShowCancel(true)} className="w-full">
          Cancel booking
        </Button>
      )}

      <Modal
        open={showCancel}
        onClose={() => setShowCancel(false)}
        title="Cancel this booking?"
        confirmText="Yes, cancel"
        onConfirm={handleCancel}
        loading={cancelling}
        danger
      >
        {booking.status === 'CONFIRMED' && preview ? (
          preview.policy === 'full_refund'
            ? <>You'll get a <strong>full refund of {formatCurrency(preview.refundAmount)}</strong> (more than 24h before pickup).</>
            : <>Pickup is less than 24 hours away, so you'll get a <strong>50% refund of {formatCurrency(preview.refundAmount)}</strong>.</>
        ) : (
          'The car will be released. You have not been charged.'
        )}
      </Modal>
    </div>
  );
}

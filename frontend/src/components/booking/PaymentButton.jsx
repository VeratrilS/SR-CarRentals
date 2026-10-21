import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { bookingApi } from '../../api/booking.api';
import { useCheckout } from '../../hooks/useCheckout';
import { useToast } from '../ui/Toast';
import Button from '../ui/Button';
import { formatCurrency } from '../../utils/format';

export default function PaymentButton({ carId, pickupAt, dropoffAt, getDriver, amount, disabled }) {
  const [loading, setLoading] = useState(false);
  // One key per page visit: double-clicks / retries reuse the same booking
  const idempotencyKey = useRef(crypto.randomUUID());
  const startCheckout = useCheckout();
  const navigate = useNavigate();
  const showToast = useToast();

  const handlePay = async () => {
    setLoading(true);
    try {
      const res = await bookingApi.create({
        carId,
        pickupAt,
        dropoffAt,
        driver: getDriver(),
        idempotencyKey: idempotencyKey.current,
      });
      const booking = res.data || res;

      if (!booking.paymentOrder?.gatewayOrderId) {
        showToast('Booking created but payment order missing', 'warning');
        navigate(`/bookings/${booking.bookingId}`);
        return;
      }

      await startCheckout({
        bookingId: booking.bookingId,
        payment: booking.paymentOrder,
        description: `${booking.carName} · ${booking.rentalDays} day(s)`,
      });
    } catch (err) {
      showToast(err.message || 'Booking failed', 'error');
      // A failed attempt must not be replayed from the idempotency cache
      idempotencyKey.current = crypto.randomUUID();
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button onClick={handlePay} loading={loading} disabled={disabled} className="w-full text-base py-3">
      Confirm & pay {amount != null && formatCurrency(amount)}
    </Button>
  );
}

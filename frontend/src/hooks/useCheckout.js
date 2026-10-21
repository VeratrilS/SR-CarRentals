import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/auth.store';
import { useBookingStore } from '../store/booking.store';
import { bookingApi } from '../api/booking.api';
import { loadRazorpayScript, openRazorpayCheckout } from '../utils/razorpay';
import { useToast } from '../components/ui/Toast';

/**
 * Opens Razorpay checkout for a booking and handles every outcome.
 * Used for the first payment attempt and for resuming payment on a held booking.
 *
 * payment: { gatewayOrderId, amount, currency, keyId }
 */
export function useCheckout() {
  const user = useAuthStore((s) => s.user);
  const reset = useBookingStore((s) => s.reset);
  const navigate = useNavigate();
  const showToast = useToast();

  return async function startCheckout({ bookingId, payment, description, onDone }) {
    const finish = () => {
      reset();
      if (onDone) onDone();
      else navigate(`/bookings/${bookingId}`);
    };

    await loadRazorpayScript();

    openRazorpayCheckout({
      keyId: payment.keyId,
      orderId: payment.gatewayOrderId,
      amount: payment.amount,
      currency: payment.currency || 'INR',
      bookingDescription: description,
      user,
      onSuccess: async (response) => {
        try {
          await bookingApi.verifyPayment(bookingId, {
            razorpayPaymentId: response.razorpay_payment_id,
            razorpaySignature: response.razorpay_signature,
          });
          showToast('Payment verified! Confirming your car...', 'success');
        } catch {
          showToast('Payment received. Confirmation may take a moment.', 'warning');
        }
        finish();
      },
      onDismiss: () => {
        showToast('Payment not completed. The car stays held for a few minutes — you can pay from the booking page.', 'warning');
        finish();
      },
      onFailure: (response) => {
        showToast('Payment failed: ' + (response?.error?.description || 'Unknown error'), 'error');
        finish();
      },
    });
  };
}

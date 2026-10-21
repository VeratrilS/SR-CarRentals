import Spinner from '../ui/Spinner';

const PROCESSING_STATUSES = ['PENDING', 'CAR_HELD', 'PAYMENT_PENDING', 'CONFIRMING'];

export default function BookingStatusPoller({ status }) {
  if (!PROCESSING_STATUSES.includes(status)) return null;

  const messages = {
    PENDING: 'Creating your booking...',
    CAR_HELD: 'Reserved for you, awaiting payment...',
    PAYMENT_PENDING: 'Car held — complete payment to confirm...',
    CONFIRMING: 'Payment received, confirming your booking...',
  };

  return (
    <div className="bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900 rounded-lg p-4 flex items-center gap-3">
      <Spinner size="sm" />
      <div>
        <p className="text-sm font-semibold text-blue-800 dark:text-blue-200">{messages[status] || 'Processing...'}</p>
        <p className="text-xs text-blue-600 dark:text-blue-400 mt-0.5">This page will update automatically</p>
      </div>
    </div>
  );
}

import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { bookingApi } from '../api/booking.api';
import BookingSummary from '../components/booking/BookingSummary';
import DriverForm from '../components/booking/DriverForm';
import PaymentButton from '../components/booking/PaymentButton';
import Spinner from '../components/ui/Spinner';
import ErrorState from '../components/ui/ErrorState';
import { FREE_CANCELLATION_HOURS } from '../utils/constants';

/**
 * /book/:carId?pickupAt=…&dropoffAt=…
 * Everything needed is in the URL, so the page survives a refresh or a login redirect.
 */
export default function BookingPage() {
  const { carId } = useParams();
  const [searchParams] = useSearchParams();
  const pickupAt = searchParams.get('pickupAt');
  const dropoffAt = searchParams.get('dropoffAt');

  const [quote, setQuote] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const { register, formState: { errors, isValid }, getValues } = useForm({ mode: 'onChange' });

  const loadQuote = () => {
    if (!pickupAt || !dropoffAt) {
      setError('Missing rental dates — please search again.');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    bookingApi.quote(carId, pickupAt, dropoffAt)
      .then((res) => setQuote(res.data || res))
      .catch((err) => setError(err.message || 'Could not load this car'))
      .finally(() => setLoading(false));
  };

  useEffect(loadQuote, [carId, pickupAt, dropoffAt]);

  if (loading) {
    return <div className="flex justify-center py-20"><Spinner size="lg" /></div>;
  }

  if (error) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-12">
        <ErrorState title="Couldn't load this car" message={error} onRetry={pickupAt && dropoffAt ? loadQuote : undefined} />
        <p className="text-center mt-4"><Link to="/search" className="text-sm text-primary-700 dark:text-primary-400 hover:underline">← Back to search</Link></p>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <Link to="/search" className="text-sm text-primary-700 dark:text-primary-400 hover:underline">← Back to results</Link>
      <h1 className="text-2xl font-bold mt-2 mb-6">Complete your booking</h1>

      {!quote.available && (
        <div className="bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 text-amber-800 dark:text-amber-200 rounded-lg p-4 mb-6 text-sm">
          This car was just reserved by someone else for part of these dates. Please pick another car or change your dates.
        </div>
      )}

      <BookingSummary data={quote} />

      <div className="card mb-6">
        <form onSubmit={(e) => e.preventDefault()}>
          <DriverForm register={register} errors={errors} minAge={quote.minDriverAge} />
        </form>
      </div>

      <p className="text-xs text-gray-500 dark:text-gray-400 mb-3 text-center">
        Free cancellation up to {FREE_CANCELLATION_HOURS} hours before pickup · 50% refund after that, until pickup.
      </p>

      <PaymentButton
        carId={carId}
        pickupAt={pickupAt}
        dropoffAt={dropoffAt}
        getDriver={() => getValues('driver')}
        amount={quote.totalAmount}
        disabled={!isValid || !quote.available}
      />
    </div>
  );
}

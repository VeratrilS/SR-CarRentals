import { Link } from 'react-router-dom';
import { formatDistanceToNowStrict } from 'date-fns';
import Badge from '../ui/Badge';
import { formatShortDateTime, formatCurrency } from '../../utils/format';
import CarImage, { carImageFor } from '../ui/CarImage';

/** "Pickup in 3 days" / "On trip — return in 5 hours" / null */
function tripTiming(booking) {
  if (booking.status !== 'CONFIRMED') return null;
  const now = new Date();
  const pickup = new Date(booking.pickupAt);
  const dropoff = new Date(booking.dropoffAt);
  if (now < pickup) return { text: `Pickup in ${formatDistanceToNowStrict(pickup)}`, tone: 'text-primary-700 dark:text-primary-400 bg-primary-50 dark:bg-primary-950/50' };
  if (now < dropoff) return { text: `On trip · return in ${formatDistanceToNowStrict(dropoff)}`, tone: 'text-amber-800 dark:text-amber-200 bg-amber-50 dark:bg-amber-950/40' };
  return { text: 'Completed', tone: 'text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-800' };
}

export default function BookingCard({ booking }) {
  const timing = tripTiming(booking);
  const isSeat = booking.type === 'SEAT';

  return (
    <Link to={`/bookings/${booking.id}`} className="group card card-interactive block p-4 sm:p-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-start gap-4">
          <CarImage src={carImageFor(booking.carName)} alt={booking.carName} category={booking.category} zoomOnHover className="h-20 w-28 sm:w-32 shrink-0 rounded-xl" />
          <div>
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <h3 className="font-semibold text-gray-900 dark:text-gray-100">
                {isSeat ? `${booking.fromStopName} → ${booking.toStopName}` : booking.carName}
              </h3>
              <span className={`text-[11px] font-bold uppercase tracking-wide rounded-md px-1.5 py-0.5 ${isSeat ? 'bg-sky-100 text-sky-800 dark:bg-sky-500/15 dark:text-sky-300' : 'bg-primary-50 text-primary-700 dark:bg-primary-500/15 dark:text-primary-300'}`}>
                {isSeat ? 'Seat' : 'Rental'}
              </span>
              <Badge status={booking.status} />
              {timing && <span className={`text-xs font-semibold rounded-full px-2.5 py-0.5 ${timing.tone}`}>{timing.text}</span>}
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {isSeat ? `💺 Seat ${booking.seatNumbers?.join(', ')} · ${booking.carName}` : `📍 ${booking.branchName}, ${booking.city}`}
            </p>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {formatShortDateTime(booking.pickupAt)} → {formatShortDateTime(booking.dropoffAt)}
            </p>
          </div>
        </div>
        <div className="text-right">
          <p className="font-bold text-lg text-primary-800 dark:text-primary-300">{formatCurrency(booking.totalAmount)}</p>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {isSeat
              ? `${booking.seatNumbers?.length} seat${booking.seatNumbers?.length !== 1 ? 's' : ''}`
              : `${booking.rentalDays} day${booking.rentalDays !== 1 ? 's' : ''}`}
          </p>
        </div>
      </div>
    </Link>
  );
}

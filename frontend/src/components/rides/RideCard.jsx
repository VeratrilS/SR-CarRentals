import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { useAuthStore } from '../../store/auth.store';
import CarImage from '../ui/CarImage';
import Button from '../ui/Button';
import { formatCurrency } from '../../utils/format';

const time = (t) => format(new Date(t), 'hh:mm a');
const duration = (min) => `${Math.floor(min / 60)}h ${String(min % 60).padStart(2, '0')}m`;

export default function RideCard({ ride, seats, index = 0 }) {
  const navigate = useNavigate();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const path = `/rides/${ride.tripId}?${new URLSearchParams({ from: ride.fromStop.sequence, to: ride.toStop.sequence, seats })}`;

  const select = () => navigate(isAuthenticated ? path : `/login?redirect=${encodeURIComponent(path)}`);
  const few = ride.seatsLeft !== null && ride.seatsLeft <= 2;

  return (
    <div className="group card card-interactive p-0 overflow-hidden animate-fade-in-up" style={{ animationDelay: `${Math.min(index, 8) * 60}ms` }}>
      <div className="flex flex-col sm:flex-row">
        <CarImage src={ride.car.imageUrl} alt={`${ride.car.make} ${ride.car.model}`} category={ride.car.category} zoomOnHover className="h-40 sm:h-auto sm:w-52 shrink-0" />

        <div className="flex-1 p-5 grid gap-4 sm:grid-cols-[1fr_auto] items-center">
          <div>
            {/* Timeline */}
            <div className="flex items-center gap-3">
              <div>
                <p className="text-2xl font-extrabold text-gray-900 dark:text-white">{time(ride.fromStop.time)}</p>
                <p className="text-sm font-medium text-gray-700 dark:text-gray-300">{ride.fromStop.name}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">{ride.fromStop.city}</p>
              </div>
              <div className="flex-1 min-w-[80px] text-center px-1">
                <p className="text-xs font-semibold text-gray-600 dark:text-gray-400">{duration(ride.durationMinutes)}</p>
                <div className="relative my-1 h-0.5 bg-gray-200 dark:bg-gray-700">
                  <span className="absolute -left-1 -top-1 h-2.5 w-2.5 rounded-full bg-primary-600" />
                  <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full border-2 border-primary-600 bg-white dark:bg-gray-900" />
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {ride.distanceKm} km{ride.stopsInBetween > 0 ? ` · ${ride.stopsInBetween} stop${ride.stopsInBetween > 1 ? 's' : ''}` : ' · direct'}
                </p>
              </div>
              <div className="text-right">
                <p className="text-2xl font-extrabold text-gray-900 dark:text-white">{time(ride.toStop.time)}</p>
                <p className="text-sm font-medium text-gray-700 dark:text-gray-300">{ride.toStop.name}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">{ride.toStop.city}</p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 mt-4 text-xs">
              <span className="rounded-full bg-gray-100 dark:bg-gray-800 px-2.5 py-1 font-medium text-gray-700 dark:text-gray-300">🚗 {ride.car.make} {ride.car.model}</span>
              <span className="rounded-full bg-gray-100 dark:bg-gray-800 px-2.5 py-1 font-medium text-gray-700 dark:text-gray-300">👤 Driver: {ride.driverName}</span>
              <span className="text-gray-500 dark:text-gray-400">{ride.routeName}</span>
            </div>
          </div>

          <div className="sm:text-right sm:border-l sm:border-gray-100 sm:dark:border-gray-800 sm:pl-5">
            <p className="text-2xl font-extrabold text-gray-900 dark:text-white">{formatCurrency(ride.seatFare)}<span className="text-sm font-medium text-gray-500 dark:text-gray-400">/seat</span></p>
            {ride.seatsLeft !== null && (
              <p className={`text-sm font-semibold mt-0.5 ${few ? 'text-red-600 dark:text-red-400' : 'text-green-700 dark:text-green-400'}`}>
                {few ? `Only ${ride.seatsLeft} left!` : `${ride.seatsLeft} of ${ride.passengerSeats} seats left`}
              </p>
            )}
            <Button onClick={select} className="mt-3 w-full sm:w-auto">Select seats →</Button>
          </div>
        </div>
      </div>
    </div>
  );
}

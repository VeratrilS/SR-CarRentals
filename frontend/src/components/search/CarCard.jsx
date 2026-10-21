import { useNavigate } from 'react-router-dom';
import { useBookingStore } from '../../store/booking.store';
import { useAuthStore } from '../../store/auth.store';
import { formatCategory, formatCurrency, titleCase } from '../../utils/format';
import { LONG_RENTAL_MIN_DAYS, LONG_RENTAL_DISCOUNT_PCT } from '../../utils/constants';
import Button from '../ui/Button';
import CarImage from '../ui/CarImage';

const HIGHLIGHT_STYLES = {
  best: 'bg-green-600 text-white',
  ev: 'bg-emerald-500 text-white',
  new: 'bg-blue-600 text-white',
  luxury: 'bg-gray-900 text-amber-300',
  family: 'bg-purple-600 text-white',
};

/** Up to two eye-catching labels for the photo corner. */
function highlightsFor(car, isBestPrice) {
  const tags = [];
  if (isBestPrice) tags.push({ key: 'best', text: '★ Best price' });
  if (car.fuelType === 'ELECTRIC') tags.push({ key: 'ev', text: '⚡ Electric' });
  if (car.category === 'LUXURY') tags.push({ key: 'luxury', text: '♛ Luxury' });
  if (car.seats >= 7) tags.push({ key: 'family', text: '👨‍👩‍👧 7-seater' });
  if (car.year >= new Date().getFullYear() - 1) tags.push({ key: 'new', text: 'New' });
  return tags.slice(0, 2);
}

function Spec({ icon, children }) {
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-full px-2.5 py-1">
      <span aria-hidden>{icon}</span>{children}
    </span>
  );
}

export default function CarCard({ car, pickupAt, dropoffAt, index = 0, isBestPrice = false }) {
  const navigate = useNavigate();
  const selectCar = useBookingStore((s) => s.selectCar);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  const bookingPath = `/book/${car.carId}?pickupAt=${encodeURIComponent(pickupAt)}&dropoffAt=${encodeURIComponent(dropoffAt)}`;

  const handleBook = () => {
    selectCar(car, pickupAt, dropoffAt);
    if (!isAuthenticated) {
      navigate(`/login?redirect=${encodeURIComponent(bookingPath)}`);
      return;
    }
    navigate(bookingPath);
  };

  const discounted = car.rentalDays >= LONG_RENTAL_MIN_DAYS;
  const tags = highlightsFor(car, isBestPrice);

  return (
    <div
      className="group card card-interactive p-0 overflow-hidden flex flex-col animate-fade-in-up"
      style={{ animationDelay: `${Math.min(index, 8) * 60}ms` }}
    >
      <div className="relative">
        <CarImage
          src={car.imageUrl}
          alt={`${car.make} ${car.model}`}
          category={car.category}
          zoomOnHover
          className="h-48"
        />
        <div className="absolute top-3 left-3 flex flex-wrap gap-1.5">
          {tags.map((t) => (
            <span key={t.key} className={`text-[11px] font-bold px-2 py-1 rounded-md shadow-md ${HIGHLIGHT_STYLES[t.key]}`}>
              {t.text}
            </span>
          ))}
        </div>
        <span className="absolute bottom-3 left-3 text-[11px] font-semibold uppercase tracking-wider px-2 py-1 rounded-md bg-white/90 text-gray-800 backdrop-blur dark:bg-gray-900/80 dark:text-gray-100">
          {formatCategory(car.category)}
        </span>
      </div>

      <div className="p-5 flex flex-col flex-1">
        <h3 className="text-lg font-bold text-gray-900 dark:text-gray-50 leading-tight">
          {car.make} {car.model}
          <span className="ml-1.5 text-sm font-medium text-gray-500 dark:text-gray-400">{car.year}</span>
        </h3>
        <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">📍 {car.branch?.name}, {car.branch?.city}</p>

        <div className="flex flex-wrap gap-1.5 mt-3 mb-4">
          <Spec icon="⚙️">{titleCase(car.transmission)}</Spec>
          <Spec icon={car.fuelType === 'ELECTRIC' ? '🔌' : '⛽'}>{titleCase(car.fuelType)}</Spec>
          <Spec icon="👥">{car.seats} seats</Spec>
        </div>

        <div className="mt-auto pt-4 flex items-end justify-between gap-3 border-t border-gray-100 dark:border-gray-800">
          <div>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              <span className="text-2xl font-extrabold text-gray-900 dark:text-gray-50">{formatCurrency(car.dailyRate)}</span>/day
            </p>
            {car.estimatedTotal != null && (
              <p className="text-xs text-gray-600 dark:text-gray-400">
                {formatCurrency(car.estimatedTotal)} total · {car.rentalDays} day{car.rentalDays > 1 ? 's' : ''}
                {discounted && <span className="ml-1 font-semibold text-green-700 dark:text-green-400">(−{LONG_RENTAL_DISCOUNT_PCT}%)</span>}
              </p>
            )}
          </div>
          <Button onClick={handleBook} className="shrink-0">Book now →</Button>
        </div>
      </div>
    </div>
  );
}

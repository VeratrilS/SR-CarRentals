import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import SearchForm from '../components/search/SearchForm';
import RideSearchForm from '../components/rides/RideSearchForm';
import BookingCard from '../components/bookings/BookingCard';
import PopularLocations from '../components/search/PopularLocations';
import { useAuthStore } from '../store/auth.store';
import { bookingApi } from '../api/booking.api';
import { searchApi } from '../api/search.api';
import { formatCurrency } from '../utils/format';
import { LONG_RENTAL_DISCOUNT_PCT, LONG_RENTAL_MIN_DAYS, FREE_CANCELLATION_HOURS } from '../utils/constants';

const FEATURES = [
  { icon: '🔍', title: 'Smart search', text: 'Search by city, branch or area — typos and old city names are fine' },
  { icon: '📅', title: 'Live availability', text: 'Only cars that are free for your exact dates are shown' },
  { icon: '🏷️', title: `${LONG_RENTAL_DISCOUNT_PCT}% off long trips`, text: `Automatic discount on rentals of ${LONG_RENTAL_MIN_DAYS}+ days` },
  { icon: '↩️', title: 'Free cancellation', text: `Full refund up to ${FREE_CANCELLATION_HOURS} hours before pickup` },
];

const STEPS = [
  { n: 1, title: 'Search', text: 'Pick a city and your dates.' },
  { n: 2, title: 'Choose', text: 'Compare cars, prices and features.' },
  { n: 3, title: 'Drive', text: 'Pay securely and pick up at the branch.' },
];

export default function HomePage() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const [upcomingTrips, setUpcomingTrips] = useState([]);
  const [mode, setMode] = useState('rent'); // 'rent' | 'seat'
  const [fleet, setFleet] = useState(null); // live stats from the search index

  useEffect(() => {
    searchApi.locations().then((res) => {
      const cities = res.data || [];
      if (!cities.length) return;
      setFleet({
        cities: cities.length,
        cars: cities.reduce((n, c) => n + c.cars, 0),
        fromPrice: Math.min(...cities.map((c) => c.fromPrice)),
      });
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (isAuthenticated) {
      bookingApi.list(null, 1, 3, 'upcoming').then((res) => {
        const data = res.data || res;
        setUpcomingTrips(data.bookings || []);
      }).catch(() => {});
    }
  }, [isAuthenticated]);

  return (
    <div>
      {/* Hero — light, airy, one accent colour */}
      <section className="relative overflow-hidden bg-gradient-to-b from-primary-50/80 via-white to-slate-50 dark:from-gray-900 dark:via-gray-950 dark:to-gray-950">
        {/* Soft decorative shapes */}
        <div className="pointer-events-none absolute -top-40 right-0 h-[28rem] w-[28rem] rounded-full bg-primary-200/50 blur-3xl dark:bg-primary-500/10" />
        <div className="pointer-events-none absolute top-40 -left-32 h-72 w-72 rounded-full bg-sky-100/70 blur-3xl dark:bg-sky-500/5" />

        <div className="relative max-w-6xl mx-auto px-4 pt-12 md:pt-16 pb-28">
          <div className="grid md:grid-cols-2 gap-10 items-center">
            <div>
              <p className="inline-flex items-center gap-2.5 rounded-full bg-white px-4 py-1.5 mb-6 text-sm font-semibold text-gray-800 shadow-sm ring-1 ring-gray-200 animate-fade-in dark:bg-gray-900 dark:text-gray-100 dark:ring-gray-700">
                {/* solid dot with a soft pulsing halo — stays visible */}
                <span className="relative flex h-2.5 w-2.5">
                  <span className="absolute inline-flex h-full w-full rounded-full bg-green-500 opacity-60 animate-ping" />
                  <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-green-500" />
                </span>
                {fleet ? `${fleet.cars} cars available now` : 'Cars available now'}
              </p>
              <h1 className="text-4xl md:text-6xl font-extrabold tracking-tight leading-[1.05] text-gray-900 dark:text-white mb-5 animate-fade-in-up">
                Rent a whole car.<br />
                <span className="text-primary-600 dark:text-primary-400">Or just a seat.</span>
              </h1>
              <p className="text-lg text-gray-600 dark:text-gray-300 max-w-md animate-fade-in-up" style={{ animationDelay: '120ms' }}>
                Self-drive cars by the day, or a seat on a shared ride between cities — pay only for what you need.
              </p>
              <div className="flex flex-wrap gap-x-8 gap-y-3 mt-8 animate-fade-in-up" style={{ animationDelay: '220ms' }}>
                {fleet && (
                  <div>
                    <p className="text-3xl font-extrabold text-gray-900 dark:text-white">{fleet.cities}</p>
                    <p className="text-sm text-gray-600 dark:text-gray-400">cit{fleet.cities === 1 ? 'y' : 'ies'}</p>
                  </div>
                )}
                {fleet && (
                  <div>
                    <p className="text-3xl font-extrabold text-gray-900 dark:text-white">{formatCurrency(fleet.fromPrice)}</p>
                    <p className="text-sm text-gray-600 dark:text-gray-400">from, per day</p>
                  </div>
                )}
                <div>
                  <p className="text-3xl font-extrabold text-gray-900 dark:text-white">{FREE_CANCELLATION_HOURS}h</p>
                  <p className="text-sm text-gray-600 dark:text-gray-400">free cancellation</p>
                </div>
              </div>
            </div>

            <div className="hidden md:block relative">
              {/* tinted backdrop card behind the photo */}
              <div className="absolute -inset-3 rotate-2 rounded-[2rem] bg-primary-600/90 dark:bg-primary-500/30" />
              <img
                src="/cars/hyundai-creta.jpg"
                alt="Hyundai Creta available to rent"
                className="relative rounded-3xl shadow-2xl animate-drive-in"
                style={{ animationDelay: '150ms' }}
              />
              <div className="absolute -bottom-6 -left-6 flex items-center gap-3 rounded-2xl bg-white px-4 py-3 shadow-xl ring-1 ring-gray-100 animate-fade-in-up dark:bg-gray-900 dark:ring-gray-800" style={{ animationDelay: '550ms' }}>
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-green-100 text-lg dark:bg-green-500/15">✓</span>
                <div>
                  <p className="text-sm font-bold text-gray-900 dark:text-white">Instant confirmation</p>
                  <p className="text-xs text-gray-600 dark:text-gray-400">Pay online, pick up at the branch</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Search card overlapping the hero */}
      <div className="relative max-w-6xl mx-auto px-4 -mt-20 z-10">
        <div className="card shadow-xl ring-1 ring-black/5 animate-fade-in-up" style={{ animationDelay: '300ms' }}>
          {/* Mode switch */}
          <div className="inline-flex rounded-xl bg-gray-100 dark:bg-gray-800 p-1 mb-5" role="tablist">
            {[['rent', '🚗 Rent a car'], ['seat', '💺 Book a seat']].map(([value, label]) => (
              <button
                key={value}
                role="tab"
                aria-selected={mode === value}
                onClick={() => setMode(value)}
                className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all duration-200 ${
                  mode === value
                    ? 'bg-white text-primary-700 shadow-sm dark:bg-gray-900 dark:text-primary-300'
                    : 'text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <div key={mode} className="animate-fade-in">
            {mode === 'rent' ? <SearchForm /> : <RideSearchForm />}
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-12">
        {isAuthenticated && upcomingTrips.length > 0 && (
          <div className="mb-12 animate-fade-in-up">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold">Your upcoming trips</h2>
              <Link to="/bookings" className="text-sm font-medium text-primary-700 dark:text-primary-400 hover:underline">View all →</Link>
            </div>
            <div className="space-y-3">
              {upcomingTrips.map((b) => <BookingCard key={b.id} booking={b} />)}
            </div>
          </div>
        )}

        <PopularLocations />

        <h2 className="text-xl font-bold mb-4">How it works</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-12">
          {STEPS.map((s, i) => (
            <div key={s.n} className="card flex gap-4 items-start animate-fade-in-up" style={{ animationDelay: `${i * 80}ms` }}>
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary-700 text-white font-bold">{s.n}</span>
              <div>
                <p className="font-semibold">{s.title}</p>
                <p className="text-sm text-gray-600 dark:text-gray-400">{s.text}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {FEATURES.map((f, i) => (
            <div key={f.title} className="card card-interactive text-center animate-fade-in-up" style={{ animationDelay: `${i * 80}ms` }}>
              <div className="text-3xl mb-3">{f.icon}</div>
              <h3 className="font-semibold mb-1">{f.title}</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">{f.text}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

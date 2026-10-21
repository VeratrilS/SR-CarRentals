import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { bookingApi } from '../api/booking.api';
import BookingCard from '../components/bookings/BookingCard';
import Pagination from '../components/ui/Pagination';
import EmptyState from '../components/ui/EmptyState';
import Button from '../components/ui/Button';
import ErrorState from '../components/ui/ErrorState';

const TABS = [
  { value: 'upcoming', label: 'Upcoming' },
  { value: 'past', label: 'Past & cancelled' },
  { value: '', label: 'All' },
];

const EMPTY_TEXT = {
  upcoming: 'No upcoming trips. Find a car for your next drive!',
  past: 'Nothing here yet.',
  '': 'Book your first car — it only takes a minute!',
};

function CardSkeleton() {
  return (
    <div className="card animate-pulse flex gap-4">
      <div className="w-10 h-10 bg-gray-200 dark:bg-gray-700 rounded-full" />
      <div className="flex-1 space-y-2">
        <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/3" />
        <div className="h-3 bg-gray-100 dark:bg-gray-800 rounded w-1/2" />
        <div className="h-3 bg-gray-100 dark:bg-gray-800 rounded w-2/3" />
      </div>
      <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded w-20" />
    </div>
  );
}

export default function MyBookingsPage() {
  const [bookings, setBookings] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, totalPages: 1 });
  const [tab, setTab] = useState('upcoming');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  const fetchBookings = async (when, page) => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await bookingApi.list(undefined, page, 10, when || undefined);
      const data = res.data || res;
      setBookings(data.bookings || []);
      setPagination(data.pagination || { page: 1, totalPages: 1 });
    } catch (err) {
      setLoadError(err.message || 'Failed to load your trips');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBookings(tab, 1);
  }, [tab]);

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">My trips</h1>
        <Link to="/search"><Button>+ New booking</Button></Link>
      </div>

      <div className="flex gap-2 mb-6 border-b">
        {TABS.map((t) => (
          <button
            key={t.value}
            onClick={() => setTab(t.value)}
            className={`px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px transition-colors ${
              tab === t.value ? 'border-primary-700 dark:border-primary-400 text-primary-800 dark:text-primary-300' : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-600 dark:hover:text-gray-300'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loadError ? (
        <ErrorState title="Couldn't load your trips" message={loadError} onRetry={() => fetchBookings(tab, pagination.page || 1)} />
      ) : loading ? (
        <div className="space-y-3">{[0, 1, 2].map((i) => <CardSkeleton key={i} />)}</div>
      ) : bookings.length === 0 ? (
        <EmptyState title="No trips found" message={EMPTY_TEXT[tab]}>
          <Link to="/search"><Button variant="secondary">Find a car</Button></Link>
        </EmptyState>
      ) : (
        <>
          <div className="space-y-3">
            {bookings.map((b) => <BookingCard key={b.id} booking={b} />)}
          </div>
          <Pagination page={pagination.page} totalPages={pagination.totalPages} onPageChange={(p) => fetchBookings(tab, p)} />
        </>
      )}
    </div>
  );
}

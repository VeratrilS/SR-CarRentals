import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { format } from 'date-fns';
import RideSearchForm from '../components/rides/RideSearchForm';
import RideCard from '../components/rides/RideCard';
import EmptyState from '../components/ui/EmptyState';
import ErrorState from '../components/ui/ErrorState';
import { searchApi } from '../api/search.api';

function RideSkeleton() {
  return (
    <div className="card p-0 overflow-hidden flex flex-col sm:flex-row">
      <div className="h-40 sm:h-36 sm:w-52 skeleton rounded-none" />
      <div className="flex-1 p-5 space-y-3">
        <div className="flex justify-between"><div className="h-7 w-24 skeleton" /><div className="h-7 w-24 skeleton" /></div>
        <div className="h-4 w-1/2 skeleton" />
        <div className="h-6 w-2/3 skeleton rounded-full" />
      </div>
    </div>
  );
}

export default function RidesPage() {
  const [params] = useSearchParams();
  const from = params.get('from');
  const to = params.get('to');
  const date = params.get('date');
  const seats = params.get('seats') || '1';

  const [state, setState] = useState({ loading: false, error: null, data: null });

  const load = () => {
    if (!from || !to || !date) return;
    setState({ loading: true, error: null, data: null });
    searchApi.searchRides({ from, to, date, seats })
      .then((res) => setState({ loading: false, error: null, data: res.data || res }))
      .catch((err) => setState({ loading: false, error: err.message, data: null }));
  };

  useEffect(load, [from, to, date, seats]);

  const { loading, error, data } = state;

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <h1 className="text-3xl font-extrabold tracking-tight mb-1 animate-fade-in">Book a seat</h1>
      <p className="text-gray-600 dark:text-gray-400 mb-6">Shared rides between cities — pay only for your seat and your stretch.</p>

      <div className="card mb-6 animate-fade-in-up">
        <RideSearchForm key={params.toString()} />
      </div>

      {!from || !to || !date ? (
        <div className="text-center py-16 text-gray-500 dark:text-gray-400 animate-fade-in">
          <p className="text-6xl mb-3 animate-float inline-block">🧭</p>
          <p className="text-lg">Tell us where you're going to see shared rides</p>
        </div>
      ) : loading ? (
        <div className="space-y-4">{[0, 1, 2].map((i) => <RideSkeleton key={i} />)}</div>
      ) : error ? (
        <ErrorState title="Couldn't search rides" message={error} onRetry={load} />
      ) : data ? (
        <div>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
            <strong className="text-gray-900 dark:text-gray-100">{data.count}</strong> ride{data.count !== 1 ? 's' : ''} from{' '}
            <strong className="text-gray-900 dark:text-gray-100">{data.from || from}</strong> to{' '}
            <strong className="text-gray-900 dark:text-gray-100">{data.to || to}</strong> on {format(new Date(`${date}T00:00:00`), 'EEE, dd MMM')}
            {Number(seats) > 1 && ` · ${seats} seats`}
          </p>
          {data.liveAvailability === false && (
            <p className="text-xs text-amber-700 dark:text-amber-300 mb-3">Live seat counts are temporarily unavailable — you'll see exact availability on the next step.</p>
          )}
          {data.rides?.length ? (
            <div className="space-y-4">
              {data.rides.map((ride, i) => <RideCard key={ride.tripId} ride={ride} seats={seats} index={i} />)}
            </div>
          ) : (
            <EmptyState
              icon="🚐"
              title="No shared rides found"
              message={data.message || 'Try another date, or a nearby city. New rides are added regularly.'}
            />
          )}
        </div>
      ) : null}
    </div>
  );
}

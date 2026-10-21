import { useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import SearchForm from '../components/search/SearchForm';
import SearchFilters from '../components/search/SearchFilters';
import CarCard from '../components/search/CarCard';
import EmptyState from '../components/ui/EmptyState';
import { useSearchStore } from '../store/search.store';
import { searchApi } from '../api/search.api';
import { useToast } from '../components/ui/Toast';
import { formatShortDateTime } from '../utils/format';

function CarCardSkeleton() {
  return (
    <div className="card p-0 overflow-hidden">
      <div className="h-48 skeleton rounded-none" />
      <div className="p-5 space-y-3">
        <div className="h-5 w-2/3 skeleton" />
        <div className="h-4 w-1/2 skeleton" />
        <div className="flex gap-2"><div className="h-6 w-20 skeleton rounded-full" /><div className="h-6 w-16 skeleton rounded-full" /></div>
        <div className="flex justify-between pt-3"><div className="h-8 w-24 skeleton" /><div className="h-10 w-28 skeleton rounded-lg" /></div>
      </div>
    </div>
  );
}

export default function SearchPage() {
  const { location, pickupAt, dropoffAt, filters, setFilters, results, setResults, isSearching, setSearching, setSearchParams } = useSearchStore();
  const showToast = useToast();
  const [params] = useSearchParams();

  // Opened from a shared link / page refresh: run the search described by the URL
  useEffect(() => {
    const urlLocation = params.get('location');
    const urlPickup = params.get('pickupAt') || pickupAt;
    const urlDropoff = params.get('dropoffAt') || dropoffAt;
    if (!urlLocation || results) return;

    setSearchParams(urlLocation, urlPickup, urlDropoff);
    setSearching(true);
    searchApi.searchCars({
      location: urlLocation,
      pickupAt: new Date(urlPickup).toISOString(),
      dropoffAt: new Date(urlDropoff).toISOString(),
      ...filters,
    })
      .then((res) => setResults(res.data || res))
      .catch((err) => {
        showToast(err.message || 'Search failed', 'error');
        setSearching(false);
      });
  }, []);

  // Re-run the current search whenever a filter chip changes
  const handleFilterChange = async (patch) => {
    const next = { ...filters, ...patch };
    setFilters(patch);
    if (!location) return;
    setSearching(true);
    try {
      const res = await searchApi.searchCars({
        location,
        pickupAt: new Date(pickupAt).toISOString(),
        dropoffAt: new Date(dropoffAt).toISOString(),
        ...next,
      });
      setResults(res.data || res);
    } catch (err) {
      showToast(err.message || 'Search failed', 'error');
      setSearching(false);
    }
  };

  const pickupIso = results?.pickupAt || (pickupAt && new Date(pickupAt).toISOString());
  const dropoffIso = results?.dropoffAt || (dropoffAt && new Date(dropoffAt).toISOString());

  // Cheapest car in the current results gets a "Best price" badge
  const bestPriceId = useMemo(() => {
    const cars = results?.cars || [];
    if (cars.length < 2) return null;
    return cars.reduce((min, c) => (c.dailyRate < min.dailyRate ? c : min), cars[0]).carId;
  }, [results]);

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <h1 className="text-3xl font-extrabold tracking-tight mb-6 animate-fade-in">Find a car</h1>

      <div className="card mb-6 animate-fade-in-up">
        <SearchForm />
      </div>

      {results && (
        <SearchFilters filters={filters} facets={results.facets} onChange={handleFilterChange} />
      )}

      {isSearching ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {[0, 1, 2, 3, 4, 5].map((i) => <CarCardSkeleton key={i} />)}
        </div>
      ) : results ? (
        <div>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
            <strong className="text-gray-900 dark:text-gray-100">{results.count || 0}</strong> car{results.count !== 1 ? 's' : ''} available
            {results.location && <> in <strong className="text-gray-900 dark:text-gray-100">{results.location}</strong></>}
            {results.pickupAt && <> · {formatShortDateTime(results.pickupAt)} → {formatShortDateTime(results.dropoffAt)}</>}
          </p>
          {results.cars?.length ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {results.cars.map((car, i) => (
                <CarCard
                  key={car.carId}
                  car={car}
                  index={i}
                  isBestPrice={car.carId === bestPriceId}
                  pickupAt={pickupIso}
                  dropoffAt={dropoffIso}
                />
              ))}
            </div>
          ) : (
            <EmptyState
              title="No cars available"
              message={results.message || 'Try other dates, a nearby branch, or remove some filters'}
            />
          )}
        </div>
      ) : (
        <div className="text-center py-16 text-gray-500 dark:text-gray-400 animate-fade-in">
          <p className="text-6xl mb-3 animate-float inline-block">🚗</p>
          <p className="text-lg">Choose a location and dates to see available cars</p>
        </div>
      )}
    </div>
  );
}

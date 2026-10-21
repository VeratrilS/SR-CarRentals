import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { searchApi } from '../../api/search.api';
import { useSearchStore } from '../../store/search.store';
import { formatCurrency } from '../../utils/format';

/**
 * One-tap city shortcuts with live fleet counts (from the search index).
 * Uses the dates already in the search box.
 */
export default function PopularLocations() {
  const [cities, setCities] = useState([]);
  const { pickupAt, dropoffAt, setSearchParams, clearResults } = useSearchStore();
  const navigate = useNavigate();

  useEffect(() => {
    searchApi.locations().then((res) => setCities(res.data || [])).catch(() => {});
  }, []);

  if (cities.length === 0) return null;

  const go = (city) => {
    setSearchParams(city, pickupAt, dropoffAt);
    clearResults(); // SearchPage runs the search from the URL
    navigate(`/search?${new URLSearchParams({ location: city, pickupAt, dropoffAt })}`);
  };

  return (
    <div className="mb-12">
      <h2 className="text-xl font-bold mb-4">Popular locations</h2>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {cities.slice(0, 8).map((c, i) => (
          <button
            key={c.city}
            onClick={() => go(c.city)}
            className="card card-interactive p-5 text-left group animate-fade-in-up"
            style={{ animationDelay: `${i * 70}ms` }}
          >
            <p className="font-semibold text-gray-900 dark:text-gray-100 group-hover:text-primary-700 dark:group-hover:text-primary-400">📍 {c.city}</p>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              {c.cars} car{c.cars !== 1 ? 's' : ''} · {c.branches} branch{c.branches !== 1 ? 'es' : ''}
            </p>
            <p className="text-sm text-primary-700 dark:text-primary-400 font-medium mt-2">from {formatCurrency(c.fromPrice)}/day</p>
          </button>
        ))}
      </div>
    </div>
  );
}

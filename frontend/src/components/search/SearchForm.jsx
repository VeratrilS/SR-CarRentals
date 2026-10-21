import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import LocationAutocomplete from './LocationAutocomplete';
import Button from '../ui/Button';
import { searchApi } from '../../api/search.api';
import { useSearchStore } from '../../store/search.store';
import { useToast } from '../ui/Toast';
import { rentalDays, toLocalInputValue } from '../../utils/format';

const addDays = (localValue, days) => {
  const d = new Date(localValue);
  d.setDate(d.getDate() + days);
  return toLocalInputValue(d);
};

// Next Saturday 10:00 → Monday 10:00 (on a Saturday, the following one)
const nextWeekend = () => {
  const d = new Date();
  const daysToSat = (6 - d.getDay() + 7) % 7 || 7;
  d.setDate(d.getDate() + daysToSat);
  d.setHours(10, 0, 0, 0);
  return { pickup: toLocalInputValue(d), dropoff: addDays(toLocalInputValue(d), 2) };
};

const QUICK = [
  { label: '1 day', days: 1 },
  { label: '3 days', days: 3 },
  { label: '1 week', days: 7, hint: '10% off' },
  { label: 'Weekend', weekend: true },
];

export default function SearchForm() {
  const { location, pickupAt, dropoffAt, filters, setSearchParams, setResults, setSearching, isSearching } = useSearchStore();
  const [loc, setLoc] = useState(location);
  const [pickup, setPickup] = useState(pickupAt);
  const [dropoff, setDropoff] = useState(dropoffAt);
  const navigate = useNavigate();
  const showToast = useToast();

  // Reflect searches started elsewhere (shared link, popular-city shortcut, remembered search)
  useEffect(() => {
    setLoc(location);
    setPickup(pickupAt);
    setDropoff(dropoffAt);
  }, [location, pickupAt, dropoffAt]);

  const handleSearch = async (e) => {
    e?.preventDefault();
    if (!loc.trim()) {
      showToast('Enter a city or branch', 'warning');
      return;
    }
    if (new Date(dropoff) <= new Date(pickup)) {
      showToast('Drop-off must be after pickup', 'warning');
      return;
    }
    setSearchParams(loc.trim(), pickup, dropoff);
    setSearching(true);

    try {
      const res = await searchApi.searchCars({
        location: loc.trim(),
        pickupAt: new Date(pickup).toISOString(),
        dropoffAt: new Date(dropoff).toISOString(),
        ...filters,
      });
      setResults(res.data || res);
      // Shareable / refresh-safe URL
      const qs = new URLSearchParams({ location: loc.trim(), pickupAt: pickup, dropoffAt: dropoff });
      navigate(`/search?${qs}`);
    } catch (err) {
      showToast(err.message || 'Search failed', 'error');
      setSearching(false);
    }
  };

  const applyQuick = (q) => {
    if (q.weekend) {
      const w = nextWeekend();
      setPickup(w.pickup);
      setDropoff(w.dropoff);
    } else {
      setDropoff(addDays(pickup, q.days));
    }
  };

  const nowLocal = toLocalInputValue(new Date());
  const days = pickup && dropoff && new Date(dropoff) > new Date(pickup) ? rentalDays(pickup, dropoff) : null;

  return (
    <form onSubmit={handleSearch}>
      <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
        <div className="md:col-span-4">
          <LocationAutocomplete
            label="Pickup location"
            value={loc}
            onChange={setLoc}
            placeholder="City, branch or area — e.g. Hyderabad"
          />
        </div>
        <div className="md:col-span-3">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">Pickup</label>
          <input
            type="datetime-local"
            value={pickup}
            min={nowLocal}
            onChange={(e) => setPickup(e.target.value)}
            className="input-field"
            required
          />
        </div>
        <div className="md:col-span-3">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">
            Drop-off {days && <span className="text-gray-500 dark:text-gray-400 font-normal">· {days} day{days > 1 ? 's' : ''}</span>}
          </label>
          <input
            type="datetime-local"
            value={dropoff}
            min={pickup || nowLocal}
            onChange={(e) => setDropoff(e.target.value)}
            className="input-field"
            required
          />
        </div>
        <div className="md:col-span-2 flex items-end">
          <Button type="submit" loading={isSearching} className="w-full">
            Find cars
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 mt-3">
        <span className="text-xs text-gray-500 dark:text-gray-400">Quick pick:</span>
        {QUICK.map((q) => (
          <button
            key={q.label}
            type="button"
            onClick={() => applyQuick(q)}
            className="text-xs px-3 py-1 rounded-full border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:border-primary-400 hover:text-primary-700 transition-colors"
          >
            {q.label}
            {q.hint && <span className="ml-1 text-green-700 dark:text-green-300 font-semibold">{q.hint}</span>}
          </button>
        ))}
      </div>
    </form>
  );
}

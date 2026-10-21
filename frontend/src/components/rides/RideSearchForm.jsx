import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import LocationAutocomplete from '../search/LocationAutocomplete';
import Button from '../ui/Button';
import { useToast } from '../ui/Toast';

const todayLocal = () => new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD in the user's zone
const tomorrowLocal = () => new Date(Date.now() + 864e5).toLocaleDateString('en-CA');

/** From / To / Date / Seats → /rides?… (the URL is the source of truth, so it is shareable). */
export default function RideSearchForm() {
  const [params] = useSearchParams();
  const [from, setFrom] = useState(params.get('from') || '');
  const [to, setTo] = useState(params.get('to') || '');
  const [date, setDate] = useState(params.get('date') || tomorrowLocal());
  const [seats, setSeats] = useState(params.get('seats') || '1');
  const navigate = useNavigate();
  const showToast = useToast();

  const swap = () => { setFrom(to); setTo(from); };

  const submit = (e) => {
    e.preventDefault();
    if (!from.trim() || !to.trim()) return showToast('Enter where you are leaving from and going to', 'warning');
    if (from.trim().toLowerCase() === to.trim().toLowerCase()) return showToast('Pick two different places', 'warning');
    navigate(`/rides?${new URLSearchParams({ from: from.trim(), to: to.trim(), date, seats })}`);
  };

  return (
    <form onSubmit={submit}>
      <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end">
        <div className="md:col-span-3">
          <LocationAutocomplete label="Leaving from" value={from} onChange={setFrom} placeholder="e.g. Hyderabad" />
        </div>
        <div className="hidden md:flex md:col-span-1 justify-center pb-1">
          <button
            type="button"
            onClick={swap}
            title="Swap"
            aria-label="Swap from and to"
            className="h-10 w-10 rounded-full border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 hover:rotate-180 transition-transform duration-300"
          >
            ⇄
          </button>
        </div>
        <div className="md:col-span-3">
          <LocationAutocomplete label="Going to" value={to} onChange={setTo} placeholder="e.g. Vijayawada" />
        </div>
        <div className="md:col-span-2">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">Date</label>
          <input type="date" value={date} min={todayLocal()} onChange={(e) => setDate(e.target.value)} className="input-field" required />
        </div>
        <div className="md:col-span-1">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">Seats</label>
          <select value={seats} onChange={(e) => setSeats(e.target.value)} className="input-field">
            {[1, 2, 3, 4, 5, 6].map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </div>
        <div className="md:col-span-2">
          <Button type="submit" className="w-full">Find rides</Button>
        </div>
      </div>
    </form>
  );
}

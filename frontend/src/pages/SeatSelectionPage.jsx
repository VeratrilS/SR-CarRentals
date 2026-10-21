import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { format } from 'date-fns';
import { bookingApi } from '../api/booking.api';
import { useCheckout } from '../hooks/useCheckout';
import { useToast } from '../components/ui/Toast';
import SeatMap from '../components/rides/SeatMap';
import CarImage from '../components/ui/CarImage';
import Button from '../components/ui/Button';
import Spinner from '../components/ui/Spinner';
import ErrorState from '../components/ui/ErrorState';
import { formatCurrency } from '../utils/format';

const MAX_SEATS = 6;
const GENDERS = [['MALE', 'Male'], ['FEMALE', 'Female'], ['OTHER', 'Other']];
const time = (t) => format(new Date(t), 'hh:mm a');

/** /rides/:tripId?from=<seq>&to=<seq>&seats=<n> */
export default function SeatSelectionPage() {
  const { tripId } = useParams();
  const [params] = useSearchParams();
  const fromSeq = Number(params.get('from'));
  const toSeq = Number(params.get('to'));
  const wanted = Math.min(MAX_SEATS, Number(params.get('seats')) || 1);

  const [quote, setQuote] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState([]);
  const [passengers, setPassengers] = useState({}); // seatNumber -> { name, age, gender }
  const [paying, setPaying] = useState(false);
  const idempotencyKey = useRef(crypto.randomUUID());
  const startCheckout = useCheckout();
  const navigate = useNavigate();
  const showToast = useToast();

  const load = () => {
    setLoading(true);
    setError(null);
    bookingApi.seatQuote(tripId, fromSeq, toSeq, 1)
      .then((res) => {
        const q = res.data || res;
        setQuote(q);
        // Drop any selection that was taken meanwhile
        setSelected((sel) => sel.filter((n) => q.seats.find((s) => s.seatNumber === n)?.available));
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  };

  useEffect(load, [tripId, fromSeq, toSeq]);

  const toggle = (n) => {
    setSelected((sel) => {
      if (sel.includes(n)) return sel.filter((x) => x !== n);
      if (sel.length >= MAX_SEATS) {
        showToast(`You can book up to ${MAX_SEATS} seats at a time`, 'warning');
        return sel;
      }
      return [...sel, n].sort((a, b) => a - b);
    });
  };

  const setPax = (n, field, value) => setPassengers((p) => ({ ...p, [n]: { ...p[n], [field]: value } }));

  const paxValid = selected.length > 0 && selected.every((n) => {
    const p = passengers[n] || {};
    const age = Number(p.age);
    return p.name?.trim().length >= 2 && Number.isInteger(age) && age >= 1 && age <= 120 && p.gender;
  });

  const pay = async () => {
    setPaying(true);
    try {
      const res = await bookingApi.create({
        type: 'SEAT',
        tripId,
        fromSeq,
        toSeq,
        seatNumbers: selected,
        passengers: selected.map((n) => ({ ...passengers[n], age: Number(passengers[n].age) })),
        idempotencyKey: idempotencyKey.current,
      });
      const booking = res.data || res;
      await startCheckout({
        bookingId: booking.bookingId,
        payment: booking.paymentOrder,
        description: `${booking.fromStopName} → ${booking.toStopName} · seat ${booking.seatNumbers.join(', ')}`,
      });
    } catch (err) {
      showToast(err.message || 'Booking failed', 'error');
      idempotencyKey.current = crypto.randomUUID();
      if (err.status === 409) load(); // seats changed — refresh the map
    } finally {
      setPaying(false);
    }
  };

  if (loading && !quote) return <div className="flex justify-center py-20"><Spinner size="lg" /></div>;

  if (error && !quote) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-12">
        <ErrorState title="Couldn't load this ride" message={error} onRetry={load} />
        <p className="text-center mt-4"><Link to="/rides" className="text-sm text-primary-700 dark:text-primary-400 hover:underline">← Back to rides</Link></p>
      </div>
    );
  }

  const total = selected.length * quote.seatFare;

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 animate-fade-in-up">
      <button type="button" onClick={() => navigate(-1)} className="text-sm text-primary-700 dark:text-primary-400 hover:underline">← Back to rides</button>
      <h1 className="text-2xl font-extrabold mt-2 mb-6">Choose your seats</h1>

      <div className="grid lg:grid-cols-[1fr_380px] gap-6 items-start">
        <div className="space-y-6">
          {/* Trip summary */}
          <div className="card p-0 overflow-hidden flex flex-col sm:flex-row">
            <CarImage src={quote.car.imageUrl} alt={`${quote.car.make} ${quote.car.model}`} category={quote.car.category} className="h-36 sm:h-auto sm:w-48 shrink-0" />
            <div className="p-5 flex-1">
              <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">{quote.routeName}</p>
              <div className="mt-2 flex items-center gap-3">
                <div>
                  <p className="text-xl font-extrabold">{time(quote.fromStop.time)}</p>
                  <p className="text-sm text-gray-700 dark:text-gray-300">{quote.fromStop.name}</p>
                </div>
                <span className="flex-1 border-t-2 border-dashed border-gray-300 dark:border-gray-700" />
                <div className="text-right">
                  <p className="text-xl font-extrabold">{time(quote.toStop.time)}</p>
                  <p className="text-sm text-gray-700 dark:text-gray-300">{quote.toStop.name}</p>
                </div>
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-3">
                {format(new Date(quote.fromStop.time), 'EEEE, dd MMM')} · {quote.distanceKm} km · {quote.car.make} {quote.car.model} · Driver {quote.driverName}
              </p>
            </div>
          </div>

          {/* Seat map */}
          <div className="card">
            <div className="flex items-center justify-between mb-5">
              <h2 className="font-bold text-lg">Pick {wanted > 1 ? `${wanted} seats` : 'a seat'}</h2>
              <span className="text-sm text-gray-600 dark:text-gray-400">{quote.seatsLeft} free for your stretch</span>
            </div>
            <SeatMap seats={quote.seats} selected={selected} onToggle={toggle} />
          </div>

          {/* Passenger details */}
          {selected.length > 0 && (
            <div className="card animate-fade-in-up">
              <h2 className="font-bold text-lg mb-4">Passenger details</h2>
              <div className="space-y-4">
                {selected.map((n) => (
                  <div key={n} className="rounded-xl bg-gray-50 dark:bg-gray-800/60 p-4">
                    <p className="text-sm font-semibold text-primary-700 dark:text-primary-300 mb-3">Seat {n}</p>
                    <div className="grid grid-cols-1 sm:grid-cols-[1fr_90px_140px] gap-3">
                      <input className="input-field" placeholder="Full name" value={passengers[n]?.name || ''} onChange={(e) => setPax(n, 'name', e.target.value)} />
                      <input className="input-field" placeholder="Age" type="number" min={1} max={120} value={passengers[n]?.age || ''} onChange={(e) => setPax(n, 'age', e.target.value)} />
                      <select className="input-field" value={passengers[n]?.gender || ''} onChange={(e) => setPax(n, 'gender', e.target.value)}>
                        <option value="">Gender</option>
                        {GENDERS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                      </select>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Sticky summary */}
        <div className="card lg:sticky lg:top-24">
          <h2 className="font-bold text-lg mb-4">Fare summary</h2>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-gray-600 dark:text-gray-400">Fare per seat</span><span>{formatCurrency(quote.seatFare)}</span></div>
            <div className="flex justify-between"><span className="text-gray-600 dark:text-gray-400">Seats</span><span>{selected.length ? selected.join(', ') : '—'}</span></div>
            <div className="flex justify-between border-t border-gray-200 dark:border-gray-700 pt-3 mt-3 text-base">
              <span className="font-bold">Total</span>
              <span className="font-extrabold text-primary-700 dark:text-primary-300 text-xl">{formatCurrency(total)}</span>
            </div>
          </div>
          <Button onClick={pay} loading={paying} disabled={!paxValid} className="w-full mt-5 py-3 text-base">
            {selected.length ? `Pay ${formatCurrency(total)}` : 'Select a seat'}
          </Button>
          {selected.length > 0 && !paxValid && (
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-2 text-center">Fill in name, age and gender for each seat</p>
          )}
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-4 text-center">
            Seats are held for 10 minutes while you pay. Free cancellation up to 24 hours before departure.
          </p>
        </div>
      </div>
    </div>
  );
}

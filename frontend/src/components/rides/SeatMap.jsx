/**
 * Top-down car seat map (right-hand drive): the driver sits front-right,
 * seat 1 is front-left, the rest fill rows of three from the front.
 * The last row takes whatever is left (e.g. 2-3-2 seating on a 7-seater).
 */
function rowsFor(passengerSeats) {
  const rows = [[{ n: 1 }, { driver: true }]];
  let n = 2;
  while (n <= passengerSeats) {
    const remaining = passengerSeats - n + 1;
    const size = remaining === 4 ? 2 : Math.min(3, remaining); // avoid a lonely single seat at the back
    rows.push(Array.from({ length: size }, () => ({ n: n++ })));
  }
  return rows;
}

function Seat({ seat, state, onClick }) {
  if (seat.driver) {
    return (
      <div className="flex h-14 w-14 flex-col items-center justify-center rounded-xl bg-gray-200 text-gray-500 dark:bg-gray-700 dark:text-gray-400" title="Driver">
        <span className="text-lg" aria-hidden>🛞</span>
        <span className="text-[10px] font-semibold">Driver</span>
      </div>
    );
  }
  const styles = {
    available: 'bg-white border-2 border-primary-500 text-primary-700 hover:bg-primary-50 hover:-translate-y-0.5 dark:bg-gray-900 dark:text-primary-300 dark:hover:bg-primary-950/50',
    selected: 'bg-primary-600 border-2 border-primary-600 text-white shadow-lg shadow-primary-600/30 scale-105',
    taken: 'bg-gray-100 border-2 border-gray-200 text-gray-400 cursor-not-allowed dark:bg-gray-800 dark:border-gray-700 dark:text-gray-600',
  };
  return (
    <button
      type="button"
      disabled={state === 'taken'}
      onClick={() => onClick(seat.n)}
      aria-pressed={state === 'selected'}
      aria-label={`Seat ${seat.n} ${state}`}
      className={`flex h-14 w-14 flex-col items-center justify-center rounded-xl font-bold transition-all duration-200 ${styles[state]}`}
    >
      <span className="text-lg leading-none">{state === 'taken' ? '✕' : seat.n}</span>
      <span className="text-[10px] font-semibold mt-0.5">{state === 'selected' ? 'Yours' : state === 'taken' ? 'Taken' : 'Free'}</span>
    </button>
  );
}

export default function SeatMap({ seats, selected, onToggle }) {
  const available = new Map(seats.map((s) => [s.seatNumber, s.available]));
  const rows = rowsFor(seats.length);

  return (
    <div>
      <div className="mx-auto w-fit rounded-[2.5rem] border-4 border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/40 px-6 pt-8 pb-6">
        <p className="text-center text-[10px] font-bold uppercase tracking-widest text-gray-400 dark:text-gray-500 mb-4">Front</p>
        <div className="space-y-3">
          {rows.map((row, i) => (
            <div key={i} className={`flex gap-3 ${row.length === 2 && i === 0 ? 'justify-between' : 'justify-center'}`}>
              {row.map((seat, j) => (
                <Seat
                  key={seat.driver ? 'driver' : seat.n}
                  seat={seat}
                  state={seat.driver ? 'driver' : selected.includes(seat.n) ? 'selected' : available.get(seat.n) ? 'available' : 'taken'}
                  onClick={onToggle}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
      <div className="flex justify-center gap-5 mt-4 text-xs text-gray-600 dark:text-gray-400">
        <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded border-2 border-primary-500" /> Free</span>
        <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded bg-primary-600" /> Selected</span>
        <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded bg-gray-200 dark:bg-gray-700" /> Taken</span>
      </div>
    </div>
  );
}

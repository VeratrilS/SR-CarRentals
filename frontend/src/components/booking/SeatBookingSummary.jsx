import { format } from 'date-fns';
import CarImage, { carImageFor } from '../ui/CarImage';
import { formatCurrency } from '../../utils/format';

const time = (t) => format(new Date(t), 'hh:mm a');

/** Summary card for a shared-ride (SEAT) booking. */
export default function SeatBookingSummary({ booking }) {
  return (
    <div className="card mb-6 p-0 overflow-hidden">
      <CarImage src={carImageFor(booking.carName)} alt={booking.carName} category={booking.category} className="h-48 sm:h-56" />
      <div className="p-6">
        <p className="text-sm font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-3">
          Shared ride · {booking.routeName}
        </p>

        <div className="flex items-center gap-4 rounded-xl bg-gray-50 dark:bg-gray-800/60 p-4 mb-4">
          <div>
            <p className="text-xs uppercase font-semibold text-gray-500 dark:text-gray-400">Board</p>
            <p className="text-xl font-extrabold">{time(booking.pickupAt)}</p>
            <p className="text-sm font-medium">{booking.fromStopName}</p>
          </div>
          <span className="flex-1 border-t-2 border-dashed border-gray-300 dark:border-gray-700" />
          <div className="text-right">
            <p className="text-xs uppercase font-semibold text-gray-500 dark:text-gray-400">Get off</p>
            <p className="text-xl font-extrabold">{time(booking.dropoffAt)}</p>
            <p className="text-sm font-medium">{booking.toStopName}</p>
          </div>
        </div>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
          {format(new Date(booking.pickupAt), 'EEEE, dd MMM yyyy')} · {booking.carName}
          {booking.registrationNumber && <> · <span className="font-mono">{booking.registrationNumber}</span></>}
        </p>

        {booking.passengers?.length > 0 && (
          <div className="mb-4">
            <p className="text-sm font-semibold mb-2">Passengers</p>
            <div className="space-y-2">
              {booking.passengers.map((p) => (
                <div key={p.seatNumber} className="flex items-center justify-between rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-2 text-sm">
                  <span className="font-medium">{p.name} <span className="text-gray-500 dark:text-gray-400">· {p.age} · {p.gender?.toLowerCase()}</span></span>
                  <span className="rounded-md bg-primary-50 dark:bg-primary-500/15 px-2 py-0.5 text-xs font-bold text-primary-700 dark:text-primary-300">Seat {p.seatNumber}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <table className="w-full text-sm">
          <tbody>
            <tr>
              <td className="py-1.5 text-gray-600 dark:text-gray-300">{booking.seatNumbers?.length} seat(s) × {formatCurrency(booking.seatFare)}</td>
              <td className="py-1.5 text-right">{formatCurrency(booking.totalAmount)}</td>
            </tr>
          </tbody>
          <tfoot>
            <tr className="border-t">
              <td className="pt-3 font-bold">Total</td>
              <td className="pt-3 text-right font-bold text-primary-800 dark:text-primary-300 text-xl">{formatCurrency(booking.totalAmount)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

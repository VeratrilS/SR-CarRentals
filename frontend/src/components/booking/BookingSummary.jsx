import { formatCurrency, formatCategory, formatShortDateTime } from '../../utils/format';
import { LONG_RENTAL_DISCOUNT_PCT } from '../../utils/constants';
import CarImage, { carImageFor } from '../ui/CarImage';

/**
 * Car + rental window + price breakdown. Accepts either a server quote or a
 * booking (both carry rentalDays/dailyRate/baseAmount/discountAmount/totalAmount).
 */
export default function BookingSummary({ data, title = 'Rental summary' }) {
  if (!data) return null;

  return (
    <div className="card mb-6 p-0 overflow-hidden">
      <CarImage src={carImageFor(data.carName)} alt={data.carName} category={data.category} className="h-52 sm:h-64" />
      <div className="p-6">
      <h3 className="text-sm font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-3">{title}</h3>

      <div className="flex flex-col sm:flex-row sm:justify-between gap-2 mb-4">
        <div>
          <p className="font-bold text-gray-900 dark:text-gray-100 text-lg">{data.carName}</p>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {formatCategory(data.category)}
            {data.registrationNumber && <> · <span className="font-mono">{data.registrationNumber}</span></>}
          </p>
        </div>
        <p className="text-sm text-gray-600 dark:text-gray-300">📍 {data.branchName}, {data.city}</p>
      </div>

      <div className="grid grid-cols-2 gap-4 bg-gray-50 dark:bg-gray-800/60 rounded-lg p-4 mb-4 text-sm">
        <div>
          <p className="text-gray-500 dark:text-gray-400 text-xs uppercase font-semibold">Pickup</p>
          <p className="font-medium">{formatShortDateTime(data.pickupAt)}</p>
        </div>
        <div>
          <p className="text-gray-500 dark:text-gray-400 text-xs uppercase font-semibold">Drop-off</p>
          <p className="font-medium">{formatShortDateTime(data.dropoffAt)}</p>
        </div>
      </div>

      <table className="w-full text-sm">
        <tbody>
          <tr>
            <td className="py-1.5 text-gray-600 dark:text-gray-300">{data.rentalDays} day{data.rentalDays > 1 ? 's' : ''} × {formatCurrency(data.dailyRate)}</td>
            <td className="py-1.5 text-right">{formatCurrency(data.baseAmount)}</td>
          </tr>
          {data.discountAmount > 0 && (
            <tr className="text-green-700 dark:text-green-300">
              <td className="py-1.5">Long-rental discount ({LONG_RENTAL_DISCOUNT_PCT}%)</td>
              <td className="py-1.5 text-right">−{formatCurrency(data.discountAmount)}</td>
            </tr>
          )}
        </tbody>
        <tfoot>
          <tr className="border-t">
            <td className="pt-3 font-bold">Total</td>
            <td className="pt-3 text-right font-bold text-primary-800 dark:text-primary-300 text-xl">{formatCurrency(data.totalAmount)}</td>
          </tr>
        </tfoot>
      </table>
      </div>
    </div>
  );
}

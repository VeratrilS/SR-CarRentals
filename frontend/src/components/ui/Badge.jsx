const STYLES = {
  green: 'bg-green-50 text-green-700 ring-green-600/20 dark:bg-green-500/10 dark:text-green-300 dark:ring-green-400/30',
  amber: 'bg-amber-50 text-amber-800 ring-amber-600/20 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-400/30',
  orange: 'bg-orange-50 text-orange-700 ring-orange-600/20 dark:bg-orange-500/10 dark:text-orange-300 dark:ring-orange-400/30',
  blue: 'bg-blue-50 text-blue-700 ring-blue-600/20 dark:bg-blue-500/10 dark:text-blue-300 dark:ring-blue-400/30',
  red: 'bg-red-50 text-red-700 ring-red-600/20 dark:bg-red-500/10 dark:text-red-300 dark:ring-red-400/30',
  gray: 'bg-gray-50 text-gray-600 ring-gray-500/20 dark:bg-gray-500/10 dark:text-gray-300 dark:ring-gray-400/30',
};
const DOTS = { green: 'bg-green-500', amber: 'bg-amber-500', orange: 'bg-orange-500', blue: 'bg-blue-500', red: 'bg-red-500', gray: 'bg-gray-400' };

const STATUS = {
  CONFIRMED: { tone: 'green', label: 'Confirmed' },
  ACTIVE: { tone: 'green', label: 'Active' },
  PENDING: { tone: 'amber', label: 'Pending', pulse: true },
  CAR_HELD: { tone: 'amber', label: 'Car held', pulse: true },
  PAYMENT_PENDING: { tone: 'orange', label: 'Awaiting payment', pulse: true },
  CONFIRMING: { tone: 'blue', label: 'Confirming', pulse: true },
  MAINTENANCE: { tone: 'amber', label: 'Maintenance' },
  CANCELLING: { tone: 'red', label: 'Cancelling', pulse: true },
  FAILED: { tone: 'red', label: 'Failed' },
  CANCELLED: { tone: 'gray', label: 'Cancelled' },
  EXPIRED: { tone: 'gray', label: 'Expired' },
  RETIRED: { tone: 'gray', label: 'Retired' },
};

/** Status pill with a coloured dot; in-progress states pulse. */
export default function Badge({ status, className = '' }) {
  const s = STATUS[status] || { tone: 'gray', label: status?.replace(/_/g, ' ') };
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${STYLES[s.tone]} ${className}`}>
      <span className="relative flex h-1.5 w-1.5">
        {s.pulse && <span className={`absolute inline-flex h-full w-full rounded-full opacity-75 animate-ping ${DOTS[s.tone]}`} />}
        <span className={`relative inline-flex h-1.5 w-1.5 rounded-full ${DOTS[s.tone]}`} />
      </span>
      {s.label}
    </span>
  );
}

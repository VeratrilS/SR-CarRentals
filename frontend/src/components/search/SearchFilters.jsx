import { CAR_CATEGORIES, TRANSMISSIONS, FUEL_TYPES, SORT_OPTIONS } from '../../utils/constants';
import { formatCategory, titleCase } from '../../utils/format';

function Chip({ active, onClick, children, count }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
        active ? 'bg-primary-700 text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
      }`}
    >
      {children}
      {count != null && <span className={`ml-1 text-xs ${active ? 'text-primary-100' : 'text-gray-500 dark:text-gray-400'}`}>{count}</span>}
    </button>
  );
}

/**
 * Filter chips with live counts from the search facets.
 * Counts reflect the current result set (Elasticsearch aggregations).
 */
export default function SearchFilters({ filters, facets = {}, onChange }) {
  const toggle = (key, value) => onChange({ [key]: filters[key] === value ? '' : value });

  return (
    <div className="card mb-6 space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase w-24">Type</span>
        {CAR_CATEGORIES.map((c) => (
          <Chip key={c} active={filters.category === c} onClick={() => toggle('category', c)} count={facets.category?.[c]}>
            {formatCategory(c)}
          </Chip>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase w-24">Gearbox</span>
        {TRANSMISSIONS.map((t) => (
          <Chip key={t} active={filters.transmission === t} onClick={() => toggle('transmission', t)} count={facets.transmission?.[t]}>
            {titleCase(t)}
          </Chip>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase w-24">Fuel</span>
        {FUEL_TYPES.map((f) => (
          <Chip key={f} active={filters.fuelType === f} onClick={() => toggle('fuelType', f)} count={facets.fuelType?.[f]}>
            {titleCase(f)}
          </Chip>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase w-24">Sort</span>
        <select
          value={filters.sort}
          onChange={(e) => onChange({ sort: e.target.value })}
          className="input-field max-w-xs py-1.5"
        >
          {SORT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>
    </div>
  );
}

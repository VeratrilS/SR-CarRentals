import { useState, useEffect, useRef } from 'react';
import { useDebounce } from '../../hooks/useDebounce';
import { searchApi } from '../../api/search.api';

/**
 * Free-text location box with branch suggestions. The raw text is a valid
 * search on its own (city names, old city names and typos are resolved
 * server-side); picking a suggestion narrows the search to that branch.
 */
export default function LocationAutocomplete({ label, value, onChange, placeholder }) {
  const [query, setQuery] = useState(value || '');
  const [suggestions, setSuggestions] = useState([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const debouncedQuery = useDebounce(query, 250);
  const wrapperRef = useRef(null);
  const typedRef = useRef(false); // only suggest for what the user is typing

  useEffect(() => {
    if (!typedRef.current) return;
    if (debouncedQuery.length < 2) {
      setSuggestions([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    searchApi.autocomplete(debouncedQuery).then((res) => {
      if (!cancelled) {
        setSuggestions(res.data || []);
        setOpen(true);
      }
    }).catch(() => {
      if (!cancelled) setSuggestions([]);
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [debouncedQuery]);

  useEffect(() => {
    function handleClickOutside(e) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (value !== undefined && value !== query) setQuery(value);
  }, [value]);

  // Group suggestions by city so "Hyderabad" can be picked as a whole
  const cities = [...new Set(suggestions.map((s) => s.city))];

  const choose = (text) => {
    typedRef.current = false;
    setQuery(text);
    onChange(text);
    setOpen(false);
  };

  return (
    <div className="relative" ref={wrapperRef}>
      {label && <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">{label}</label>}
      <input
        type="text"
        value={query}
        onChange={(e) => {
          typedRef.current = true;
          setQuery(e.target.value);
          onChange(e.target.value);
        }}
        onFocus={() => suggestions.length > 0 && setOpen(true)}
        placeholder={placeholder}
        className="input-field"
        autoComplete="off"
      />
      {loading && (
        <div className="absolute right-3 top-[38px]">
          <div className="animate-spin h-4 w-4 border-b-2 border-primary-700 dark:border-primary-400 rounded-full" />
        </div>
      )}
      {open && suggestions.length > 0 && (
        <ul className="absolute z-30 w-full mt-1 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg max-h-72 overflow-y-auto text-sm">
          {cities.map((city) => (
            <li key={city}>
              <button
                type="button"
                onClick={() => choose(city)}
                className="w-full text-left px-4 py-2 bg-gray-50 dark:bg-gray-800/60 hover:bg-primary-50 dark:hover:bg-primary-900/40 font-semibold text-gray-700 dark:text-gray-200"
              >
                📍 All of {city}
              </button>
              <ul>
                {suggestions.filter((s) => s.city === city).map((s) => (
                  <li key={s.branchId}>
                    <button
                      type="button"
                      onClick={() => choose(s.code)}
                      className="w-full text-left pl-8 pr-4 py-2 hover:bg-primary-50 dark:hover:bg-primary-900/40 flex justify-between"
                    >
                      <span>{s.name}</span>
                      <span className="text-gray-500 dark:text-gray-400 text-xs">{s.code}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

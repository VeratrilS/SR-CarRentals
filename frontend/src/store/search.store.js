import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { defaultRentalWindow } from '../utils/format';

const initialWindow = defaultRentalWindow();

// localStorage can be unavailable (private mode, blocked storage) — fall back to memory
const safeStorage = createJSONStorage(() => {
  try {
    const probe = '__sr_probe__';
    window.localStorage.setItem(probe, '1');
    window.localStorage.removeItem(probe);
    return window.localStorage;
  } catch {
    const mem = new Map();
    return {
      getItem: (k) => mem.get(k) ?? null,
      setItem: (k, v) => mem.set(k, v),
      removeItem: (k) => mem.delete(k),
    };
  }
});

export const useSearchStore = create(
  persist(
    (set) => ({
      location: '',
      pickupAt: initialWindow.pickupAt,   // datetime-local strings (user's local time)
      dropoffAt: initialWindow.dropoffAt,
      filters: { category: '', transmission: '', fuelType: '', sort: 'price_asc' },
      results: null,
      isSearching: false,

      setSearchParams: (location, pickupAt, dropoffAt) => set({ location, pickupAt, dropoffAt }),
      setFilters: (patch) => set((s) => ({ filters: { ...s.filters, ...patch } })),
      setResults: (results) => set({ results, isSearching: false }),
      setSearching: (v) => set({ isSearching: v }),
      clearResults: () => set({ results: null }),
    }),
    {
      name: 'sr-carrentals-search',
      storage: safeStorage,
      // Remember the last search between visits — never the results themselves
      partialize: (s) => ({ location: s.location, pickupAt: s.pickupAt, dropoffAt: s.dropoffAt, filters: s.filters }),
      // Dates from an old visit may be in the past: keep the trip length, move it forward
      merge: (persisted, current) => {
        const merged = { ...current, ...persisted };
        if (!persisted?.pickupAt || new Date(persisted.pickupAt) <= new Date()) {
          merged.pickupAt = current.pickupAt;
          merged.dropoffAt = current.dropoffAt;
        }
        return merged;
      },
    }
  )
);

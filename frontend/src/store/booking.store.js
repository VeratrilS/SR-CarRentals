import { create } from 'zustand';

// The car the user picked from search, plus the rental window they searched for
export const useBookingStore = create((set) => ({
  selectedCar: null,
  pickupAt: null,  // ISO strings
  dropoffAt: null,

  selectCar: (car, pickupAt, dropoffAt) => set({ selectedCar: car, pickupAt, dropoffAt }),
  reset: () => set({ selectedCar: null, pickupAt: null, dropoffAt: null }),
}));

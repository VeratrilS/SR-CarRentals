import client from './client';

export const searchApi = {
  /** params: { location, pickupAt, dropoffAt, category, transmission, fuelType, minSeats, sort } */
  searchCars: (params) => {
    const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v));
    return client.get(`/search/cars?${qs}`).then((r) => r.data);
  },
  /** params: { from, to, date (YYYY-MM-DD), seats } */
  searchRides: (params) => {
    const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v));
    return client.get(`/search/rides?${qs}`).then((r) => r.data);
  },
  locations: () => client.get('/search/locations').then((r) => r.data),
  autocomplete: (q) => client.get(`/search/autocomplete?q=${encodeURIComponent(q)}`).then((r) => r.data),
};

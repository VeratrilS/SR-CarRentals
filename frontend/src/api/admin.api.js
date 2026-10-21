import client from './client';

export const adminApi = {
  createBranch: (data) => client.post('/admins/branches/branch', data).then((r) => r.data),
  getBranches: (page = 1, limit = 20, search = '') => {
    const qs = new URLSearchParams({ page, limit });
    if (search) qs.set('search', search);
    return client.get(`/admins/branches/branch?${qs}`).then((r) => r.data);
  },

  createCar: (data) => client.post('/admins/cars/car', data).then((r) => r.data),
  getCars: (query = {}) => {
    const qs = new URLSearchParams(Object.entries(query).filter(([, v]) => v));
    return client.get(`/admins/cars/car${qs.toString() ? '?' + qs : ''}`).then((r) => r.data);
  },
  updateCar: (id, data) => client.put(`/admins/cars/car/${id}`, data).then((r) => r.data),
  // Shared rides
  createRoute: (data) => client.post('/admins/rides/route', data).then((r) => r.data),
  getRoutes: () => client.get('/admins/rides/route').then((r) => r.data),
  scheduleTrip: (data) => client.post('/admins/rides/trip', data).then((r) => r.data),
  getTrips: (query = {}) => {
    const qs = new URLSearchParams(Object.entries(query).filter(([, v]) => v));
    return client.get(`/admins/rides/trip${qs.toString() ? '?' + qs : ''}`).then((r) => r.data);
  },
  cancelTrip: (id) => client.patch(`/admins/rides/trip/${id}/cancel`).then((r) => r.data),

  setCarStatus: (id, status) => client.patch(`/admins/cars/car/${id}/status`, { status }).then((r) => r.data),
};

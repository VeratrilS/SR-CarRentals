import client from './client';

export const bookingApi = {
  quote: (carId, pickupAt, dropoffAt) => {
    const qs = new URLSearchParams({ carId, pickupAt, dropoffAt });
    return client.get(`/bookings/bookings/quote?${qs}`).then((r) => r.data);
  },

  seatQuote: (tripId, fromSeq, toSeq, seats = 1) => {
    const qs = new URLSearchParams({ tripId, fromSeq, toSeq, seats });
    return client.get(`/bookings/bookings/seat-quote?${qs}`).then((r) => r.data);
  },

  create: (data) => client.post('/bookings/bookings', data).then((r) => r.data),

  list: (status, page = 1, limit = 10, when) => {
    const qs = new URLSearchParams();
    if (status) qs.set('status', status);
    if (when) qs.set('when', when);
    qs.set('page', page);
    qs.set('limit', limit);
    return client.get(`/bookings/bookings?${qs.toString()}`).then((r) => r.data);
  },

  getById: (id) => client.get(`/bookings/bookings/${id}`).then((r) => r.data),

  verifyPayment: (id, data) => client.post(`/bookings/bookings/${id}/verify-payment`, data).then((r) => r.data),

  cancel: (id) => client.post(`/bookings/bookings/${id}/cancel`).then((r) => r.data),
};

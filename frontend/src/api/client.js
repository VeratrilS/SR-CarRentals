import axios from 'axios';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api';

const client = axios.create({
  baseURL: API_BASE,
  withCredentials: true,
  timeout: 20000,
  headers: { 'Content-Type': 'application/json' },
});

// Auth endpoints return 401 for wrong credentials / bad OTP — that is an answer,
// not an expired session, so they must never trigger a token refresh.
const NO_REFRESH = ['/users/auth/login', '/users/auth/send-otp', '/users/auth/verify-otp', '/users/auth/google-auth', '/users/auth/refresh', '/users/auth/logout'];

let isRefreshing = false;
let failedQueue = [];

function processQueue(error) {
  failedQueue.forEach(({ resolve, reject }) => (error ? reject(error) : resolve()));
  failedQueue = [];
}

/**
 * Turn any axios failure into an Error with a message a customer can act on.
 * Server-provided messages for 4xx (validation, conflicts) are kept — they are
 * already written for users. Infrastructure failures get friendly wording.
 */
export function toFriendlyError(error) {
  const status = error.response?.status;
  const body = error.response?.data;
  let message;

  if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
    message = 'The server is taking too long to respond. Please try again.';
  } else if (!error.response) {
    message = navigator.onLine === false
      ? "You're offline. Check your internet connection and try again."
      : "Can't reach SR-CarRentals right now. Please try again in a moment.";
  } else if (status === 429) {
    message = 'Too many attempts. Please wait a minute and try again.';
  } else if (status === 502 || status === 503 || status === 504) {
    message = 'This service is temporarily unavailable. Please try again shortly.';
  } else if (status >= 500) {
    message = 'Something went wrong on our side. Please try again.';
  } else {
    message = body?.message || body?.error || 'Request failed. Please check your details and try again.';
  }

  const friendly = new Error(message);
  friendly.status = status;
  friendly.code = body?.error || body?.code || error.code;
  friendly.data = body;
  friendly.isNetworkError = !error.response;
  return friendly;
}

client.interceptors.response.use(
  (res) => res,
  async (error) => {
    const originalRequest = error.config || {};
    const url = originalRequest.url || '';
    const canRefresh = error.response?.status === 401 && !originalRequest._retry && !NO_REFRESH.some((p) => url.startsWith(p));

    if (canRefresh) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        }).then(() => client(originalRequest));
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        await axios.post(`${API_BASE}/users/auth/refresh`, {}, { withCredentials: true, timeout: 10000 });
        processQueue(null);
        return client(originalRequest);
      } catch (refreshError) {
        processQueue(refreshError);
        // Session is really over — clear auth state (picked up by the auth store)
        window.dispatchEvent(new Event('auth:logout'));
        const expired = toFriendlyError(error);
        expired.message = 'Your session has expired. Please log in again.';
        expired.sessionExpired = true;
        return Promise.reject(expired);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(toFriendlyError(error));
  }
);

export default client;

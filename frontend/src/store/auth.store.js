import { create } from 'zustand';
import { authApi } from '../api/auth.api';

export const useAuthStore = create((set, get) => ({
  user: null,
  isAuthenticated: false,
  isLoading: true,

  setUser: (user) => set({ user, isAuthenticated: !!user, isLoading: false }),

  fetchProfile: async () => {
    try {
      const res = await authApi.getProfile();
      const user = res.data?.user || res.data;
      set({ user, isAuthenticated: true, isLoading: false });
      return user;
    } catch {
      set({ user: null, isAuthenticated: false, isLoading: false });
      return null;
    }
  },

  // Revoke the session on the server (clears httpOnly cookies), then locally
  logout: async () => {
    try {
      await authApi.logout();
    } catch { /* still log out locally — e.g. server unreachable */ }
    set({ user: null, isAuthenticated: false, isLoading: false });
  },

  // Local-only reset, used when the server already rejected the session
  clearSession: () => set({ user: null, isAuthenticated: false, isLoading: false }),
}));

// Listen for forced logout from API interceptor
if (typeof window !== 'undefined') {
  window.addEventListener('auth:logout', () => {
    useAuthStore.getState().clearSession();
  });
}

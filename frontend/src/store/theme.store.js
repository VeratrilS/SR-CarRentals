import { create } from 'zustand';

const KEY = 'sr-carrentals-theme'; // also read by the inline script in index.html
const media = typeof window !== 'undefined' ? window.matchMedia('(prefers-color-scheme: dark)') : null;

const readPref = () => {
  try {
    return localStorage.getItem(KEY) || 'system';
  } catch {
    return 'system';
  }
};

const isDark = (pref) => pref === 'dark' || (pref === 'system' && !!media?.matches);

const apply = (pref) => {
  document.documentElement.classList.toggle('dark', isDark(pref));
};

/** pref: 'light' | 'dark' | 'system' */
export const useThemeStore = create((set, get) => ({
  pref: readPref(),
  dark: isDark(readPref()),

  setPref: (pref) => {
    try {
      localStorage.setItem(KEY, pref);
    } catch { /* storage unavailable — theme still applies for this session */ }
    apply(pref);
    set({ pref, dark: isDark(pref) });
  },

  // Light → Dark → System → Light
  cycle: () => {
    const next = { light: 'dark', dark: 'system', system: 'light' }[get().pref];
    get().setPref(next);
  },
}));

// Follow OS changes while on "system"
media?.addEventListener?.('change', () => {
  const { pref } = useThemeStore.getState();
  if (pref === 'system') {
    apply(pref);
    useThemeStore.setState({ dark: isDark(pref) });
  }
});

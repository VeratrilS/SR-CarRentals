import { useThemeStore } from '../../store/theme.store';

const LABELS = { light: 'Light theme', dark: 'Dark theme', system: 'System theme' };

function Icon({ pref }) {
  const common = { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' };
  if (pref === 'light') {
    return (
      <svg {...common}><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>
    );
  }
  if (pref === 'dark') {
    return <svg {...common}><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" /></svg>;
  }
  return <svg {...common}><rect x="3" y="4" width="18" height="12" rx="2" /><path d="M8 20h8M12 16v4" /></svg>;
}

/** Cycles Light → Dark → System. */
export default function ThemeToggle({ className = '' }) {
  const { pref, cycle } = useThemeStore();
  return (
    <button
      type="button"
      onClick={cycle}
      title={`${LABELS[pref]} — click to change`}
      aria-label={`${LABELS[pref]}. Click to change theme`}
      className={`p-2 rounded-lg text-gray-600 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-gray-800 dark:hover:text-white transition-all duration-300 active:rotate-45 ${className}`}
    >
      <Icon pref={pref} />
    </button>
  );
}

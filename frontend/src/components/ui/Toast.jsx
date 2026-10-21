import { useState, useCallback, createContext, useContext, useRef } from 'react';

const ToastContext = createContext(null);

export function useToast() {
  return useContext(ToastContext);
}

const ICONS = {
  success: '✓',
  error: '✕',
  warning: '!',
  info: 'i',
};

const COLORS = {
  success: 'bg-green-600',
  error: 'bg-red-600',
  warning: 'bg-amber-600',
  info: 'bg-blue-600',
};

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const nextId = useRef(0);

  const showToast = useCallback((message, type = 'info') => {
    const id = ++nextId.current;
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 4000);
  }, []);

  return (
    <ToastContext.Provider value={showToast}>
      {children}
      <div className="fixed top-20 right-4 left-4 sm:left-auto z-[100] flex flex-col gap-2 sm:max-w-sm" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} role="status" className={`${COLORS[t.type]} text-white px-4 py-3 rounded-xl shadow-xl ring-1 ring-black/10 flex items-center gap-3 text-sm font-medium animate-slide-in`}>
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/20 font-bold">{ICONS[t.type]}</span>
            <span>{t.message}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

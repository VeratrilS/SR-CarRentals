import { useEffect, useState } from 'react';

/**
 * Live mm:ss countdown until the car hold expires. Calls onExpire once at zero.
 */
export default function HoldCountdown({ until, onExpire }) {
  const [msLeft, setMsLeft] = useState(() => new Date(until) - Date.now());

  useEffect(() => {
    const tick = setInterval(() => {
      const left = new Date(until) - Date.now();
      setMsLeft(left);
      if (left <= 0) {
        clearInterval(tick);
        onExpire?.();
      }
    }, 1000);
    return () => clearInterval(tick);
  }, [until]);

  if (msLeft <= 0) return <span className="font-mono font-bold">0:00</span>;

  const total = Math.floor(msLeft / 1000);
  const mm = Math.floor(total / 60);
  const ss = String(total % 60).padStart(2, '0');
  return <span className={`font-mono font-bold ${total < 120 ? 'text-red-600 dark:text-red-400' : ''}`}>{mm}:{ss}</span>;
}

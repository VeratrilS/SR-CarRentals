import { useState } from 'react';
import { CATEGORY_ICONS } from '../../utils/constants';

/** Photo path for a car name, e.g. "Hyundai Creta" → /cars/hyundai-creta.jpg */
export const carImageFor = (carName = '') =>
  `/cars/${carName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}.jpg`;

/**
 * Car photo that fades in when loaded and falls back to a category illustration
 * if there is no photo (or it fails to load).
 */
export default function CarImage({ src, alt, category, className = '', zoomOnHover = false }) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(!src);

  return (
    <div className={`relative overflow-hidden bg-gradient-to-br from-primary-50 to-slate-100 dark:from-gray-800 dark:to-gray-900 ${className}`}>
      {!failed && (
        <img
          src={src}
          alt={alt}
          loading="lazy"
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
          className={`absolute inset-0 w-full h-full object-cover transition-all duration-700 ease-out
            ${loaded ? 'opacity-100 scale-100' : 'opacity-0 scale-105'}
            ${zoomOnHover ? 'group-hover:scale-110' : ''}`}
        />
      )}
      {!failed && !loaded && <div className="absolute inset-0 skeleton rounded-none" />}
      {failed && (
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-6xl drop-shadow-sm" aria-hidden>{CATEGORY_ICONS[category] || '🚗'}</span>
        </div>
      )}
    </div>
  );
}

import { APP_NAME } from '../../utils/constants';

export default function Footer() {
  return (
    <footer className="bg-gray-900 text-gray-400 text-sm mt-auto">
      <div className="max-w-7xl mx-auto px-4 py-8 flex flex-col sm:flex-row justify-between gap-4">
        <div>
          <p className="font-semibold text-white">{APP_NAME}</p>
          <p className="text-gray-500 mt-1">Self-drive rentals and shared rides.</p>
        </div>
        <div className="text-gray-500 sm:text-right">
          <p>Free cancellation up to 24 hours before pickup</p>
          <p className="mt-1">© {new Date().getFullYear()} {APP_NAME}</p>
        </div>
      </div>
    </footer>
  );
}

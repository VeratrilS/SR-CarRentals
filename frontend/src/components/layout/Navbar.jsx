import { useEffect, useState } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../store/auth.store';
import ThemeToggle from './ThemeToggle';

const desktopLink = ({ isActive }) =>
  `px-3 py-2 rounded-lg text-sm font-semibold transition-colors ${
    isActive
      ? 'bg-primary-50 text-primary-700 dark:bg-primary-500/15 dark:text-primary-300'
      : 'text-gray-700 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-gray-800 dark:hover:text-white'
  }`;
const mobileLink = ({ isActive }) =>
  `block px-4 py-3 rounded-lg text-base font-semibold ${
    isActive
      ? 'bg-primary-50 text-primary-700 dark:bg-primary-500/15 dark:text-primary-300'
      : 'text-gray-800 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-800'
  }`;

export default function Navbar() {
  const { user, isAuthenticated, logout } = useAuthStore();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);

  // Close the mobile menu whenever the route changes
  useEffect(() => setMenuOpen(false), [pathname]);

  const handleLogout = async () => {
    await logout(); // revokes the session server-side, then clears local state
    navigate('/login');
  };

  const links = (cls) => (
    <>
      <NavLink to="/search" className={cls}>Rent a car</NavLink>
      <NavLink to="/rides" className={cls}>Book a seat</NavLink>
      {isAuthenticated && <NavLink to="/bookings" className={cls}>My trips</NavLink>}
      {user?.role === 'ADMIN' && <NavLink to="/admin" className={cls}>Fleet admin</NavLink>}
    </>
  );

  const initials = `${user?.firstName?.[0] || ''}${user?.lastName?.[0] || ''}`.toUpperCase() || '?';

  return (
    <nav className="sticky top-0 z-40 border-b border-gray-200/80 bg-white/85 backdrop-blur-lg dark:border-gray-800 dark:bg-gray-950/85">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="flex items-center justify-between h-16">
          <Link to="/" className="flex items-center gap-2.5 text-xl font-extrabold tracking-tight text-gray-900 dark:text-white">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary-600 text-white shadow-sm shadow-primary-600/30" aria-hidden>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M5 15.5l1.6-4.4A2 2 0 0 1 8.5 9.8h7a2 2 0 0 1 1.9 1.3L19 15.5V19a1 1 0 0 1-1 1h-1a1 1 0 0 1-1-1v-1H8v1a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1z" />
                <circle cx="8.3" cy="15.6" r="1.1" fill="#0d9488" />
                <circle cx="15.7" cy="15.6" r="1.1" fill="#0d9488" />
              </svg>
            </span>
            <span>SR-<span className="text-primary-600 dark:text-primary-400">CarRentals</span></span>
          </Link>

          {/* Desktop */}
          <div className="hidden md:flex items-center gap-1.5">
            {links(desktopLink)}
            <ThemeToggle className="ml-1" />
            {isAuthenticated ? (
              <div className="flex items-center gap-3 ml-2 pl-3 border-l border-gray-200 dark:border-gray-800">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary-100 text-xs font-bold text-primary-800 dark:bg-primary-500/20 dark:text-primary-200" title={user?.firstName}>
                  {initials}
                </span>
                <button onClick={handleLogout} className="text-sm font-semibold text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white">
                  Logout
                </button>
              </div>
            ) : (
              <Link to="/login" className="btn-primary ml-2 py-2">
                Log in
              </Link>
            )}
          </div>

          {/* Mobile: theme + menu toggle */}
          <div className="md:hidden flex items-center text-gray-800 dark:text-gray-200">
            <ThemeToggle />
            <button
              className="p-2 -mr-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800"
              onClick={() => setMenuOpen((o) => !o)}
              aria-label={menuOpen ? 'Close menu' : 'Open menu'}
              aria-expanded={menuOpen}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                {menuOpen
                  ? <path d="M6 6l12 12M18 6L6 18" />
                  : <path d="M4 7h16M4 12h16M4 17h16" />}
              </svg>
            </button>
          </div>
        </div>

        {/* Mobile menu */}
        {menuOpen && (
          <div className="md:hidden pb-4 space-y-1 border-t border-gray-200 dark:border-gray-800 pt-3 animate-fade-in">
            {links(mobileLink)}
            {isAuthenticated ? (
              <div className="flex items-center justify-between px-4 pt-3 mt-2 border-t border-gray-200 dark:border-gray-800">
                <span className="font-medium text-gray-700 dark:text-gray-300">Hi, {user?.firstName}</span>
                <button onClick={handleLogout} className="btn-secondary py-1.5">Logout</button>
              </div>
            ) : (
              <Link to="/login" className="btn-primary w-full mt-2">Log in</Link>
            )}
          </div>
        )}
      </div>
    </nav>
  );
}

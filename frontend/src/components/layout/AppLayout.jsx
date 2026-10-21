import { Outlet, useLocation } from 'react-router-dom';
import Navbar from './Navbar';
import Footer from './Footer';
import { ToastProvider } from '../ui/Toast';
import ErrorBoundary from '../ui/ErrorBoundary';

export default function AppLayout() {
  const { pathname } = useLocation();
  return (
    <ToastProvider>
      <div className="flex flex-col min-h-screen">
        <Navbar />
        {/* key on path → each page fades in */}
        <main key={pathname} className="flex-1 animate-fade-in">
          <ErrorBoundary resetKey={pathname}>
            <Outlet />
          </ErrorBoundary>
        </main>
        <Footer />
      </div>
    </ToastProvider>
  );
}

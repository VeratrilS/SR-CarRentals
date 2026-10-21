import { Routes, Route } from 'react-router-dom';
import AppLayout from '../components/layout/AppLayout';
import ProtectedRoute from './ProtectedRoute';
import HomePage from '../pages/HomePage';
import LoginPage from '../pages/LoginPage';
import SearchPage from '../pages/SearchPage';
import RidesPage from '../pages/RidesPage';
import SeatSelectionPage from '../pages/SeatSelectionPage';
import BookingPage from '../pages/BookingPage';
import BookingDetailPage from '../pages/BookingDetailPage';
import MyBookingsPage from '../pages/MyBookingsPage';
import AdminPage from '../pages/AdminPage';
import NotFoundPage from '../pages/NotFoundPage';

export default function AppRouter() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route path="/" element={<HomePage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/search" element={<SearchPage />} />
        <Route path="/rides" element={<RidesPage />} />

        <Route element={<ProtectedRoute />}>
          <Route path="/book/:carId" element={<BookingPage />} />
          <Route path="/rides/:tripId" element={<SeatSelectionPage />} />
          <Route path="/bookings" element={<MyBookingsPage />} />
          <Route path="/bookings/:bookingId" element={<BookingDetailPage />} />
        </Route>

        <Route element={<ProtectedRoute requireAdmin />}>
          <Route path="/admin" element={<AdminPage />} />
        </Route>

        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}

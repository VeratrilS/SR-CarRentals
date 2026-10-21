import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { adminApi } from '../../api/admin.api';
import { useToast } from '../ui/Toast';
import Button from '../ui/Button';
import Badge from '../ui/Badge';
import Modal from '../ui/Modal';
import { toLocalInputValue } from '../../utils/format';

const EMPTY = { routeId: '', carId: '', departureAt: '', driverName: '', farePerKm: '2.5' };

export default function TripManager() {
  const [trips, setTrips] = useState([]);
  const [routes, setRoutes] = useState([]);
  const [cars, setCars] = useState([]);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [cancelling, setCancelling] = useState(null);
  const showToast = useToast();

  const load = () => adminApi.getTrips({ upcoming: 'true' }).then((r) => setTrips(r.data || [])).catch((e) => showToast(e.message, 'error'));

  useEffect(() => {
    load();
    adminApi.getRoutes().then((r) => setRoutes(r.data || [])).catch(() => {});
    adminApi.getCars({ status: 'ACTIVE' }).then((r) => setCars((r.data || []).filter((c) => c.seats >= 4))).catch(() => {});
  }, []);

  const set = (field) => (e) => setForm({ ...form, [field]: e.target.value });

  const schedule = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await adminApi.scheduleTrip({ ...form, departureAt: new Date(form.departureAt).toISOString(), farePerKm: Number(form.farePerKm) });
      showToast('Trip scheduled — the car is blocked for rentals during it', 'success');
      setForm({ ...EMPTY, routeId: form.routeId });
      load();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const confirmCancel = async () => {
    try {
      await adminApi.cancelTrip(cancelling.id);
      showToast('Trip cancelled — passengers are refunded automatically', 'success');
      load();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setCancelling(null);
    }
  };

  return (
    <div className="space-y-6">
      <form onSubmit={schedule} className="card">
        <h3 className="font-semibold mb-4">Schedule a trip</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <label className="text-sm">
            <span className="block font-medium mb-1">Route</span>
            <select className="input-field" value={form.routeId} onChange={set('routeId')} required>
              <option value="">Select route</option>
              {routes.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </label>
          <label className="text-sm">
            <span className="block font-medium mb-1">Car</span>
            <select className="input-field" value={form.carId} onChange={set('carId')} required>
              <option value="">Select car</option>
              {cars.map((c) => <option key={c.id} value={c.id}>{c.make} {c.model} · {c.seats - 1} passenger seats · {c.branch?.code}</option>)}
            </select>
          </label>
          <label className="text-sm">
            <span className="block font-medium mb-1">Departure</span>
            <input className="input-field" type="datetime-local" min={toLocalInputValue(new Date())} value={form.departureAt} onChange={set('departureAt')} required />
          </label>
          <label className="text-sm">
            <span className="block font-medium mb-1">Driver name</span>
            <input className="input-field" value={form.driverName} onChange={set('driverName')} placeholder="e.g. Ravi Kumar" required />
          </label>
          <label className="text-sm">
            <span className="block font-medium mb-1">Fare per km (₹, per seat)</span>
            <input className="input-field" type="number" min="0.5" step="0.1" value={form.farePerKm} onChange={set('farePerKm')} required />
          </label>
          <div className="flex items-end">
            <Button type="submit" loading={saving} className="w-full">Schedule trip</Button>
          </div>
        </div>
      </form>

      <div className="card">
        <h3 className="font-semibold mb-4">Upcoming trips <span className="text-gray-500 font-normal">({trips.length})</span></h3>
        {trips.length === 0 ? (
          <p className="text-sm text-gray-600 dark:text-gray-400">No upcoming trips.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th className="py-2">Route</th>
                  <th className="py-2">Departs</th>
                  <th className="py-2">Car</th>
                  <th className="py-2">Driver</th>
                  <th className="py-2 text-right pr-4">₹/km</th>
                  <th className="py-2">Status</th>
                  <th className="py-2" />
                </tr>
              </thead>
              <tbody>
                {trips.map((t) => (
                  <tr key={t.id} className="border-b border-gray-100 dark:border-gray-800">
                    <td className="py-2 font-medium">{t.route?.name}</td>
                    <td className="py-2">{format(new Date(t.departureAt), 'dd MMM, hh:mm a')}</td>
                    <td className="py-2">{t.car?.make} {t.car?.model}</td>
                    <td className="py-2">{t.driverName}</td>
                    <td className="py-2 text-right pr-4">{t.farePerKm}</td>
                    <td className="py-2"><Badge status={t.status === 'SCHEDULED' ? 'ACTIVE' : 'CANCELLED'} /></td>
                    <td className="py-2 text-right">
                      {t.status === 'SCHEDULED' && (
                        <Button variant="danger" className="text-xs py-1 px-2" onClick={() => setCancelling(t)}>Cancel</Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal
        open={!!cancelling}
        onClose={() => setCancelling(null)}
        title="Cancel this trip?"
        confirmText="Cancel trip"
        onConfirm={confirmCancel}
        danger
      >
        Every passenger booked on it will be cancelled and fully refunded, and the car becomes available for rentals again.
      </Modal>
    </div>
  );
}

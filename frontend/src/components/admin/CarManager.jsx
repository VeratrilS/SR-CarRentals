import { useState, useEffect } from 'react';
import { adminApi } from '../../api/admin.api';
import { useToast } from '../ui/Toast';
import Button from '../ui/Button';
import Input from '../ui/Input';
import Select from '../ui/Select';
import Badge from '../ui/Badge';
import Modal from '../ui/Modal';
import { CAR_CATEGORIES, TRANSMISSIONS, FUEL_TYPES } from '../../utils/constants';
import { formatCategory, formatCurrency, titleCase } from '../../utils/format';
import CarImage from '../ui/CarImage';

const toOptions = (values, label = titleCase) => values.map((v) => ({ value: v, label: label(v) }));

const EMPTY = {
  registrationNumber: '', make: '', model: '', year: new Date().getFullYear(),
  category: 'HATCHBACK', transmission: 'MANUAL', fuelType: 'PETROL',
  seats: 5, dailyRate: '', branchId: '', imageUrl: '',
};

export default function CarManager() {
  const [cars, setCars] = useState([]);
  const [branches, setBranches] = useState([]);
  const [filterBranch, setFilterBranch] = useState('');
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [pendingStatus, setPendingStatus] = useState(null); // { car, status }
  const showToast = useToast();

  const fetchCars = async (branchId = filterBranch) => {
    setLoading(true);
    try {
      const res = await adminApi.getCars({ branchId });
      setCars(res.data || []);
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    adminApi.getBranches(1, 100).then((res) => setBranches(res.data || [])).catch(() => {});
    fetchCars();
  }, []);

  const set = (field) => (e) => setForm({ ...form, [field]: e.target.value });

  const handleCreate = async (e) => {
    e.preventDefault();
    setCreating(true);
    try {
      await adminApi.createCar({
        ...form,
        year: parseInt(form.year, 10),
        seats: parseInt(form.seats, 10),
        dailyRate: parseFloat(form.dailyRate),
        imageUrl: form.imageUrl || undefined,
      });
      showToast('Car added to fleet!', 'success');
      setForm({ ...EMPTY, branchId: form.branchId });
      fetchCars();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setCreating(false);
    }
  };

  const confirmStatusChange = async () => {
    const { car, status } = pendingStatus;
    try {
      await adminApi.setCarStatus(car.id, status);
      showToast(`${car.make} ${car.model} is now ${status.toLowerCase()}`, 'success');
      fetchCars();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setPendingStatus(null);
    }
  };

  const changeRate = async (car) => {
    const value = window.prompt(`New daily rate for ${car.make} ${car.model} (₹)`, car.dailyRate);
    if (value == null) return;
    const rate = parseFloat(value);
    if (!(rate > 0)) { showToast('Enter a positive amount', 'warning'); return; }
    try {
      await adminApi.updateCar(car.id, { dailyRate: rate });
      showToast('Rate updated — applies to new bookings', 'success');
      fetchCars();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const branchOptions = branches.map((b) => ({ value: b.id, label: `${b.name} (${b.code})` }));

  return (
    <div>
      <form onSubmit={handleCreate} className="card mb-6">
        <h3 className="font-semibold mb-4">Add a car</h3>
        {branches.length === 0 && (
          <p className="text-sm text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 rounded p-3 mb-4">Create a branch first — every car belongs to a branch.</p>
        )}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Input label="Registration no." value={form.registrationNumber} onChange={set('registrationNumber')} placeholder="TS09 AB 1234" required />
          <Input label="Make" value={form.make} onChange={set('make')} placeholder="Hyundai" required />
          <Input label="Model" value={form.model} onChange={set('model')} placeholder="Creta" required />
          <Input label="Year" type="number" value={form.year} onChange={set('year')} required />
          <Select label="Category" value={form.category} onChange={set('category')} options={toOptions(CAR_CATEGORIES, formatCategory)} />
          <Select label="Transmission" value={form.transmission} onChange={set('transmission')} options={toOptions(TRANSMISSIONS)} />
          <Select label="Fuel" value={form.fuelType} onChange={set('fuelType')} options={toOptions(FUEL_TYPES)} />
          <Input label="Seats" type="number" min={2} max={12} value={form.seats} onChange={set('seats')} required />
          <Input label="Daily rate (₹)" type="number" min={1} value={form.dailyRate} onChange={set('dailyRate')} required />
          <Select label="Branch" value={form.branchId} onChange={set('branchId')} options={branchOptions} placeholder="Select branch" required />
          <Input label="Image URL (optional)" value={form.imageUrl} onChange={set('imageUrl')} className="col-span-2" />
        </div>
        <Button type="submit" loading={creating} disabled={branches.length === 0} className="mt-4">Add car</Button>
      </form>

      <div className="card">
        <div className="flex items-center justify-between mb-4 gap-3">
          <h3 className="font-semibold">Fleet <span className="text-gray-500 dark:text-gray-400 font-normal">({cars.length})</span></h3>
          <select
            value={filterBranch}
            onChange={(e) => { setFilterBranch(e.target.value); fetchCars(e.target.value); }}
            className="input-field max-w-xs"
          >
            <option value="">All branches</option>
            {branchOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>

        {loading ? <p className="text-center py-4 text-gray-500 dark:text-gray-400">Loading...</p> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th className="py-2">Car</th>
                  <th className="py-2">Reg. no.</th>
                  <th className="py-2">Branch</th>
                  <th className="py-2 pr-6 text-right">Rate/day</th>
                  <th className="py-2">Status</th>
                  <th className="py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {cars.map((c) => (
                  <tr key={c.id} className="border-b border-gray-50 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800">
                    <td className="py-2">
                      <div className="flex items-center gap-3">
                      <CarImage src={c.imageUrl} alt={`${c.make} ${c.model}`} category={c.category} className="h-10 w-16 rounded-md shrink-0" />
                      <div>
                      <p className="font-medium">{c.make} {c.model} <span className="text-gray-500 dark:text-gray-400">{c.year}</span></p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">{formatCategory(c.category)} · {titleCase(c.transmission)} · {titleCase(c.fuelType)} · {c.seats} seats</p>
                      </div>
                      </div>
                    </td>
                    <td className="py-2 font-mono text-xs">{c.registrationNumber}</td>
                    <td className="py-2">{c.branch?.code}</td>
                    <td className="py-2 pr-6 text-right">
                      <button onClick={() => changeRate(c)} className="hover:underline" title="Change rate">{formatCurrency(c.dailyRate)}</button>
                    </td>
                    <td className="py-2"><Badge status={c.status} /></td>
                    <td className="py-2 text-right space-x-1 whitespace-nowrap">
                      {c.status === 'ACTIVE' && (
                        <Button variant="secondary" onClick={() => setPendingStatus({ car: c, status: 'MAINTENANCE' })} className="text-xs py-1 px-2">Maintenance</Button>
                      )}
                      {c.status === 'MAINTENANCE' && (
                        <Button variant="secondary" onClick={() => setPendingStatus({ car: c, status: 'ACTIVE' })} className="text-xs py-1 px-2">Re-activate</Button>
                      )}
                      {c.status !== 'RETIRED' && (
                        <Button variant="danger" onClick={() => setPendingStatus({ car: c, status: 'RETIRED' })} className="text-xs py-1 px-2">Retire</Button>
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
        open={!!pendingStatus}
        onClose={() => setPendingStatus(null)}
        title={pendingStatus ? `Set ${pendingStatus.car.make} ${pendingStatus.car.model} to ${pendingStatus.status.toLowerCase()}?` : ''}
        confirmText="Confirm"
        onConfirm={confirmStatusChange}
        danger={pendingStatus?.status !== 'ACTIVE'}
      >
        {pendingStatus?.status === 'ACTIVE'
          ? 'The car will become bookable again.'
          : 'All upcoming bookings for this car will be cancelled and customers fully refunded.'}
      </Modal>
    </div>
  );
}

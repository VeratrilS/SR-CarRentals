import { useEffect, useState } from 'react';
import { adminApi } from '../../api/admin.api';
import { useToast } from '../ui/Toast';
import Button from '../ui/Button';

const newStop = () => ({ branchId: '', offsetMinutes: '', distanceKm: '' });

export default function RouteManager() {
  const [routes, setRoutes] = useState([]);
  const [branches, setBranches] = useState([]);
  const [name, setName] = useState('');
  const [stops, setStops] = useState([newStop(), newStop()]);
  const [saving, setSaving] = useState(false);
  const showToast = useToast();

  const load = () => adminApi.getRoutes().then((r) => setRoutes(r.data || [])).catch((e) => showToast(e.message, 'error'));

  useEffect(() => {
    load();
    adminApi.getBranches(1, 100).then((r) => setBranches(r.data || [])).catch(() => {});
  }, []);

  const update = (i, field, value) => setStops((s) => s.map((st, idx) => (idx === i ? { ...st, [field]: value } : st)));

  const create = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await adminApi.createRoute({
        name: name.trim() || undefined,
        stops: stops.map((s, i) => ({
          branchId: s.branchId,
          offsetMinutes: i === 0 ? 0 : Number(s.offsetMinutes),
          distanceKm: i === 0 ? 0 : Number(s.distanceKm),
        })),
      });
      showToast('Route created', 'success');
      setName('');
      setStops([newStop(), newStop()]);
      load();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <form onSubmit={create} className="card">
        <h3 className="font-semibold mb-1">Create a route</h3>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
          List the stops in travel order. Time and distance are measured from the first stop.
        </p>
        <input className="input-field max-w-sm mb-4" placeholder="Route name (optional, e.g. Hyderabad → Vijayawada)" value={name} onChange={(e) => setName(e.target.value)} />

        <div className="space-y-2">
          <div className="hidden sm:grid grid-cols-[32px_1fr_150px_150px_32px] gap-2 text-xs font-semibold uppercase text-gray-500 dark:text-gray-400">
            <span>#</span><span>Stop (branch)</span><span>Minutes after start</span><span>Km from start</span><span />
          </div>
          {stops.map((s, i) => (
            <div key={i} className="grid grid-cols-[32px_1fr] sm:grid-cols-[32px_1fr_150px_150px_32px] gap-2 items-center">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary-600 text-white text-sm font-bold">{i + 1}</span>
              <select className="input-field" value={s.branchId} onChange={(e) => update(i, 'branchId', e.target.value)} required>
                <option value="">Select a branch</option>
                {branches.map((b) => <option key={b.id} value={b.id}>{b.name} — {b.city}</option>)}
              </select>
              <input className="input-field" type="number" min={0} placeholder="0" disabled={i === 0} value={i === 0 ? 0 : s.offsetMinutes} onChange={(e) => update(i, 'offsetMinutes', e.target.value)} required />
              <input className="input-field" type="number" min={0} step="0.1" placeholder="0" disabled={i === 0} value={i === 0 ? 0 : s.distanceKm} onChange={(e) => update(i, 'distanceKm', e.target.value)} required />
              {stops.length > 2 && i > 0 ? (
                <button type="button" onClick={() => setStops((st) => st.filter((_, idx) => idx !== i))} className="text-red-600 text-xl" aria-label={`Remove stop ${i + 1}`}>×</button>
              ) : <span />}
            </div>
          ))}
        </div>
        <div className="flex gap-3 mt-4">
          <Button type="button" variant="secondary" onClick={() => setStops((s) => [...s, newStop()])}>+ Add stop</Button>
          <Button type="submit" loading={saving}>Create route</Button>
        </div>
      </form>

      <div className="card">
        <h3 className="font-semibold mb-4">Routes <span className="text-gray-500 font-normal">({routes.length})</span></h3>
        {routes.length === 0 ? (
          <p className="text-sm text-gray-600 dark:text-gray-400">No routes yet.</p>
        ) : (
          <div className="space-y-3">
            {routes.map((r) => (
              <div key={r.id} className="rounded-xl border border-gray-200 dark:border-gray-700 p-4">
                <div className="flex justify-between items-center mb-2">
                  <p className="font-semibold">{r.name}</p>
                  <span className="text-xs text-gray-500 dark:text-gray-400">{r._count?.trips ?? 0} trip(s)</span>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  {r.stops.map((s, i) => (
                    <span key={s.id} className="flex items-center gap-2">
                      <span className="rounded-lg bg-gray-100 dark:bg-gray-800 px-2.5 py-1">
                        {s.branch.name} <span className="text-gray-500 dark:text-gray-400">+{s.offsetMinutes}m · {s.distanceKm}km</span>
                      </span>
                      {i < r.stops.length - 1 && <span className="text-gray-400">→</span>}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

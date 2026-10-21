import { useState, useEffect } from 'react';
import { adminApi } from '../../api/admin.api';
import { useToast } from '../ui/Toast';
import Button from '../ui/Button';
import Input from '../ui/Input';
import Pagination from '../ui/Pagination';

const EMPTY = { name: '', code: '', city: '', state: '', address: '', openTime: '08:00', closeTime: '22:00' };

export default function BranchManager() {
  const [branches, setBranches] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, totalPages: 1 });
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [creating, setCreating] = useState(false);
  const showToast = useToast();

  const fetchBranches = async (page = 1) => {
    setLoading(true);
    try {
      const res = await adminApi.getBranches(page, 20, search);
      setBranches(res.data || []);
      setPagination(res.pagination || { page: 1, totalPages: 1 });
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchBranches(); }, []);

  const set = (field) => (e) => setForm({ ...form, [field]: field === 'code' ? e.target.value.toUpperCase() : e.target.value });

  const handleCreate = async (e) => {
    e.preventDefault();
    setCreating(true);
    try {
      await adminApi.createBranch(form);
      showToast('Branch created!', 'success');
      setForm(EMPTY);
      fetchBranches();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div>
      <form onSubmit={handleCreate} className="card mb-6">
        <h3 className="font-semibold mb-4">Add a branch</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Input label="Name" value={form.name} onChange={set('name')} placeholder="Hitech City" required />
          <Input label="Code" value={form.code} onChange={set('code')} placeholder="HYD-HTC" required maxLength={12} />
          <Input label="City" value={form.city} onChange={set('city')} placeholder="Hyderabad" required />
          <Input label="State" value={form.state} onChange={set('state')} placeholder="Telangana" />
          <Input label="Address" value={form.address} onChange={set('address')} className="col-span-2" />
          <Input label="Opens" type="time" value={form.openTime} onChange={set('openTime')} />
          <Input label="Closes" type="time" value={form.closeTime} onChange={set('closeTime')} />
        </div>
        <Button type="submit" loading={creating} className="mt-4">Create branch</Button>
      </form>

      <div className="card">
        <div className="flex items-center justify-between mb-4 gap-3">
          <h3 className="font-semibold">Branches</h3>
          <form onSubmit={(e) => { e.preventDefault(); fetchBranches(1); }} className="flex gap-2">
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search..." className="input-field max-w-[200px]" />
            <Button type="submit" variant="secondary">Search</Button>
          </form>
        </div>

        {loading ? (
          <p className="text-center py-8 text-gray-500 dark:text-gray-400">Loading...</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th className="py-2">Name</th>
                  <th className="py-2">Code</th>
                  <th className="py-2">City</th>
                  <th className="py-2">Hours</th>
                  <th className="py-2 text-right">Cars</th>
                </tr>
              </thead>
              <tbody>
                {branches.map((b) => (
                  <tr key={b.id} className="border-b border-gray-50 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800">
                    <td className="py-2">
                      <p className="font-medium">{b.name}</p>
                      {b.address && <p className="text-xs text-gray-500 dark:text-gray-400">{b.address}</p>}
                    </td>
                    <td className="py-2 font-mono">{b.code}</td>
                    <td className="py-2">{b.city}{b.state ? `, ${b.state}` : ''}</td>
                    <td className="py-2">{b.openTime}–{b.closeTime}</td>
                    <td className="py-2 text-right">{b._count?.cars ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pagination page={pagination.page} totalPages={pagination.totalPages} onPageChange={fetchBranches} />
      </div>
    </div>
  );
}

import { useState } from 'react';
import AdminTabs from '../components/admin/AdminTabs';
import BranchManager from '../components/admin/BranchManager';
import CarManager from '../components/admin/CarManager';
import RouteManager from '../components/admin/RouteManager';
import TripManager from '../components/admin/TripManager';

export default function AdminPage() {
  const [tab, setTab] = useState('Fleet');

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-6">Fleet admin</h1>
      <AdminTabs active={tab} onChange={setTab} />

      {tab === 'Fleet' && <CarManager />}
      {tab === 'Branches' && <BranchManager />}
      {tab === 'Routes' && <RouteManager />}
      {tab === 'Trips' && <TripManager />}
    </div>
  );
}

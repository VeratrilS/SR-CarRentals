const TABS = ['Fleet', 'Branches', 'Routes', 'Trips'];

export default function AdminTabs({ active, onChange }) {
  return (
    <div className="flex border-b mb-6 overflow-x-auto">
      {TABS.map((tab) => (
        <button
          key={tab}
          onClick={() => onChange(tab)}
          className={`px-5 py-3 text-sm font-semibold whitespace-nowrap border-b-2 transition-colors ${
            active === tab
              ? 'border-primary-700 dark:border-primary-400 text-primary-800 dark:text-primary-300'
              : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-600 dark:hover:text-gray-300'
          }`}
        >
          {tab}
        </button>
      ))}
    </div>
  );
}

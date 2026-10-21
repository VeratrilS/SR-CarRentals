export default function EmptyState({ title = 'No results found', message, icon = '🔎', children }) {
  return (
    <div className="text-center py-16 animate-fade-in-up">
      <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-gray-100 dark:bg-gray-800 text-4xl">
        <span aria-hidden>{icon}</span>
      </div>
      <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100">{title}</h3>
      {message && <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">{message}</p>}
      {children && <div className="mt-5">{children}</div>}
    </div>
  );
}

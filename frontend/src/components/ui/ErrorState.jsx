import Button from './Button';

/** Inline "couldn't load this" panel with a retry action. */
export default function ErrorState({ title = "Couldn't load this", message, onRetry, retrying = false }) {
  return (
    <div className="card text-center py-10 animate-fade-in-up" role="alert">
      <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-50 text-3xl dark:bg-red-500/10" aria-hidden>
        ⚠️
      </div>
      <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{title}</h3>
      {message && <p className="text-sm text-gray-600 dark:text-gray-400 mt-1 max-w-md mx-auto">{message}</p>}
      {onRetry && (
        <Button onClick={onRetry} loading={retrying} variant="secondary" className="mt-5">
          Try again
        </Button>
      )}
    </div>
  );
}

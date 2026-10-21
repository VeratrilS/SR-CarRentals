import { Link } from 'react-router-dom';
import Button from '../components/ui/Button';

export default function NotFoundPage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] px-4 text-center animate-fade-in-up">
      <p className="text-7xl mb-2 animate-float inline-block" aria-hidden>🚧</p>
      <h1 className="text-6xl font-extrabold text-gray-300 dark:text-gray-700 mb-2">404</h1>
      <p className="text-xl font-semibold text-gray-800 dark:text-gray-100">Wrong turn!</p>
      <p className="text-gray-600 dark:text-gray-400 mt-1 mb-6">This road doesn't lead anywhere. Let's get you back on track.</p>
      <div className="flex gap-3">
        <Link to="/"><Button>Go home</Button></Link>
        <Link to="/search"><Button variant="secondary">Find a car</Button></Link>
      </div>
    </div>
  );
}

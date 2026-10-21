import { Component } from 'react';

/**
 * Last line of defence: if a page throws while rendering, show a friendly
 * screen instead of a blank page. Resets when the route changes.
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('UI crashed:', error, info?.componentStack);
  }

  componentDidUpdate(prevProps) {
    if (this.state.error && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ error: null });
    }
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] px-4 text-center animate-fade-in-up">
        <p className="text-6xl mb-3" aria-hidden>🛠️</p>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Something went wrong on this page</h1>
        <p className="text-gray-600 dark:text-gray-400 mt-2 mb-6 max-w-md">
          It's not you — we hit an unexpected error. Reloading usually fixes it.
        </p>
        <div className="flex gap-3">
          <button className="btn-primary" onClick={() => window.location.reload()}>Reload page</button>
          <a className="btn-secondary" href="/">Go home</a>
        </div>
      </div>
    );
  }
}

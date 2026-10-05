import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Top-level safety net: if a page throws during render, this shows a plain
 * recovery screen instead of a blank white page. It never swallows errors
 * silently — they're still logged to the console (and this is the one spot
 * to wire up real error reporting, e.g. Sentry, later).
 */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Unhandled UI error:', error, info.componentStack);
  }

  handleReload = (): void => {
    this.setState({ error: null });
    window.location.assign('/');
  };

  render(): ReactNode {
    if (this.state.error) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-bg px-4">
          <div className="max-w-md text-center bg-panel border border-line rounded-2xl p-8 shadow-sm">
            <h1 className="text-lg font-bold mb-2">Something went wrong</h1>
            <p className="text-sm text-ink-soft mb-5">
              This screen hit an unexpected error. Reloading usually fixes it — your data is safe.
            </p>
            <button
              onClick={this.handleReload}
              className="px-4 py-2.5 rounded-lg text-white font-semibold text-sm bg-blue hover:brightness-110"
            >
              Reload app
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

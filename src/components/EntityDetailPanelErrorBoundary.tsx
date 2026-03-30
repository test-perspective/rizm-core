import { Component, type ErrorInfo, type ReactNode } from 'react';

type Props = {
  children: ReactNode;
  entityId?: string;
  entityProperties?: Record<string, unknown>;
  onClose?: () => void;
};

type State = {
  hasError: boolean;
  error: Error | null;
};

/**
 * Error boundary for EntityDetailPanel. Catches rendering errors (e.g. from
 * malformed BlockNote docs in imported Jira comments) and shows a fallback
 * instead of a blank screen.
 */
export class EntityDetailPanelErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error('[EntityDetailPanel] Rendering error:', error, errorInfo);
  }

  componentDidUpdate(prevProps: Props): void {
    if (prevProps.entityId !== this.props.entityId && this.state.hasError) {
      this.setState({ hasError: false, error: null });
    }
  }

  render(): ReactNode {
    if (this.state.hasError && this.state.error) {
      return (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="mx-4 max-w-md rounded-lg border border-zinc-700 bg-zinc-900 p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-red-400">Failed to load task details</h3>
            <p className="mt-2 text-sm text-zinc-300">
              This task may have been imported with incompatible data. Try refreshing or contact support if the issue
              persists.
            </p>
            <p className="mt-2 text-xs text-zinc-500 font-mono">{this.state.error.message}</p>
            {this.props.entityProperties && (
              <button
                type="button"
                onClick={() => {
                  const json = JSON.stringify(this.props.entityProperties, null, 2);
                  void navigator.clipboard.writeText(json);
                }}
                className="mt-2 text-xs text-zinc-400 hover:text-zinc-200 underline"
              >
                Copy raw properties for debugging
              </button>
            )}
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => this.setState({ hasError: false, error: null })}
                className="rounded-md bg-zinc-700 px-3 py-2 text-sm text-white hover:bg-zinc-600"
              >
                Retry
              </button>
              <button
                type="button"
                onClick={this.props.onClose}
                className="rounded-md bg-violet-600 px-3 py-2 text-sm text-white hover:bg-violet-500"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

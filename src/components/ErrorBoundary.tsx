import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallbackTitle?: string;
  fallbackRender?: (error: Error, reset: () => void) => ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught an unhandled error:', error, errorInfo);
  }

  resetError = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallbackRender && this.state.error) {
        return this.props.fallbackRender(this.state.error, this.resetError);
      }

      return (
        <div className="rounded-xl border border-rose-900/60 bg-rose-950/30 p-4 text-xs space-y-2 text-rose-200">
          <div className="flex items-center gap-2 font-bold text-rose-300">
            <AlertTriangle className="w-4 h-4 text-rose-400" />
            <span>{this.props.fallbackTitle || '组件加载异常，已自动拦截保护页面'}</span>
          </div>
          <p className="text-[11px] text-rose-400 font-mono">
            {this.state.error?.message || '未知渲染异常'}
          </p>
          <button
            onClick={this.resetError}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-rose-900/80 hover:bg-rose-800 text-rose-100 text-[11px] font-semibold transition-colors"
          >
            <RefreshCw className="w-3 h-3" />
            重试加载
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

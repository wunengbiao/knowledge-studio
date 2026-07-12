import { AlertCircle, RefreshCw } from 'lucide-react'
import { Component, type ErrorInfo, type ReactNode } from 'react'

interface ErrorBoundaryProps {
  children: ReactNode
  fallback?: (error: Error, reset: () => void) => ReactNode
}

interface ErrorBoundaryState {
  error: Error | null
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[ErrorBoundary]', error, info.componentStack)
  }

  reset = (): void => {
    this.setState({ error: null })
  }

  render(): ReactNode {
    const { error } = this.state
    if (!error) return this.props.children
    if (this.props.fallback) return this.props.fallback(error, this.reset)
    return (
      <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2 m-2 text-sm text-red-700 dark:bg-red-950/40 dark:border-red-800 dark:text-red-300">
        <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0 break-words">
          <div className="font-medium mb-0.5">渲染出错</div>
          <div className="text-xs opacity-80 break-all">{error.message}</div>
        </div>
        <button
          type="button"
          onClick={this.reset}
          className="flex items-center gap-1 px-2 py-0.5 -mt-0.5 -mb-0.5 text-xs font-medium hover:bg-red-100 dark:hover:bg-red-900/40 rounded-md transition-colors shrink-0"
        >
          <RefreshCw className="w-3 h-3" />
          重试
        </button>
      </div>
    )
  }
}

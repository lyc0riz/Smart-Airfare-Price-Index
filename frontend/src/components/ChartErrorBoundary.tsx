import { ReactNode } from 'react'
import { ErrorBoundary } from './ErrorBoundary'
import { ChartSkeleton } from './ChartSkeleton'

interface ChartErrorBoundaryProps {
  children: ReactNode
  height?: number
}

export function ChartErrorBoundary({ children, height }: ChartErrorBoundaryProps) {
  return (
    <ErrorBoundary
      onError={(error) => console.error('Chart render error:', error)}
      fallback={(error, reset) => (
        <button
          type="button"
          className="block w-full"
          onClick={reset}
          aria-label={`Chart failed: ${String(error?.message ?? 'error')}. Click to retry.`}
        >
          <ChartSkeleton height={height} error />
        </button>
      )}
    >
      {children}
    </ErrorBoundary>
  )
}
import { cn } from '../lib/utils'

interface ChartSkeletonProps {
  height?: number
  className?: string
  error?: boolean
}

export function ChartSkeleton({ height = 320, className, error = false }: ChartSkeletonProps) {
  return (
    <div
      className={cn('flex w-full items-center justify-center rounded-sm border border-border bg-card', className)}
      style={{ height }}
      role="status"
      aria-label={error ? 'Chart failed to load' : 'Loading chart'}
    >
      {error ? (
        <span className="text-sm text-muted-foreground">Unable to display chart.</span>
      ) : (
        <div className="flex h-full w-full flex-col justify-end gap-2 p-4 animate-pulse">
          {[0.45, 0.62, 0.38, 0.72, 0.55, 0.8, 0.48, 0.66].map((h, i) => (
            <div
              key={i}
              className="w-8 rounded-sm bg-border"
              style={{ height: `${h * 100}%`, marginLeft: `${i * 14}%` }}
            />
          ))}
        </div>
      )}
      <span className="sr-only">{error ? 'Chart error' : 'Loading'}</span>
    </div>
  )
}
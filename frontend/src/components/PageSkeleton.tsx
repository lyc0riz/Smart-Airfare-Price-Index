import { cn } from '../lib/utils'

interface PageSkeletonProps {
  className?: string
  chart?: boolean
}

export function PageSkeleton({ className, chart = true }: PageSkeletonProps) {
  return (
    <div className={cn('animate-pulse', className)} role="status" aria-label="Loading page">
      <div className="border-b border-border bg-muted/50">
        <div className="container-gov py-8">
          <div className="h-3 w-40 rounded-sm bg-border" />
          <div className="mt-3 h-8 w-72 rounded-sm bg-border" />
          <div className="mt-3 h-4 w-full max-w-xl rounded-sm bg-border" />
        </div>
      </div>
      <div className="container-gov py-8">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="h-24 rounded-sm border border-border bg-card p-4">
              <div className="h-3 w-24 rounded-sm bg-border" />
              <div className="mt-3 h-6 w-32 rounded-sm bg-border" />
            </div>
          ))}
        </div>
        {chart && (
          <div className="mt-6 h-[320px] w-full rounded-sm border border-border bg-card" />
        )}
      </div>
      <span className="sr-only">Loading</span>
    </div>
  )
}
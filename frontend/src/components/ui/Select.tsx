import { forwardRef, SelectHTMLAttributes } from 'react'
import { cn } from '../../lib/utils'

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string
  error?: string
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, label, error, id, ...props }, ref) => {
    const generatedId = id || `select-${Math.random().toString(36).substr(2, 9)}`
    
    return (
      <div className="w-full">
        {label && (
          <label htmlFor={generatedId} className="mb-1 block text-[11px] uppercase tracking-[0.1em] text-muted-foreground">
            {label}
          </label>
        )}
        <select
          ref={ref}
          id={generatedId}
          aria-invalid={error ? true : undefined}
          className={cn(
            'h-9 w-full rounded-sm border border-border bg-background px-3 text-sm text-foreground',
            'focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent',
            'disabled:opacity-50 disabled:pointer-events-none',
            error && 'border-destructive',
            className
          )}
          {...props}
        />
        {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
      </div>
    )
  }
)

Select.displayName = 'Select'
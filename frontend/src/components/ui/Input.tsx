import { forwardRef, InputHTMLAttributes } from 'react'
import { cn } from '../../lib/utils'

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, error, id, type = 'text', ...props }, ref) => {
    const generatedId = id || `input-${Math.random().toString(36).substr(2, 9)}`
    
    return (
      <div className="w-full">
        {label && (
          <label htmlFor={generatedId} className="mb-1 block text-[11px] uppercase tracking-[0.1em] text-muted-foreground">
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={generatedId}
          type={type}
          className={cn(
            'h-9 w-full rounded-sm border border-border bg-background px-3 text-sm text-foreground',
            'placeholder:text-muted-foreground/50',
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

Input.displayName = 'Input'
import { forwardRef, InputHTMLAttributes } from 'react'
import { cn } from '../../lib/utils'

export interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label?: string
}

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(
  ({ className, label, id, ...props }, ref) => {
    const generatedId = id || `checkbox-${Math.random().toString(36).substr(2, 9)}`
    
    return (
      <div className="flex items-start gap-2">
        <input
          ref={ref}
          type="checkbox"
          id={generatedId}
          className={cn(
            'mt-0.5 h-4 w-4 shrink-0 rounded-sm border-border bg-background',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            'checked:bg-primary checked:border-primary',
            'disabled:opacity-50 disabled:pointer-events-none',
            className
          )}
          {...props}
        />
        {label && (
          <label htmlFor={generatedId} className="text-sm text-foreground cursor-pointer">
            {label}
          </label>
        )}
      </div>
    )
  }
)

Checkbox.displayName = 'Checkbox'
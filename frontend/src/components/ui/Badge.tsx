import { type ReactNode } from 'react'
import { cn } from '../../lib/utils'

interface BadgeProps {
  children: ReactNode
  variant?: 'default' | 'primary' | 'secondary' | 'success' | 'warning' | 'destructive' | 'outline'
  className?: string
}

export function Badge({ children, variant = 'default', className }: BadgeProps) {
  const variants = {
    default: 'border-border bg-secondary text-secondary-foreground',
    primary: 'border-primary bg-primary text-primary-foreground',
    secondary: 'border-secondary bg-secondary text-secondary-foreground',
    success: 'border-green-500 bg-green-500/10 text-green-700 dark:text-green-400',
    warning: 'border-yellow-500 bg-yellow-500/10 text-yellow-700 dark:text-yellow-400',
    destructive: 'border-destructive bg-destructive/10 text-destructive',
    outline: 'border-border bg-transparent',
  }
  
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-sm px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.1em]',
        variants[variant],
        className
      )}
    >
      {children}
    </span>
  )
}
import React from 'react'
import { Search, X } from 'lucide-react'

interface RouteSearchInputProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
}

export function RouteSearchInput({
  value,
  onChange,
  placeholder = 'Search route (e.g. DEL-BOM, Mumbai, BLR)',
  className = '',
}: RouteSearchInputProps) {
  return (
    <div className={`relative flex items-center ${className}`}>
      <label htmlFor="route-search" className="sr-only">
        Search routes
      </label>
      <Search
        className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
        aria-hidden="true"
      />
      <input
        id="route-search"
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-9 w-64 md:w-72 rounded-sm border border-border bg-background pl-8 pr-8 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary transition-colors"
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange('')}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-0.5 text-muted-foreground hover:text-foreground focus:outline-none"
          aria-label="Clear search"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  )
}

import { Link, useLocation } from 'react-router-dom'
import { Menu, Sun, Moon } from 'lucide-react'
import { useState } from 'react'
import { Button } from '../ui/Button'
import { ModeToggle } from '../mode-toggle/ModeToggle'
import { useTheme } from '../../hooks/useTheme'
import { cn } from '../../lib/utils'

const NAV_ITEMS = [
  { path: '/', label: 'Home' },
  { path: '/airfare-index', label: 'Airfare Index' },
  { path: '/route-analytics', label: 'Route Intelligence' },
  { path: '/price-trends', label: 'Price Trends' },
  { path: '/lead-time', label: 'Lead-Time Analysis' },
  { path: '/data-explorer', label: 'Data Explorer' },
  { path: '/api-docs', label: 'API Docs' },
]

export function Header() {
  const location = useLocation()
  const { theme, toggleTheme } = useTheme()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  return (
    <header className="border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-40">
      <div className="container-gov">
        <div className="flex h-16 items-center justify-between gap-4">
          <Link to="/" className="flex items-center gap-2 font-serif text-xl font-bold text-foreground" aria-label="APIx Home">
            <span className="flex h-7 w-7 items-center justify-center rounded-sm bg-primary text-primary-foreground">
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 2L4 5v6.09c0 5.05 3.41 9.76 8 10.91 4.59-1.15 8-5.86 8-10.91V5l-8-3z" />
                <path d="M12 2.18l6 2.25v4.66c0 4.14-2.73 8.01-6 9.08-3.27-1.07-6-4.94-6-9.08V6.43l6-2.25z" />
              </svg>
            </span>
            <span className="hidden sm:block">APIx</span>
          </Link>

          <nav className="hidden md:flex items-center gap-1" aria-label="Main navigation">
            {NAV_ITEMS.map((item) => (
              <Link
                key={item.path}
                to={item.path}
                className={cn(
                  'px-3 py-2 text-sm font-medium rounded-sm transition-colors',
                  location.pathname === item.path
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                )}
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="flex items-center gap-3">
            <ModeToggle />

            <Button
              variant="ghost"
              size="sm"
              onClick={toggleTheme}
              aria-label={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
            >
              {theme === 'light' ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
            </Button>

            <button
              className="md:hidden inline-flex h-10 w-10 items-center justify-center rounded-sm text-muted-foreground hover:bg-accent"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              aria-expanded={mobileMenuOpen}
              aria-controls="mobile-menu"
              aria-label="Toggle menu"
            >
              <Menu className="h-5 w-5" />
            </button>
          </div>
        </div>
      </div>

      {mobileMenuOpen && (
        <div id="mobile-menu" className="md:hidden border-t border-border bg-background py-4">
          <nav className="container-gov flex flex-col gap-1" aria-label="Mobile navigation">
            {NAV_ITEMS.map((item) => (
              <Link
                key={item.path}
                to={item.path}
                onClick={() => setMobileMenuOpen(false)}
                className={cn(
                  'px-3 py-2 text-sm font-medium rounded-sm transition-colors',
                  location.pathname === item.path
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                )}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
      )}
    </header>
  )
}
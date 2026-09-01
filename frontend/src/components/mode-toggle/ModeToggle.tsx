import { useDataProvider } from '../../hooks/useDataProvider'
import { Button } from '../ui/Button'
import { Sparkles, Database } from 'lucide-react'

export function ModeToggle() {
  const { mode, setMode } = useDataProvider()

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs font-medium text-muted-foreground">Mode:</span>
      <div className="inline-flex rounded-sm border border-border bg-background p-1">
        <Button
          variant={mode === 'prototype' ? 'primary' : 'ghost'}
          size="sm"
          onClick={() => setMode('prototype')}
          className="gap-1"
        >
          <Sparkles className="h-3.5 w-3.5" />
          Prototype
        </Button>
        <Button
          variant={mode === 'build' ? 'primary' : 'ghost'}
          size="sm"
          onClick={() => setMode('build')}
          className="gap-1"
        >
          <Database className="h-3.5 w-3.5" />
          Build
        </Button>
      </div>
      <span className={cn(
        'text-[10px] font-semibold uppercase tracking-[0.1em] px-2 py-0.5 rounded-sm',
        mode === 'prototype'
          ? 'bg-saffron/10 text-saffron'
          : 'bg-primary/10 text-primary'
      )}>
        {mode === 'prototype' ? 'Dummy Data' : 'Live API'}
      </span>
    </div>
  )
}

function cn(...classes: (string | undefined | null | false)[]) {
  return classes.filter(Boolean).join(' ')
}
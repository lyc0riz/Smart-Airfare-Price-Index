import { useRef, KeyboardEvent } from 'react'
import { cn } from '../../lib/utils'

interface TabsProps {
  tabs: { key: string; label: string }[]
  activeKey: string
  onChange: (key: string) => void
  className?: string
}

const TAB_LIST_ID = 'tabs-panel'

export function Tabs({ tabs, activeKey, onChange, className }: TabsProps) {
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([])

  const handleKeyDown = (e: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const count = tabs.length
    let nextIndex = index
    if (e.key === 'ArrowRight') nextIndex = (index + 1) % count
    else if (e.key === 'ArrowLeft') nextIndex = (index - 1 + count) % count
    else if (e.key === 'Home') nextIndex = 0
    else if (e.key === 'End') nextIndex = count - 1
    else return

    e.preventDefault()
    onChange(tabs[nextIndex]!.key)
    tabRefs.current[nextIndex]?.focus()
  }

  return (
    <div role="tablist" aria-label="View sections" className={cn('flex overflow-hidden rounded-sm border border-border', className)}>
      {tabs.map((tab, index) => {
        const selected = activeKey === tab.key
        return (
          <button
            key={tab.key}
            ref={(el) => {
              tabRefs.current[index] = el
            }}
            id={`tab-${tab.key}`}
            type="button"
            role="tab"
            aria-selected={selected}
            aria-controls={TAB_LIST_ID}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(tab.key)}
            onKeyDown={(e) => handleKeyDown(e, index)}
            className={cn(
              'flex-1 px-4 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              selected
                ? 'bg-primary text-primary-foreground'
                : 'bg-background text-foreground hover:bg-accent'
            )}
          >
            {tab.label}
          </button>
        )
      })}
    </div>
  )
}
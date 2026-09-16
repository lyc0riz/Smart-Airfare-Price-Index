import { cn } from '../../lib/utils'

export interface HeatmapCell {
  route: string
  window: number
  value: number
  label?: string
}

export interface HeatmapProps {
  data: HeatmapCell[]
  routes: string[]
  windows: number[]
  height?: number
  className?: string
  onCellClick?: (cell: HeatmapCell) => void
}

export function Heatmap({
  data,
  routes,
  windows,
  height = 400,
  className,
  onCellClick,
}: HeatmapProps) {
  const maxValue = Math.max(...data.map((d) => d.value), 1)
  const minValue = Math.min(...data.map((d) => d.value))

  const getColor = (value: number) => {
    const ratio = (value - minValue) / (maxValue - minValue) || 0
    const r = Math.round(14 + ratio * (243 - 14))
    const g = Math.round(116 + ratio * (112 - 116))
    const b = Math.round(144 + ratio * (33 - 144))
    return `rgb(${r}, ${g}, ${b})`
  }

  return (
    <div className={cn('overflow-x-auto', className)} style={{ height }}>
      <table className="border-collapse text-sm" role="grid">
        <thead>
          <tr>
            <th className="sticky left-0 z-10 w-32 px-2 py-2 text-left text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground bg-background/50 border-r border-border" />
            {windows.map((w) => (
              <th key={w} className="w-[32px] px-1 py-2 text-center text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground border-b border-border">
                T+{w}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {routes.map((route) => (
            <tr key={route}>
              <th className="sticky left-0 z-10 w-32 px-2 py-2 text-left text-sm font-medium text-foreground bg-background/50 border-r border-border" scope="row">
                {route}
              </th>
              {windows.map((window) => {
                const cell = data.find((d) => d.route === route && d.window === window)
                const value = cell?.value ?? 0
                return (
                  <td
                    key={window}
                    className="w-[32px] h-[32px] px-1 py-1 text-center align-middle border-b border-border transition-colors"
                    style={{ backgroundColor: cell ? getColor(value) : 'transparent' }}
                    onClick={() => cell && onCellClick?.(cell)}
                    role="gridcell"
                    aria-label={`${route} T+${window}: ${cell?.label ?? value.toFixed(2)}`}
                    tabIndex={onCellClick ? 0 : undefined}
                    onKeyDown={(e) => { if ((e.key === 'Enter' || e.key === ' ') && onCellClick && cell) { e.preventDefault(); onCellClick(cell) } }}
                  >
                    {cell && <span className="text-xs font-medium text-white drop-shadow">{value.toFixed(1)}</span>}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
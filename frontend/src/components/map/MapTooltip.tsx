import { cn } from '../../lib/utils'

export type TooltipData =
  | { kind: 'route'; title: string; rows: { label: string; value: string }[]; negative?: boolean }
  | { kind: 'city'; title: string; rows: { label: string; value: string }[] }

export function MapTooltip({ x, y, data }: { x: number; y: number; data: TooltipData }) {
  return (
    <g transform={`translate(${x + 14}, ${y - 8})`} pointerEvents="none">
      <foreignObject width={200} height={data.rows.length * 22 + 46}>
        <div className={cn('rounded-sm border bg-card p-2.5 text-xs shadow-lg', data.kind === 'route' && data.negative ? 'border-destructive/40' : 'border-border', 'text-foreground')}>
          <p className="font-semibold">{data.title}</p>
          <dl className="mt-1.5 space-y-1">
            {data.rows.map((row) => (
              <div key={row.label} className="flex justify-between gap-4">
                <dt className="text-muted-foreground">{row.label}</dt>
                <dd className="tabular-nums font-medium">{row.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      </foreignObject>
    </g>
  )
}

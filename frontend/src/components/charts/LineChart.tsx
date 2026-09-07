import { LineChart as RechartsLineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts'
import { cn } from '../../lib/utils'
import { formatDate, formatMonth } from '../../lib/utils'

interface LineChartProps {
  data: Record<string, unknown>[]
  xKey: string
  yKeys: string[]
  colors?: string[]
  height?: number
  showGrid?: boolean
  showReferenceLine?: { y: number; label?: string }
  xFormatter?: (value: string) => string
  yFormatter?: (value: number) => string
  className?: string
}

export function LineChart({
  data,
  xKey,
  yKeys,
  colors = ['hsl(var(--primary))', 'hsl(var(--saffron))', 'hsl(var(--navy))'],
  height = 320,
  showGrid = true,
  showReferenceLine,
  xFormatter,
  yFormatter,
  className,
}: LineChartProps) {
  const defaultXFormatter = (value: string) => {
    if (value.length === 7) return formatMonth(value)
    return formatDate(value)
  }

  return (
    <div className={cn('w-full', className)} style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <RechartsLineChart data={data} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
          {showGrid && <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" vertical={false} />}
          <XAxis
            dataKey={xKey}
            tickFormatter={xFormatter || defaultXFormatter}
            tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
            stroke="hsl(var(--border))"
            minTickGap={28}
            tickLine={false}
          />
          <YAxis
            tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
            stroke="hsl(var(--border))"
            width={52}
            tickLine={false}
            tickFormatter={yFormatter}
          />
          {showReferenceLine && (
            <ReferenceLine
              y={showReferenceLine.y}
              stroke="hsl(var(--muted-foreground))"
              strokeDasharray="4 4"
              label={{
                value: showReferenceLine.label || 'Reference',
                position: 'insideTopRight',
                style: { fontSize: 11, fill: 'hsl(var(--muted-foreground))' },
              }}
            />
          )}
          <Tooltip
            contentStyle={{
              backgroundColor: 'hsl(var(--card))',
              border: '1px solid hsl(var(--border))',
              borderRadius: '0.375rem',
              boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
              padding: '0.75rem',
            }}
            labelFormatter={defaultXFormatter}
            formatter={(value, name) => [
              yFormatter
                ? yFormatter(Number(value))
                : typeof value === 'number'
                  ? value.toFixed(2)
                  : String(value),
              name,
            ]}
          />
          {yKeys.map((key, index) => (
            <Line
              key={key}
              type="monotone"
              dataKey={key}
              stroke={colors[index % colors.length]}
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
          ))}
        </RechartsLineChart>
      </ResponsiveContainer>
    </div>
  )
}
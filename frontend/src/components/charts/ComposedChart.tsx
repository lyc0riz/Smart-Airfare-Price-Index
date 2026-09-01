import { ComposedChart as RechartsComposedChart, Line, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { cn } from '../../lib/utils'
import { formatDate } from '../../lib/utils'

interface ComposedChartProps {
  data: Record<string, unknown>[]
  xKey: string
  bars: { key: string; name?: string; color?: string }[]
  lines: { key: string; name?: string; color?: string }[]
  height?: number
  className?: string
}

export function ComposedChart({
  data,
  xKey,
  bars = [],
  lines = [],
  height = 320,
  className,
}: ComposedChartProps) {
  return (
    <div className={cn('w-full', className)} style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <RechartsComposedChart data={data} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
          <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey={xKey}
            tickFormatter={formatDate}
            tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
            stroke="hsl(var(--border))"
            minTickGap={28}
            tickLine={false}
          />
          <YAxis
            yAxisId="left"
            tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
            stroke="hsl(var(--border))"
            width={64}
            tickLine={false}
            tickFormatter={(value) => `₹${value.toLocaleString('en-IN')}`}
          />
          <YAxis
            yAxisId="right"
            orientation="right"
            tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
            stroke="hsl(var(--border))"
            width={48}
            tickLine={false}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: 'hsl(var(--card))',
              border: '1px solid hsl(var(--border))',
              borderRadius: '0.375rem',
              boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
              padding: '0.75rem',
            }}
            labelFormatter={formatDate}
            formatter={(value, name) => [
              name === 'avgFare' ? `₹${Number(value).toLocaleString('en-IN')}` : Number(value).toFixed(2),
              name,
            ]}
          />
          <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
          {bars.map((bar) => (
            <Bar
              key={bar.key}
              yAxisId="left"
              dataKey={bar.key}
              fill={bar.color || `hsl(var(--primary))`}
              name={bar.name || bar.key}
              isAnimationActive={false}
            />
          ))}
          {lines.map((line) => (
            <Line
              key={line.key}
              yAxisId="right"
              type="monotone"
              dataKey={line.key}
              stroke={line.color || `hsl(var(--saffron))`}
              strokeWidth={2}
              dot={false}
              name={line.name || line.key}
              isAnimationActive={false}
            />
          ))}
        </RechartsComposedChart>
      </ResponsiveContainer>
    </div>
  )
}
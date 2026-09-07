import { useEffect, useMemo, useState } from 'react'
import { LineChart as RechartsLineChart, Line, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Info } from 'lucide-react'
import { Card } from '../components/ui/Card'
import { Select } from '../components/ui/Select'
import { formatDate } from '../lib/utils'
import { RANGE_OPTIONS } from '../lib/constants'
import { aggregate } from '../lib/computations'
import type { RangeKey } from '../lib/constants'
import { cn } from '../lib/utils'
import { useDataProvider } from '../hooks/useDataProvider'
import { useMetadata } from '../hooks/useMetadata'
import { LimitedHistoryBanner } from '../components/data/LimitedHistoryBanner'

interface TooltipPoint {
  date: string
  index: number
  [key: string]: unknown
}

function ChartTooltip({ active, payload, yKeys }: { active?: boolean; payload?: { payload: TooltipPoint }[]; yKeys: { key: string; label: string }[] }) {
  if (!active || !payload?.length) return null
  const point = payload[0]!.payload
  return (
    <div className="rounded-sm border border-border bg-card p-3 text-xs shadow-lg">
      <p className="font-semibold text-foreground">{formatDate(point.date)}</p>
      <dl className="mt-2 space-y-1">
        {yKeys.map((y) => (
          <div key={y.key} className="flex justify-between gap-6">
            <dt className="text-muted-foreground">{y.label}</dt>
            <dd className="tabular-nums font-medium text-foreground">{typeof point[y.key] === 'number' ? (point[y.key] as number).toFixed(2) : '—'}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}

export function PriceTrends() {
  const { provider } = useDataProvider()
  const { routes, airlines, historyDays } = useMetadata()

  const [range, setRange] = useState<RangeKey>('3m')
  const [routeCode, setRouteCode] = useState('ALL')
  const [airlineCode, setAirlineCode] = useState('ALL')
  const [frequency, setFrequency] = useState<'daily' | 'weekly' | 'monthly'>('weekly')

  const [allIndiaRaw, setAllIndiaRaw] = useState<{ date: string; index: number }[]>([])
  const [routeSeriesRaw, setRouteSeriesRaw] = useState<{ date: string; index: number }[]>([])
  const [warning, setWarning] = useState<string | undefined>()

  const days = RANGE_OPTIONS.find((o) => o.key === range)!.days

  const availableRanges = useMemo(() => {
    return RANGE_OPTIONS.filter((opt) => opt.days <= Math.max(historyDays, 30))
  }, [historyDays])

  useEffect(() => {
    let cancelled = false
    const targetRoute = routeCode === 'ALL' ? 'DEL-BOM' : routeCode
    Promise.all([
      provider.getDailySeries('ALL', airlineCode, Math.max(days, 60)),
      provider.getDailySeries(targetRoute, airlineCode, Math.max(days, 60)),
    ]).then(([resAll, resRoute]) => {
      if (cancelled) return
      setAllIndiaRaw(resAll.data.map((p) => ({ date: p.date, index: p.index_value })))
      setRouteSeriesRaw(resRoute.data.map((p) => ({ date: p.date, index: p.index_value })))
      setWarning(resAll.warning || resRoute.warning)
    }).catch(() => {
      if (!cancelled) setWarning('Failed to fetch price trend series')
    })
    return () => { cancelled = true }
  }, [provider, routeCode, airlineCode, days])

  const mainData = useMemo(() => {
    if (!allIndiaRaw.length) return []
    const series = aggregate(allIndiaRaw, frequency)
    const start = series[series.length - Math.min(days, series.length)]
    const base = start?.index ?? 100
    return series.map((p) => ({ date: p.date, index: p.index, rebased: (p.index / base) * 100 }))
  }, [allIndiaRaw, frequency, days])

  const compareData = useMemo(() => {
    if (!allIndiaRaw.length || !routeSeriesRaw.length) return []
    const a = aggregate(allIndiaRaw, 'weekly')
    const b = aggregate(routeSeriesRaw, 'weekly')
    const map = new Map(a.map((p) => [p.date, p.index]))
    return b.map((p) => ({ date: p.date, allIndia: map.get(p.date) ?? p.index, route: p.index }))
  }, [allIndiaRaw, routeSeriesRaw])

  const yKeys = [
    { key: 'index', label: 'APIx' },
    { key: 'rebased', label: 'Rebased APIx' },
  ]

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <main className="flex-1 pb-20">
        <section className="border-b border-border bg-muted/50">
          <div className="container-gov py-8">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Statistical Product</p>
            <h1 className="mt-2 text-3xl font-bold text-foreground md:text-4xl">Price Trends</h1>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground md:text-base">
              Daily, weekly and monthly movements in the Airfare Price Index.
            </p>
            <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
              Compare the all-India index with a selected route and carrier over the chosen
              observation window.
            </p>
          </div>
        </section>

        <section className="container-gov py-8">
          <LimitedHistoryBanner warning={warning} onDismiss={() => setWarning(undefined)} />
          <Card className="p-4 md:p-6">
            <div className="flex flex-wrap items-center gap-4">
              <div>
                <label className="mb-1 block text-[11px] uppercase tracking-[0.1em] text-muted-foreground">Time Period</label>
                <div className="flex flex-wrap gap-1" role="group" aria-label="Time period">
                  {availableRanges.map((option) => (
                    <button
                      key={option.key}
                      type="button"
                      aria-pressed={range === option.key}
                      onClick={() => setRange(option.key)}
                      className={cn(
                        'rounded-sm border px-2.5 py-1.5 text-xs font-medium transition-colors',
                        range === option.key
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'border-border bg-background text-foreground hover:bg-accent'
                      )}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label htmlFor="trends-route" className="mb-1 block text-[11px] uppercase tracking-[0.1em] text-muted-foreground">Route</label>
                <Select id="trends-route" className="h-9 w-56 rounded-sm border border-border bg-background px-3 text-sm text-foreground" value={routeCode} onChange={(e) => setRouteCode(e.target.value)}>
                  {routes.map((r) => <option key={r.code} value={r.code}>{r.label}</option>)}
                </Select>
              </div>
              <div>
                <label htmlFor="trends-airline" className="mb-1 block text-[11px] uppercase tracking-[0.1em] text-muted-foreground">Airline</label>
                <Select id="trends-airline" className="h-9 w-48 rounded-sm border border-border bg-background px-3 text-sm text-foreground" value={airlineCode} onChange={(e) => setAirlineCode(e.target.value)}>
                  {airlines.map((a) => <option key={a.code} value={a.code}>{a.label}</option>)}
                </Select>
              </div>
              <div>
                <label htmlFor="trends-frequency" className="mb-1 block text-[11px] uppercase tracking-[0.1em] text-muted-foreground">Frequency</label>
                <Select id="trends-frequency" className="h-9 w-40 rounded-sm border border-border bg-background px-3 text-sm text-foreground" value={frequency} onChange={(e) => setFrequency(e.target.value as 'daily' | 'weekly' | 'monthly')}>
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                </Select>
              </div>
            </div>

            <div className="mt-6">
              <div className="flex items-baseline justify-between gap-2">
                <h2 className="text-lg font-semibold text-foreground">All-India Airfare Price Index</h2>
                <p className="text-xs text-muted-foreground">{frequency.charAt(0).toUpperCase() + frequency.slice(1)}</p>
              </div>
              <div className="mt-4 h-[340px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <RechartsLineChart data={mainData} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
                    <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" vertical={false} />
                    <XAxis
                      dataKey="date"
                      tickFormatter={(value: string) => formatDate(value).replace(/ \d{4}$/, '')}
                      tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }}
                      stroke="hsl(var(--border))"
                      minTickGap={28}
                    />
                    <YAxis
                      tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }}
                      stroke="hsl(var(--border))"
                      width={52}
                      label={{ value: 'APIx', angle: -90, position: 'insideLeft', style: { fontSize: 12, fill: 'hsl(var(--muted-foreground))' } }}
                    />
                    <ReferenceLine y={100} stroke="hsl(var(--muted-foreground))" strokeDasharray="4 4" label={{ value: 'Base = 100', position: 'insideTopRight', style: { fontSize: 11, fill: 'hsl(var(--muted-foreground))' } }} />
                    <Tooltip content={<ChartTooltip yKeys={yKeys} />} cursor={{ stroke: 'hsl(var(--border))' }} />
                    <Line type="monotone" dataKey="index" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} isAnimationActive={false} />
                    <Line type="monotone" dataKey="rebased" stroke="hsl(var(--saffron))" strokeWidth={2} dot={false} isAnimationActive={false} />
                  </RechartsLineChart>
                </ResponsiveContainer>
              </div>
            </div>
          </Card>
        </section>

        <section className="container-gov pb-8">
          <Card className="p-4 md:p-6">
            <div className="flex items-baseline justify-between gap-2">
              <h2 className="text-lg font-semibold text-foreground">Route vs All-India Comparison</h2>
              <p className="text-xs text-muted-foreground">Weekly · {routes.find((r) => r.code === routeCode)?.label ?? 'All India'}</p>
            </div>
            <div className="mt-4 h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <RechartsLineChart data={compareData} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
                  <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="date" tickFormatter={(value: string) => formatDate(value).replace(/ \d{4}$/, '')} tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }} stroke="hsl(var(--border))" minTickGap={28} />
                  <YAxis tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }} stroke="hsl(var(--border))" width={52} />
                  <Tooltip content={<ChartTooltip yKeys={[{ key: 'allIndia', label: 'All India' }, { key: 'route', label: routeCode === 'ALL' ? 'DEL–BOM' : routeCode.replace('-', '–') }]} />} cursor={{ stroke: 'hsl(var(--border))' }} />
                  <Line type="monotone" dataKey="allIndia" name="All India" stroke="hsl(var(--navy))" strokeWidth={2} dot={false} isAnimationActive={false} />
                  <Line type="monotone" dataKey="route" name="Route" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} isAnimationActive={false} />
                </RechartsLineChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </section>

        <section className="container-gov pb-10">
          <div className="grid gap-px overflow-hidden rounded-sm border border-border bg-border md:grid-cols-3">
            {[
              { label: 'Selected route', value: routes.find((r) => r.code === routeCode)?.label ?? 'All India' },
              { label: 'Selected airline', value: airlines.find((a) => a.code === airlineCode)?.label ?? 'All Airlines' },
              { label: 'Observation window', value: `${days} days` },
            ].map((item) => (
              <div key={item.label} className="bg-background px-4 py-4">
                <p className="text-[11px] uppercase tracking-[0.1em] text-muted-foreground">{item.label}</p>
                <p className="mt-1 text-base font-semibold text-foreground">{item.value}</p>
              </div>
            ))}
          </div>

          <div className="mt-6 rounded-sm border-l-2 border-primary border-y border-r border-border bg-muted/50 p-4">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <Info className="h-4 w-4" aria-hidden="true" />
              Reading the comparison
            </h3>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted-foreground">
              The <span className="font-medium text-foreground">rebased series</span> sets the start
              of the window to 100 so short-term deviation from the all-India path can be compared
              with a route. A route line above the all-India line indicates faster fare growth over
              the window; below indicates slower growth.
            </p>
          </div>
        </section>
      </main>
    </div>
  )
}

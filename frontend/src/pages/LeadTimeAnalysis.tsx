import { useEffect, useMemo, useState } from 'react'
import { LineChart as RechartsLineChart, Line, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, Legend } from 'recharts'
import { Info, Grid, Layers } from 'lucide-react'
import { Card } from '../components/ui/Card'
import { Select } from '../components/ui/Select'
import { Table } from '../components/ui/Table'
import { Heatmap, type HeatmapCell } from '../components/charts/Heatmap'
import { formatINR, pct } from '../lib/utils'
import { LEAD_WINDOWS, TRAVEL_DATE_AVAILABLE, OBSERVATION_PERIOD, routeLeadTime, type WindowStat } from '../lib/prototype/leadtime'
import { cn } from '../lib/utils'
import { useDataProvider } from '../hooks/useDataProvider'
import { useMetadata } from '../hooks/useMetadata'
import { LimitedHistoryBanner } from '../components/data/LimitedHistoryBanner'

export function LeadTimeAnalysis() {
  const { provider } = useDataProvider()
  const { routes, airlines } = useMetadata()

  const [routeCode, setRouteCode] = useState('ALL')
  const [airlineCode, setAirlineCode] = useState('ALL')

  const [curve, setCurve] = useState<{ days: number; avgFare: number }[]>([])
  const [stats, setStats] = useState<WindowStat[]>([])
  const [airlineFares, setAirlineFares] = useState<{ code: string; label: string; fares: number[]; spread: number }[]>([])
  const [warning, setWarning] = useState<string | undefined>()

  const [selectedCell, setSelectedCell] = useState<HeatmapCell | null>(null)
  const [heatmapMode, setHeatmapMode] = useState<'fare' | 'index'>('fare')

  useEffect(() => {
    let cancelled = false
    provider.getLeadTimeData(routeCode, airlineCode).then((res) => {
      if (cancelled) return
      setCurve(res.data.curve)
      setStats(res.data.stats as WindowStat[])
      setAirlineFares(res.data.airlines)
      setWarning(res.warning)
    }).catch(() => {
      if (!cancelled) setWarning('Failed to fetch lead-time analysis data')
    })
    return () => { cancelled = true }
  }, [provider, routeCode, airlineCode])

  const routeLeadRows = useMemo(() => routeLeadTime(routeCode, airlineCode), [routeCode, airlineCode])
  const heatmapRoutes = useMemo(() => routeLeadRows.map((r) => r.code), [routeLeadRows])

  const heatmapCells = useMemo<HeatmapCell[]>(() => {
    const cells: HeatmapCell[] = []
    routeLeadRows.forEach((r) => {
      const t30Fare = r.fares[3] || 1
      r.fares.forEach((fare, wi) => {
        const windowVal = LEAD_WINDOWS[wi]!
        const val = heatmapMode === 'fare' ? fare : Math.round((fare / t30Fare) * 1000) / 10
        cells.push({
          route: r.code,
          window: windowVal,
          value: val,
          label: heatmapMode === 'fare' ? `₹${fare}` : `Idx ${val}`,
        })
      })
    })
    return cells
  }, [routeLeadRows, heatmapMode])

  const maxWindow = Math.max(...LEAD_WINDOWS)

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <main className="flex-1 pb-20">
        <section className="border-b border-border bg-muted/50">
          <div className="container-gov py-8">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Statistical Product</p>
            <h1 className="mt-2 text-3xl font-bold text-foreground md:text-4xl">Lead-Time Analysis</h1>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground md:text-base">
              How airfares respond to the time between booking and travel.
            </p>
            <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
              Fares are analysed for the advance purchase windows T+1, T+7, T+15, T+30 and T+45
              days before departure.
            </p>
            <dl className="mt-6 grid gap-px overflow-hidden rounded-sm border border-border bg-border sm:grid-cols-2 lg:grid-cols-4">
              {[
                ['Advance windows', LEAD_WINDOWS.map((w) => `T+${w}`).join(' · ')],
                ['Observation period', OBSERVATION_PERIOD],
                ['Travel date', TRAVEL_DATE_AVAILABLE ? 'Available in records' : 'Not available'],
                ['Analysis basis', 'All routes in basket'],
              ].map(([term, value]) => (
                <div key={term} className="bg-background px-4 py-3">
                  <dt className="text-[11px] uppercase tracking-[0.1em] text-muted-foreground">{term}</dt>
                  <dd className="mt-1 text-sm font-medium text-foreground">{value}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        <section className="container-gov py-8">
          <LimitedHistoryBanner warning={warning} onDismiss={() => setWarning(undefined)} />
          <Card className="p-4 md:p-6">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-foreground">Advance Purchase Price Curve</h2>
                <p className="mt-1 text-sm text-muted-foreground">Average fare by days before departure.</p>
              </div>
              <div className="flex flex-wrap gap-4">
                <div>
                  <label htmlFor="lead-route" className="mb-1 block text-[11px] uppercase tracking-[0.1em] text-muted-foreground">Route</label>
                  <Select id="lead-route" className="h-9 w-52 rounded-sm border border-border bg-background px-3 text-sm text-foreground" value={routeCode} onChange={(e) => setRouteCode(e.target.value)}>
                    {routes.map((r) => <option key={r.code} value={r.code}>{r.label}</option>)}
                  </Select>
                </div>
                <div>
                  <label htmlFor="lead-airline" className="mb-1 block text-[11px] uppercase tracking-[0.1em] text-muted-foreground">Airline</label>
                  <Select id="lead-airline" className="h-9 w-48 rounded-sm border border-border bg-background px-3 text-sm text-foreground" value={airlineCode} onChange={(e) => setAirlineCode(e.target.value)}>
                    {airlines.map((a) => <option key={a.code} value={a.code}>{a.label}</option>)}
                  </Select>
                </div>
              </div>
            </div>
            <div className="mt-5 h-[320px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <RechartsLineChart data={curve} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
                  <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="days" type="number" domain={[1, maxWindow]} tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }} stroke="hsl(var(--border))" label={{ value: 'Days before departure', position: 'insideBottom', offset: -4, style: { fontSize: 12, fill: 'hsl(var(--muted-foreground))' } }} />
                  <YAxis tickFormatter={(value: number) => `₹${value.toLocaleString('en-IN')}`} tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }} stroke="hsl(var(--border))" width={72} />
                  <Tooltip
                    contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '0.375rem', padding: '0.75rem' }}
                    formatter={(value) => [`₹${Number(value).toLocaleString('en-IN')}`, 'Average fare']}
                    labelFormatter={(label) => `T+${label} days`}
                  />
                  <Line type="monotone" dataKey="avgFare" stroke="hsl(var(--primary))" strokeWidth={2.5} dot={{ r: 4 }} isAnimationActive={false} />
                </RechartsLineChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </section>

        <section className="container-gov pb-8">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-foreground">Airline Comparison</h2>
              <p className="text-sm text-muted-foreground">Average fare by advance window for each carrier.</p>
            </div>
          </div>
          <div className="mt-4 h-[320px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <RechartsLineChart data={airlineFares.map((a) => {
                const obj: Record<string, number | string> = { label: a.label }
                LEAD_WINDOWS.forEach((w, i) => { obj[`w${w}`] = a.fares[i] ?? 0 })
                return obj
              })} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
              <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} stroke="hsl(var(--border))" interval={0} />
              <YAxis tickFormatter={(value: number) => `₹${value.toLocaleString('en-IN')}`} tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }} stroke="hsl(var(--border))" width={72} />
              <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '0.375rem', padding: '0.75rem' }} formatter={(value) => `₹${Number(value).toLocaleString('en-IN')}`} />
              <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
              {LEAD_WINDOWS.map((w, i) => (
                <Line key={w} type="monotone" dataKey={`w${w}`} name={`T+${w}`} stroke={['hsl(var(--primary))', 'hsl(var(--saffron))', 'hsl(var(--navy))', 'hsl(var(--muted-foreground))', 'hsl(210 100% 45%)'][i % 5]} strokeWidth={2} dot={false} isAnimationActive={false} />
              ))}
              </RechartsLineChart>
            </ResponsiveContainer>
          </div>
        </section>

        {/* Heatmap Matrix Section */}
        <section className="container-gov pb-8">
          <Card className="p-4 md:p-6">
            <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-border">
              <div>
                <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground">
                  <Grid className="h-5 w-5 text-primary" aria-hidden="true" />
                  Route × Lead-Time Heatmap Matrix
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Interactive pricing matrix across routes and advance booking windows (Click any cell for details).
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground font-medium">Metric:</span>
                <div className="inline-flex rounded-sm border border-border bg-muted p-0.5">
                  <button
                    type="button"
                    onClick={() => setHeatmapMode('fare')}
                    className={cn(
                      'px-2.5 py-1 text-xs font-medium rounded-sm transition-colors',
                      heatmapMode === 'fare' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                    )}
                  >
                    Average Fare (₹)
                  </button>
                  <button
                    type="button"
                    onClick={() => setHeatmapMode('index')}
                    className={cn(
                      'px-2.5 py-1 text-xs font-medium rounded-sm transition-colors',
                      heatmapMode === 'index' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                    )}
                  >
                    Index Relative (T+30 = 100)
                  </button>
                </div>
              </div>
            </div>

            <div className="mt-4 overflow-x-auto">
              <Heatmap
                data={heatmapCells}
                routes={heatmapRoutes}
                windows={LEAD_WINDOWS}
                onCellClick={(cell) => setSelectedCell(cell)}
                height={380}
              />
            </div>

            {/* Selected Cell Comparative Breakdown */}
            {selectedCell && (
              <div className="mt-4 rounded-sm border border-primary/30 bg-primary/5 p-4 transition-all">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-primary/20 pb-2">
                  <span className="text-xs font-semibold uppercase tracking-[0.1em] text-primary flex items-center gap-1.5">
                    <Layers className="h-3.5 w-3.5" />
                    Selected Cell Breakdown: {selectedCell.route} (T+{selectedCell.window})
                  </span>
                  <button
                    type="button"
                    onClick={() => setSelectedCell(null)}
                    className="text-xs text-muted-foreground hover:text-foreground"
                  >
                    ✕ Close
                  </button>
                </div>
                <div className="mt-3 grid gap-4 sm:grid-cols-3">
                  <div>
                    <span className="text-[11px] uppercase tracking-[0.1em] text-muted-foreground">Route & Window</span>
                    <p className="mt-1 text-base font-bold text-foreground">{selectedCell.route} · T+{selectedCell.window} Days</p>
                  </div>
                  <div>
                    <span className="text-[11px] uppercase tracking-[0.1em] text-muted-foreground">Observed Value</span>
                    <p className="mt-1 text-base font-bold text-foreground">
                      {heatmapMode === 'fare' ? formatINR(selectedCell.value) : `Index ${selectedCell.value.toFixed(1)}`}
                    </p>
                  </div>
                  <div>
                    <span className="text-[11px] uppercase tracking-[0.1em] text-muted-foreground">Booking Window Impact</span>
                    <p className="mt-1 text-sm font-medium text-foreground">
                      {selectedCell.window <= 7
                        ? '🔥 High Close-in Booking Premium'
                        : selectedCell.window >= 30
                        ? '🟢 Discounted Advance Purchase Window'
                        : '⚡ Standard Mid-Range Booking Window'}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </Card>
        </section>

        <section className="container-gov pb-8">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-foreground">Window Statistics</h2>
              <p className="text-sm text-muted-foreground">Average and median fares by advance-purchase window.</p>
            </div>
          </div>
          <div className="mt-4 overflow-x-auto rounded-sm border border-border">
            <Table
              columns={[
                { key: 'window', header: 'Window', accessor: (row: WindowStat) => row.label, sortable: true },
                { key: 'avgFare', header: 'Average Fare', accessor: (row: WindowStat) => formatINR(row.avgFare), align: 'right', sortable: true },
                { key: 'medianFare', header: 'Median Fare', accessor: (row: WindowStat) => formatINR(row.medianFare), align: 'right', sortable: true },
                { key: 'changeFromBase', header: 'Change from Base', accessor: (row: WindowStat) => <span className={cn('tabular-nums', row.changeFromBase > 0 ? 'text-green-700 dark:text-green-400' : 'text-destructive')}>{pct(row.changeFromBase)}</span>, align: 'right', sortable: true },
                { key: 'observations', header: 'Observations', accessor: (row: WindowStat) => row.observations.toLocaleString('en-IN'), align: 'right', sortable: true },
              ]}
              data={stats}
              keyExtractor={(row: WindowStat) => String(row.window)}
            />
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Change from base compares each window's average fare with the T+30 window average.
          </p>
        </section>

        <section className="container-gov pb-10">
          <div className="rounded-sm border-l-2 border-primary border-y border-r border-border bg-muted/50 p-4">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <Info className="h-4 w-4" aria-hidden="true" />
              What this tells us
            </h3>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted-foreground">
              Indian airfares typically rise as departure approaches. The steepness of the curve
              differs by route and carrier, reflecting demand, capacity and pricing strategy.
              APIx reports the average fare paid by window so that time-of-booking effects can be
              separated from general price movements.
            </p>
          </div>
        </section>
      </main>
    </div>
  )
}

import { useMemo, useState } from 'react'
import { LineChart as RechartsLineChart, Line, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { ArrowDownRight, ArrowRight, ArrowUpRight, Download, Info, Minus, SlidersHorizontal } from 'lucide-react'
import { Card } from '../components/ui/Card'
import { Select } from '../components/ui/Select'
import { Table } from '../components/ui/Table'
import { Button } from '../components/ui/Button'
import { Link } from 'react-router-dom'
import { formatDate, formatINR, pct, cn } from '../lib/utils'
import { ROUTES, AIRLINES, RANGE_OPTIONS, BASE_PERIOD, LATEST_DATE, buildSeries, aggregate, routeTable, type RouteRow } from '../lib/prototype/apix-data'
import type { RangeKey } from '../lib/constants'
import { RouteSearchInput, filterRoutes } from '../components/search'

const FREQUENCIES = ['daily', 'weekly', 'monthly'] as const
const PAGE_SIZE = 5

function Delta({ value, className = '' }: { value: number; className?: string }) {
  const Icon = value > 0.05 ? ArrowUpRight : value < -0.05 ? ArrowDownRight : Minus
  return (
    <span className={`inline-flex items-center gap-1 tabular-nums ${className}`}>
      <Icon className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
      {pct(value)}
    </span>
  )
}

function ChartTooltip({ active, payload }: { active?: boolean; payload?: { payload: { date: string; index: number; prevChange: number; baseChange: number } }[] }) {
  if (!active || !payload?.length) return null
  const point = payload[0]!.payload
  return (
    <div className="rounded-sm border border-border bg-card p-3 text-xs shadow-lg">
      <p className="font-semibold text-foreground">{formatDate(point.date)}</p>
      <dl className="mt-2 space-y-1">
        <div className="flex justify-between gap-6">
          <dt className="text-muted-foreground">FlyIndex India</dt>
          <dd className="tabular-nums font-medium text-foreground">{point.index.toFixed(2)}</dd>
        </div>
        <div className="flex justify-between gap-6">
          <dt className="text-muted-foreground">Change from previous</dt>
          <dd className="tabular-nums text-foreground">{pct(point.prevChange, 2)}</dd>
        </div>
        <div className="flex justify-between gap-6">
          <dt className="text-muted-foreground">Change from base</dt>
          <dd className="tabular-nums text-foreground">{pct(point.baseChange, 2)}</dd>
        </div>
      </dl>
    </div>
  )
}

export function AirfareIndex() {
  const [range, setRange] = useState<RangeKey>('30d')
  const [routeCode, setRouteCode] = useState('ALL')
  const [airlineCode, setAirlineCode] = useState('ALL')
  const [frequency, setFrequency] = useState<'daily' | 'weekly' | 'monthly'>('daily')
  const [filtersOpen, setFiltersOpen] = useState(false)

  const [query, setQuery] = useState('')
  const [sortKey, setSortKey] = useState<keyof RouteRow>('weight')
  const [sortAsc, setSortAsc] = useState(false)
  const [page, setPage] = useState(0)

  const days = RANGE_OPTIONS.find((option) => option.key === range)!.days

  const daily = useMemo(() => buildSeries(routeCode, airlineCode, Math.max(days, 60)), [routeCode, airlineCode, days])

  const chartData = useMemo(() => {
    const windowed = daily.slice(-days)
    const points = aggregate(windowed, frequency)
    return points.map((point, i) => ({
      ...point,
      prevChange: i === 0 ? 0 : ((point.index - points[i - 1]!.index) / points[i - 1]!.index) * 100,
      baseChange: point.index - 100,
    }))
  }, [daily, days, frequency])

  const latest = daily[daily.length - 1]!.index
  const dayAgo = daily[daily.length - 2]!.index
  const weekAgo = daily[daily.length - 8]!.index
  const monthAgo = daily[daily.length - 31]!.index

  const summary = [
    { label: 'Daily Change', value: ((latest - dayAgo) / dayAgo) * 100, delta: true },
    { label: '7-Day Change', value: ((latest - weekAgo) / weekAgo) * 100, delta: true },
    { label: '30-Day Change', value: ((latest - monthAgo) / monthAgo) * 100, delta: true },
  ]

  const rows = useMemo(() => routeTable(airlineCode), [airlineCode])

  const filteredRows = useMemo(() => {
    const list = filterRoutes(rows, query)
    return [...list].sort((a, b) => {
      const av = a[sortKey]
      const bv = b[sortKey]
      if (typeof av === 'string' || typeof bv === 'string') {
        return sortAsc ? String(av).localeCompare(String(bv)) : String(bv).localeCompare(String(av))
      }
      return sortAsc ? av - bv : bv - av
    })
  }, [rows, query, sortKey, sortAsc])

  const pageCount = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE))
  const currentPage = Math.min(page, pageCount - 1)
  const pagedRows = filteredRows.slice(currentPage * PAGE_SIZE, currentPage * PAGE_SIZE + PAGE_SIZE)

  const movement = useMemo(() => {
    const byChange = [...rows].sort((a, b) => b.change - a.change)
    const stable = [...rows].sort((a, b) => Math.abs(a.change) - Math.abs(b.change))[0]!
    return { top: byChange[0]!, bottom: byChange[byChange.length - 1]!, stable }
  }, [rows])

  function toggleSort(key: string, direction: 'asc' | 'desc') {
    setSortKey(key as keyof RouteRow)
    setSortAsc(direction === 'asc')
    setPage(0)
  }

  function resetFilters() {
    setRange('30d')
    setRouteCode('ALL')
    setAirlineCode('ALL')
    setFrequency('daily')
  }

  const totalObservations = rows.reduce((sum, row) => sum + row.observations, 0)

  const selectClass = 'h-9 w-full rounded-sm border border-border bg-background px-3 text-sm text-foreground'

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <main className="flex-1 pb-24">
        {/* Page header */}
        <section className="border-b border-border bg-muted/50">
          <div className="container-gov py-8">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Statistical Product
            </p>
            <div className="mt-2 flex flex-wrap items-start gap-3">
              <h1 className="text-3xl font-bold text-foreground md:text-4xl">
                Airfare Price Index
              </h1>
              <span className="group relative mt-2 inline-flex" tabIndex={0} role="note" aria-label="FlyIndex India measures changes in observed domestic airfare prices relative to the selected base period.">
                <Info className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                <span className="pointer-events-none absolute left-0 top-6 z-20 w-72 rounded-sm border border-border bg-card p-3 text-xs text-muted-foreground opacity-0 shadow-lg transition-opacity group-hover:opacity-100 group-focus:opacity-100">
                  FlyIndex India measures changes in observed domestic airfare prices relative to the selected base period.
                </span>
              </span>
            </div>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground md:text-base">
              Monitoring movements in domestic airfare prices across India
            </p>
            <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
              FlyIndex India tracks changes in observed domestic airfare prices relative to a defined base period.
            </p>

            <dl className="mt-6 grid gap-px overflow-hidden rounded-sm border border-border bg-border sm:grid-cols-2 lg:grid-cols-5">
              {[
                { term: 'Base period', value: BASE_PERIOD },
                { term: 'Base index', value: '100' },
                { term: 'Latest observation', value: formatDate(LATEST_DATE) },
                { term: 'Data coverage', value: `${ROUTES.length - 1} routes · ${AIRLINES.length - 1} airlines` },
                { term: 'Last updated', value: `${formatDate(LATEST_DATE)}, 06:00 IST` },
              ].map((item) => (
                <div key={item.term} className="bg-background px-4 py-3">
                  <dt className="text-[11px] uppercase tracking-[0.1em] text-muted-foreground">{item.term}</dt>
                  <dd className="mt-1 text-sm font-medium text-foreground">{item.value}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        {/* Summary */}
        <section className="container-gov py-8" aria-labelledby="summary-heading">
          <h2 id="summary-heading" className="sr-only">Index summary</h2>
          <div className="grid gap-8 border-b border-border pb-8 lg:grid-cols-[minmax(0,20rem)_1fr] lg:items-end">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Current FlyIndex India</p>
              <p className="mt-2 font-serif text-5xl font-bold tabular-nums text-foreground">{latest.toFixed(2)}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                <Delta value={latest - 100} className="font-medium text-foreground" /> from base period
              </p>
            </div>

            <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-sm border border-border bg-border md:grid-cols-5">
              {summary.map((item) => (
                <div key={item.label} className="bg-background px-4 py-3">
                  <dt className="text-[11px] uppercase tracking-[0.1em] text-muted-foreground">{item.label}</dt>
                  <dd className="mt-1 text-base font-semibold tabular-nums text-foreground"><Delta value={item.value} /></dd>
                </div>
              ))}
              <div className="bg-background px-4 py-3">
                <dt className="text-[11px] uppercase tracking-[0.1em] text-muted-foreground">Observations</dt>
                <dd className="mt-1 text-base font-semibold tabular-nums text-foreground">{totalObservations.toLocaleString('en-IN')}</dd>
              </div>
              <div className="bg-background px-4 py-3">
                <dt className="text-[11px] uppercase tracking-[0.1em] text-muted-foreground">Routes Covered</dt>
                <dd className="mt-1 text-base font-semibold tabular-nums text-foreground">{rows.length}</dd>
              </div>
            </dl>
          </div>
        </section>

        {/* Filters */}
        <section className="container-gov" aria-labelledby="filters-heading">
          <Card className="p-0">
            <div className="flex items-center justify-between px-4 py-3">
              <h2 id="filters-heading" className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
                Filters
              </h2>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={resetFilters}>Reset Filters</Button>
                <Button variant="outline" size="sm" onClick={() => setFiltersOpen((v) => !v)} className="md:hidden">
                  {filtersOpen ? 'Hide' : 'Show'}
                </Button>
              </div>
            </div>

            <div className={cn(filtersOpen ? 'grid' : 'hidden', 'gap-4 border-t border-border px-4 py-4 md:grid md:grid-cols-2 lg:grid-cols-4')}>
              <div>
                <label className="mb-1 block text-[11px] uppercase tracking-[0.1em] text-muted-foreground" htmlFor="filter-period">Time Period</label>
                <div id="filter-period" className="flex flex-wrap gap-1" role="group">
                  {RANGE_OPTIONS.map((option) => (
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
                <label className="mb-1 block text-[11px] uppercase tracking-[0.1em] text-muted-foreground" htmlFor="filter-route">Route</label>
                <Select id="filter-route" className={selectClass} value={routeCode} onChange={(e) => setRouteCode(e.target.value)}>
                  {ROUTES.map((route) => (
                    <option key={route.code} value={route.code}>{route.label}</option>
                  ))}
                </Select>
              </div>

              <div>
                <label className="mb-1 block text-[11px] uppercase tracking-[0.1em] text-muted-foreground" htmlFor="filter-airline">Airline</label>
                <Select id="filter-airline" className={selectClass} value={airlineCode} onChange={(e) => setAirlineCode(e.target.value)}>
                  {AIRLINES.map((airline) => (
                    <option key={airline.code} value={airline.code}>{airline.label}</option>
                  ))}
                </Select>
              </div>

              <div>
                <label className="mb-1 block text-[11px] uppercase tracking-[0.1em] text-muted-foreground" htmlFor="filter-frequency">Frequency</label>
                <Select id="filter-frequency" className={selectClass} value={frequency} onChange={(e) => setFrequency(e.target.value as 'daily' | 'weekly' | 'monthly')}>
                  {FREQUENCIES.map((item) => (
                    <option key={item} value={item}>{item.charAt(0).toUpperCase() + item.slice(1)}</option>
                  ))}
                </Select>
              </div>
            </div>
          </Card>
        </section>

        {/* Chart */}
        <section className="container-gov py-8" aria-labelledby="chart-heading">
          <Card className="p-4 md:p-6">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 id="chart-heading" className="text-lg font-semibold text-foreground">Airfare Price Index Trend</h2>
              <p className="text-xs text-muted-foreground">
                {ROUTES.find((r) => r.code === routeCode)?.label} ·{' '}
                {AIRLINES.find((a) => a.code === airlineCode)?.label} ·{' '}
                {frequency.charAt(0).toUpperCase() + frequency.slice(1)}
              </p>
            </div>

            <div className="mt-6 h-[340px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <RechartsLineChart data={chartData} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
                  <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" vertical={false} />
                  <XAxis
                    dataKey="date"
                    tickFormatter={(value: string) => formatDate(value).replace(/ \d{4}$/, '')}
                    tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }}
                    stroke="hsl(var(--border))"
                    minTickGap={28}
                  />
                  <YAxis
                    domain={['dataMin - 3', 'dataMax + 3']}
                    tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }}
                    stroke="hsl(var(--border))"
                    width={52}
                    label={{
                      value: 'APIx',
                      angle: -90,
                      position: 'insideLeft',
                      style: { fontSize: 12, fill: 'hsl(var(--muted-foreground))' },
                    }}
                  />
                  <ReferenceLine
                    y={100}
                    stroke="hsl(var(--muted-foreground))"
                    strokeDasharray="4 4"
                    label={{
                      value: 'Base = 100',
                      position: 'insideTopRight',
                      style: { fontSize: 11, fill: 'hsl(var(--muted-foreground))' },
                    }}
                  />
                  <Tooltip content={<ChartTooltip />} cursor={{ stroke: 'hsl(var(--border))' }} />
                  <Line type="monotone" dataKey="index" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} isAnimationActive={false} />
                </RechartsLineChart>
              </ResponsiveContainer>
            </div>
          </Card>

          {/* Interpretation */}
          <div className="mt-4 rounded-sm border-l-2 border-primary border-y border-r border-border bg-muted/50 p-4">
            <h3 className="text-sm font-semibold text-foreground">How to read the index</h3>
            <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
              An index value of 100 represents the selected base period. Values above 100 indicate
              higher airfare levels relative to the base period, while values below 100 indicate
              lower levels.
            </p>
            <p className="mt-2 text-sm text-foreground">
              <span className="font-semibold">Example — FlyIndex India = 110:</span>{' '}
              <span className="text-muted-foreground">Airfare prices are approximately 10% higher than the base-period level.</span>
            </p>
          </div>
        </section>

        {/* Route table */}
        <section className="container-gov pb-8" aria-labelledby="routes-heading">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 id="routes-heading" className="text-lg font-semibold text-foreground">Route-wise Airfare Movement</h2>
              <p className="text-sm text-muted-foreground">Index levels and movements for major city-pair routes.</p>
            </div>
            <RouteSearchInput
              value={query}
              onChange={(val) => {
                setQuery(val)
                setPage(0)
              }}
            />
          </div>

          <div className="mt-4 overflow-x-auto rounded-sm border border-border">
            <Table
              columns={[
                { key: 'rank', header: 'Rank', accessor: (_, i) => currentPage * PAGE_SIZE + i + 1, align: 'right' },
                { key: 'route', header: 'Route', accessor: (row: RouteRow) => row.route, sortable: true },
                { key: 'avgFare', header: 'Average Fare', accessor: (row: RouteRow) => formatINR(row.avgFare), align: 'right', sortable: true },
                { key: 'index', header: 'Route Index', accessor: (row: RouteRow) => row.index.toFixed(1), align: 'right', sortable: true },
                { key: 'change', header: 'Change %', accessor: (row: RouteRow) => <Delta value={row.change} className="justify-end" />, align: 'right', sortable: true },
                { key: 'weight', header: 'DGCA Weight', accessor: (row: RouteRow) => `${row.weight.toFixed(1)}%`, align: 'right', sortable: true },
                { key: 'observations', header: 'Observations', accessor: (row: RouteRow) => row.observations.toLocaleString('en-IN'), align: 'right', sortable: true },
              ]}
              data={pagedRows}
              keyExtractor={(row: RouteRow) => row.route}
              sortKey={sortKey}
              sortDirection={sortAsc ? 'asc' : 'desc'}
              onSort={toggleSort}
              emptyMessage={
                query.trim()
                  ? `No matching routes found for "${query.trim()}".`
                  : 'No routes match your search.'
              }
            />
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground">Showing {pagedRows.length} of {filteredRows.length} routes</p>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => setPage(Math.max(currentPage - 1, 0))} disabled={currentPage === 0}>Previous</Button>
              <span className="text-xs text-muted-foreground">Page {currentPage + 1} of {pageCount}</span>
              <Button variant="outline" size="sm" onClick={() => setPage(Math.min(currentPage + 1, pageCount - 1))} disabled={currentPage >= pageCount - 1}>Next</Button>
              <Link to="/route-analytics" className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline">
                View Route Intelligence <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
              </Link>
            </div>
          </div>
        </section>

        {/* Recent price movement */}
        <section className="container-gov pb-8" aria-labelledby="movement-heading">
          <h2 id="movement-heading" className="text-lg font-semibold text-foreground">Recent Airfare Movement</h2>
          <div className="mt-4 grid gap-px overflow-hidden rounded-sm border border-border bg-border md:grid-cols-3">
            {[
              { label: 'Highest Increase', row: movement.top },
              { label: 'Highest Decrease', row: movement.bottom },
              { label: 'Most Stable Route', row: movement.stable },
            ].map((item) => (
              <div key={item.label} className="bg-background px-4 py-4">
                <p className="text-[11px] uppercase tracking-[0.1em] text-muted-foreground">{item.label}</p>
                <p className="mt-1 text-base font-semibold text-foreground">{item.row.route}</p>
                <p className="mt-1 text-sm text-muted-foreground"><Delta value={item.row.change} /> · Index {item.row.index.toFixed(1)}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Data coverage */}
        <section className="container-gov pb-8" aria-labelledby="coverage-heading">
          <div className="grid gap-6 rounded-sm border border-border bg-muted/50 p-4 md:p-6 lg:grid-cols-2">
            <div>
              <h2 id="coverage-heading" className="text-lg font-semibold text-foreground">Data Coverage</h2>
              <dl className="mt-4 divide-y divide-border border-y border-border">
                {[
                  ['Observation period', '1 January 2024 – 29 August 2026'],
                  ['Number of observations', totalObservations.toLocaleString('en-IN')],
                  ['Number of routes', String(rows.length)],
                  ['Number of airlines', String(AIRLINES.length - 1)],
                  ['Latest update', `${formatDate(LATEST_DATE)}, 06:00 IST`],
                  ['Data source', 'Airline booking portals, DGCA traffic statistics'],
                ].map(([term, value]) => (
                  <div key={term} className="flex flex-wrap justify-between gap-2 py-2 text-sm">
                    <dt className="text-muted-foreground">{term}</dt>
                    <dd className="font-medium tabular-nums text-foreground">{value}</dd>
                  </div>
                ))}
              </dl>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:content-start">
              <div className="rounded-sm border border-border bg-background p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-primary">Source Data</p>
                <p className="mt-2 text-sm text-muted-foreground">Observed airfares and DGCA passenger traffic statistics collected from primary sources without modification.</p>
              </div>
              <div className="rounded-sm border border-border bg-background p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-saffron">FlyIndex India Indicator</p>
                <p className="mt-2 text-sm text-muted-foreground">Index values derived by MoSPI from cleaned source data using the published FlyIndex India methodology.</p>
              </div>
            </div>
          </div>
        </section>

        {/* Methodology + downloads */}
        <section className="container-gov pb-12">
          <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
            <Card className="p-4 md:p-6">
              <h2 className="text-lg font-semibold text-foreground">How FlyIndex India is calculated</h2>
              <ol className="mt-4 grid gap-3 sm:grid-cols-2">
                {[
                  ['01', 'Collect', 'Airfare observations'],
                  ['02', 'Clean', 'Validate and standardise data'],
                  ['03', 'Weight', 'Apply route importance using passenger traffic'],
                  ['04', 'Calculate', 'Generate the Airfare Price Index'],
                ].map(([num, title, detail]) => (
                  <li key={num} className="rounded-sm border border-border bg-muted/50 px-4 py-3">
                    <p className="text-[11px] font-semibold tracking-[0.14em] text-muted-foreground">{num}</p>
                    <p className="mt-1 text-sm font-semibold text-foreground">{title}</p>
                    <p className="mt-1 text-sm text-muted-foreground">{detail}</p>
                  </li>
                ))}
              </ol>
              <Link to="/data-sources" className="mt-4 inline-flex items-center gap-1 rounded-sm border border-border bg-background px-3 py-2 text-sm font-medium text-foreground hover:bg-accent">
                View Full Methodology <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </Card>

            <Card className="p-4">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground"><Download className="h-4 w-4" aria-hidden="true" /> Download Data</h2>
              <div className="mt-3 flex flex-wrap gap-2">
                {['CSV', 'Excel', 'JSON'].map((format) => (
                  <Button key={format} variant="outline" size="sm">{format}</Button>
                ))}
              </div>
              <Button variant="outline" size="sm" className="mt-3 w-full"><Download className="mr-2 h-4 w-4" aria-hidden="true" /> Download Chart (PNG)</Button>
              <p className="mt-3 text-[11px] text-muted-foreground">Downloads reflect the currently applied filters.</p>
            </Card>
          </div>
        </section>
      </main>
    </div>
  )
}
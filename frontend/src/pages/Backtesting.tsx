import { useEffect, useState } from 'react'
import { LineChart as RechartsLineChart, Line, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { AlertTriangle, CheckCircle2, TrendingDown, TrendingUp } from 'lucide-react'
import { Card } from '../components/ui/Card'
import { Select } from '../components/ui/Select'
import { Table } from '../components/ui/Table'
import { formatNumber, formatDate, pct } from '../lib/utils'
import type { BacktestResult, ContributionRow } from '../lib/prototype/backtest'
import { BASE_INDEX, BASE_PERIOD, AVAILABLE_PERIODS } from '../lib/constants'
import { cn } from '../lib/utils'
import { useDataProvider } from '../hooks/useDataProvider'
import { useMetadata } from '../hooks/useMetadata'
import { LimitedHistoryBanner } from '../components/data/LimitedHistoryBanner'

export function Backtesting() {
  const { provider } = useDataProvider()
  const { airlines, basePeriodLabel } = useMetadata()

  const [periodKey, setPeriodKey] = useState(0)
  const [airlineCode, setAirlineCode] = useState('ALL')
  const [result, setResult] = useState<BacktestResult | null>(null)
  const [warning, setWarning] = useState<string | undefined>()

  const period = AVAILABLE_PERIODS[periodKey] ?? AVAILABLE_PERIODS[0]!

  useEffect(() => {
    let cancelled = false
    provider.getBacktestData(period.start, period.end, airlineCode).then((res) => {
      if (cancelled) return
      setResult(res.data)
      setWarning(res.warning)
    }).catch(() => {
      if (!cancelled) setWarning('Failed to fetch backtesting data')
    })
    return () => { cancelled = true }
  }, [provider, period.start, period.end, airlineCode])

  const chartData = result?.days.map((d) => ({
    date: d.date,
    index: d.index,
    change: d.dailyChange,
    available: d.available,
  })) ?? []

  const statusColors: Record<BacktestResult['status'], string> = {
    Completed: 'bg-green-500/10 text-green-700 dark:text-green-400 border-green-600',
    'Partial Coverage': 'bg-yellow-500/10 text-yellow-700 dark:text-yellow-400 border-yellow-600',
    'Insufficient Data': 'bg-red-500/10 text-red-700 dark:text-red-400 border-red-600',
  }

  const status = result?.status ?? 'Insufficient Data'

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <main className="flex-1 pb-20">
        <section className="border-b border-border bg-muted/50">
          <div className="container-gov py-8">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Historical Evaluation</p>
            <h1 className="mt-2 text-3xl font-bold text-foreground md:text-4xl">Backtesting</h1>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground md:text-base">
              Retrospective evaluation of the Airfare Price Index methodology.
            </p>
            <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
              The all-India index reconstructed from historical airfare observations is compared
              over a fixed reference window with a base index of {BASE_INDEX}.
            </p>
          </div>
        </section>

        <section className="container-gov py-8">
          <LimitedHistoryBanner warning={warning} onDismiss={() => setWarning(undefined)} />
          <Card className="p-4 md:p-6">
            <div className="flex flex-wrap items-center gap-4">
              <div>
                <label htmlFor="bt-period" className="mb-1 block text-[11px] uppercase tracking-[0.1em] text-muted-foreground">Evaluation Period</label>
                <Select id="bt-period" className="h-9 w-72 rounded-sm border border-border bg-background px-3 text-sm text-foreground" value={periodKey} onChange={(e) => setPeriodKey(Number(e.target.value))}>
                  {AVAILABLE_PERIODS.map((p, i) => <option key={p.label} value={i}>{p.label}</option>)}
                </Select>
              </div>
              <div>
                <label htmlFor="bt-airline" className="mb-1 block text-[11px] uppercase tracking-[0.1em] text-muted-foreground">Airline</label>
                <Select id="bt-airline" className="h-9 w-48 rounded-sm border border-border bg-background px-3 text-sm text-foreground" value={airlineCode} onChange={(e) => setAirlineCode(e.target.value)}>
                  {airlines.map((a) => <option key={a.code} value={a.code}>{a.label}</option>)}
                </Select>
              </div>
              <div className="ml-auto">
                <span className={cn('inline-flex items-center gap-1.5 rounded-sm border px-3 py-1.5 text-xs font-semibold', statusColors[status])}>
                  {status === 'Completed' ? <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" /> : <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />}
                  {status}
                </span>
              </div>
            </div>

            <dl className="mt-6 grid gap-px overflow-hidden rounded-sm border border-border bg-border sm:grid-cols-3 lg:grid-cols-6">
              {[
                ['Reference window', `${formatDate(period.start)} – ${formatDate(period.end)}`],
                ['Base period', basePeriodLabel || BASE_PERIOD],
                ['Days evaluated', `${result?.availableDays ?? 0} of ${result?.expectedDays ?? 0}`],
                ['Observations', formatNumber(result?.observations ?? 0)],
                ['Average index', result?.average ? result.average.toFixed(2) : '—'],
                ['Route coverage', `${result?.routes ?? 0} routes · ${result?.airlines ?? 1} ${result?.airlines === 1 ? 'carrier' : 'carriers'}`],
              ].map(([term, value]) => (
                <div key={term} className="bg-background px-4 py-3">
                  <dt className="text-[11px] uppercase tracking-[0.1em] text-muted-foreground">{term}</dt>
                  <dd className="mt-1 text-sm font-medium text-foreground">{value}</dd>
                </div>
              ))}
            </dl>
          </Card>
        </section>

        <section className="container-gov pb-8">
          <Card className="p-4 md:p-6">
            <div className="flex items-baseline justify-between gap-2">
              <h2 className="text-lg font-semibold text-foreground">Reconstructed Index Series</h2>
              <p className="text-xs text-muted-foreground">APIx · daily</p>
            </div>
            <div className="mt-4 h-[320px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <RechartsLineChart data={chartData} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
                  <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="date" tickFormatter={(value: string) => formatDate(value).replace(/ \d{4}$/, '')} tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} stroke="hsl(var(--border))" minTickGap={28} />
                  <YAxis domain={['dataMin - 2', 'dataMax + 2']} tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} stroke="hsl(var(--border))" width={48} />
                  <ReferenceLine y={BASE_INDEX} stroke="hsl(var(--muted-foreground))" strokeDasharray="4 4" label={{ value: `Base = ${BASE_INDEX}`, position: 'insideTopRight', style: { fontSize: 11, fill: 'hsl(var(--muted-foreground))' } }} />
                  <Tooltip
                    contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '0.375rem', padding: '0.75rem' }}
                    formatter={(value, name) => [Number(value).toFixed(2), name === 'index' ? 'APIx' : name === 'change' ? 'Daily change (%)' : String(name)]}
                    labelFormatter={(label) => formatDate(String(label))}
                  />
                  <Line type="monotone" dataKey="index" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} isAnimationActive={false} />
                </RechartsLineChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </section>

        {result?.highest && (
          <section className="container-gov pb-8">
            <div className="grid gap-4 md:grid-cols-4">
              {[
                { icon: TrendingUp, label: 'Highest index', value: result.highest.index.toFixed(2), sub: formatDate(result.highest.date) },
                { icon: TrendingDown, label: 'Lowest index', value: result.lowest.index.toFixed(2), sub: formatDate(result.lowest.date) },
                { icon: TrendingUp, label: 'Largest increase', value: pct(result.largestIncrease.dailyChange), sub: formatDate(result.largestIncrease.date) },
                { icon: TrendingDown, label: 'Largest decrease', value: pct(result.largestDecrease.dailyChange), sub: formatDate(result.largestDecrease.date) },
              ].map(({ icon: Icon, label, value, sub }) => (
                <div key={label} className="rounded-sm border border-border bg-card p-4">
                  <p className="text-[11px] uppercase tracking-[0.1em] text-muted-foreground">{label}</p>
                  <p className="mt-1 flex items-center gap-2 font-serif text-2xl font-bold tabular-nums text-foreground">
                    <Icon className="h-4 w-4 text-primary" aria-hidden="true" />
                    {value}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">{sub}</p>
                </div>
              ))}
            </div>
          </section>
        )}

        <section className="container-gov pb-8">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-foreground">Route Contributions</h2>
              <p className="text-sm text-muted-foreground">Index contribution by route over the evaluation window.</p>
            </div>
          </div>
          <div className="mt-4 overflow-x-auto rounded-sm border border-border">
            <Table
              columns={[
                { key: 'route', header: 'Route', accessor: (row: ContributionRow) => row.route },
                { key: 'weight', header: 'DGCA Weight', accessor: (row: ContributionRow) => `${row.weight.toFixed(1)}%`, align: 'right', sortable: true },
                { key: 'baseFare', header: 'Base Fare', accessor: (row: ContributionRow) => `₹${row.baseFare.toLocaleString('en-IN')}`, align: 'right', sortable: true },
                { key: 'avgFare', header: 'Average Fare', accessor: (row: ContributionRow) => `₹${row.avgFare.toLocaleString('en-IN')}`, align: 'right', sortable: true },
                { key: 'index', header: 'Route Index', accessor: (row: ContributionRow) => row.index.toFixed(1), align: 'right', sortable: true },
                { key: 'fareChange', header: 'Fare Change', accessor: (row: ContributionRow) => pct(row.fareChange), align: 'right', sortable: true },
                { key: 'contribution', header: 'Contribution', accessor: (row: ContributionRow) => row.contribution.toFixed(1), align: 'right', sortable: true },
              ]}
              data={result?.contributions ?? []}
              keyExtractor={(row: ContributionRow) => row.route}
            />
          </div>
        </section>

        {result?.quality && (
          <section className="container-gov pb-10">
            <Card className="p-4 md:p-6">
              <h2 className="text-lg font-semibold text-foreground">Data Quality During Evaluation</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Records received, cleaned and used across the evaluation window.
              </p>
              <dl className="mt-5 grid gap-px overflow-hidden rounded-sm border border-border bg-border sm:grid-cols-3 lg:grid-cols-6">
                {[
                  ['Records received', formatNumber(result.quality.before)],
                  ['Records after cleaning', formatNumber(result.quality.after)],
                  ['Duplicates removed', formatNumber(result.quality.duplicates)],
                  ['Outliers treated', formatNumber(result.quality.outliers)],
                  ['Invalid records dropped', formatNumber(result.quality.invalid)],
                  ['Missing days', formatNumber(result.missingDays)],
                ].map(([term, value]) => (
                  <div key={term} className="bg-background px-4 py-3">
                    <dt className="text-[11px] uppercase tracking-[0.1em] text-muted-foreground">{term}</dt>
                    <dd className="mt-1 text-sm font-semibold tabular-nums text-foreground">{value}</dd>
                  </div>
                ))}
              </dl>
            </Card>
          </section>
        )}
      </main>
    </div>
  )
}

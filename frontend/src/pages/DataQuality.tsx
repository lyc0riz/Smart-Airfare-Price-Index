import { useEffect, useState } from 'react'
import { CheckCircle2, FilterX, ShieldCheck } from 'lucide-react'
import { Card } from '../components/ui/Card'
import { Table } from '../components/ui/Table'
import { useDataProvider } from '../hooks/useDataProvider'
import { formatDate, pct } from '../lib/utils'
import type { CoverageRow, BacktestResult } from '../lib/types'
import { AVAILABLE_PERIODS, type Portal } from '../lib/constants'
import { cn } from '../lib/utils'

const QUALITY_STAGES = [
  { stage: '1', name: 'Collection', detail: 'Raw fare observations captured within scheduled cycles before any modification.' },
  { stage: '2', name: 'Cleaning & Validation', detail: 'Schema checks, de-duplication, handling of sold-out and cancelled records.' },
  { stage: '3', name: 'Outlier Treatment', detail: 'Statistical rules applied at route-window level rather than global thresholds.' },
  { stage: '4', name: 'Imputation', detail: 'Missing cells completed only when supported by observed neighbouring cells.' },
]

export function DataQuality() {
  const { provider } = useDataProvider()
  const [coverage, setCoverage] = useState<CoverageRow[]>([])
  const [probe, setProbe] = useState<BacktestResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    Promise.all([
      provider.getCoverage(30),
      provider.getBacktestData(AVAILABLE_PERIODS[0]!.start, AVAILABLE_PERIODS[0]!.end, 'ALL'),
    ]).then(
      ([covRes, probeRes]) => {
        if (!cancelled) {
          setCoverage(covRes.data)
          setProbe(probeRes.data)
          setLoading(false)
        }
      },
      (err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load coverage')
          setLoading(false)
        }
      }
    )
    return () => { cancelled = true }
  }, [provider])

  const portals = [...new Set(coverage.map((c) => c.source_portal))] as Portal[]
  const portalStats = portals.map((portal) => {
    const rows = coverage.filter((c) => c.source_portal === portal)
    const quotes = rows.reduce((s, r) => s + r.quotes, 0)
    const imputed = rows.reduce((s, r) => s + r.imputed, 0)
    return { portal, quotes, imputed, imputedPct: quotes ? (imputed / quotes) * 100 : 0, days: rows.length }
  })

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <main className="flex-1 pb-20">
        <section className="border-b border-border bg-muted/50">
          <div className="container-gov py-8">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Statistical Assurance</p>
            <h1 className="mt-2 text-3xl font-bold text-foreground md:text-4xl">Data Quality</h1>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground md:text-base">
              Validation, outlier treatment and completeness reporting.
            </p>
            <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
              APIx applies a documented cleaning pipeline so that published figures are computed
              only from validated observations.
            </p>
          </div>
        </section>

        <section className="container-gov py-8">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-semibold text-foreground">Cleaning Pipeline</h2>
            <span className="inline-flex items-center gap-1.5 rounded-sm border border-border bg-background px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
              <ShieldCheck className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
              {coverage.length > 0 ? 'Live source statistics' : 'Prototype statistics'}
            </span>
          </div>
          <div className="mt-4 grid gap-px overflow-hidden rounded-sm border border-border bg-border sm:grid-cols-2 lg:grid-cols-4">
            {QUALITY_STAGES.map((s) => (
              <div key={s.stage} className="bg-card p-5">
                <span className="flex h-8 w-8 items-center justify-center rounded-sm bg-primary text-sm font-semibold text-primary-foreground">{s.stage}</span>
                <h3 className="mt-3 text-base font-semibold text-foreground">{s.name}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{s.detail}</p>
              </div>
            ))}
          </div>
        </section>

        {probe && (
          <section className="container-gov pb-8">
            <h2 className="text-lg font-semibold text-foreground">Quality Metrics</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Figures shown for the latest evaluation window ({formatDate(probe.start)} – {formatDate(probe.end)}).
            </p>
            <dl className="mt-4 grid gap-px overflow-hidden rounded-sm border border-border bg-border sm:grid-cols-3 lg:grid-cols-6">
              {[
                ['Records received', probe.quality.before],
                ['After cleaning', probe.quality.after],
                ['Duplicates removed', probe.quality.duplicates],
                ['Outliers treated', probe.quality.outliers],
                ['Invalid dropped', probe.quality.invalid],
                ['Missing days', probe.missingDays],
              ].map(([term, value]) => (
                <div key={term} className="bg-background px-4 py-3">
                  <dt className="text-[11px] uppercase tracking-[0.1em] text-muted-foreground">{term}</dt>
                  <dd className="mt-1 text-base font-semibold tabular-nums text-foreground">{Number(value).toLocaleString('en-IN')}</dd>
                </div>
              ))}
            </dl>
          </section>
        )}

        <section className="container-gov pb-8">
          <Card className="p-4 md:p-6">
            <h2 className="text-lg font-semibold text-foreground">Observed Quotes by Source</h2>
            <div className="mt-4 grid gap-px overflow-hidden rounded-sm border border-border bg-border sm:grid-cols-2 lg:grid-cols-4">
              {portalStats.map((p) => (
                <div key={p.portal} className="bg-background px-4 py-4">
                  <p className="text-[11px] uppercase tracking-[0.1em] text-muted-foreground">{p.portal}</p>
                  <p className="mt-1 font-serif text-2xl font-bold tabular-nums text-foreground">{p.quotes.toLocaleString('en-IN')}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {p.imputed} imputed ({pct(p.imputedPct)})
                  </p>
                </div>
              ))}
            </div>

            <h3 className="mt-6 text-sm font-semibold text-foreground">Recent Scrape Cycles</h3>
            {loading && <p className="mt-3 text-sm text-muted-foreground">Loading coverage data…</p>}
            {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
            {!loading && !error && (
              <div className="mt-3 overflow-x-auto rounded-sm border border-border">
                <Table
                  columns={[
                    { key: 'journey_date', header: 'Journey Date', accessor: (row: CoverageRow) => formatDate(row.journey_date) },
                    { key: 'source_portal', header: 'Source', accessor: (row: CoverageRow) => row.source_portal },
                    { key: 'quotes', header: 'Quotes Collected', accessor: (row: CoverageRow) => row.quotes.toLocaleString('en-IN'), align: 'right' },
                    { key: 'imputed', header: 'Imputed Quotes', accessor: (row: CoverageRow) => row.imputed.toLocaleString('en-IN'), align: 'right' },
                    { key: 'imputed_pct', header: 'Imputation %', accessor: (row: CoverageRow) => `${row.imputed_pct.toFixed(2)}%`, align: 'right' },
                    { key: 'status', header: 'Status', accessor: (row: CoverageRow) => (
                      <span className={cn('inline-flex items-center gap-1 text-xs', row.quotes > 0 ? 'text-green-700 dark:text-green-400' : 'text-destructive')}>
                        {row.quotes > 0 ? <CheckCircle2 className="h-3 w-3" /> : <FilterX className="h-3 w-3" />}
                        {row.quotes > 0 ? 'Collected' : 'Failed'}
                      </span>
                    ) },
                  ]}
                  data={coverage}
                  keyExtractor={(row: CoverageRow) => `${row.journey_date}-${row.source_portal}`}
                />
              </div>
            )}
          </Card>
        </section>
      </main>
    </div>
  )
}

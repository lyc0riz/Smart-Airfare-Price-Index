import { useEffect, useMemo, useState } from 'react'
import { Search, Database, Download } from 'lucide-react'
import { Card } from '../components/ui/Card'
import { Select } from '../components/ui/Select'
import { Table } from '../components/ui/Table'
import { Button } from '../components/ui/Button'
import { useDataProvider } from '../hooks/useDataProvider'
import { useMetadata } from '../hooks/useMetadata'
import { formatINR, formatDate, pct } from '../lib/utils'
import type { RouteRow, ByRouteRow } from '../lib/types'

const PAGE_SIZE = 8

export function DataExplorer() {
  const { provider } = useDataProvider()
  const { routes, airlines, latestDate } = useMetadata()

  const [airlineCode, setAirlineCode] = useState('ALL')
  const [portal, setPortal] = useState('Ixigo')
  const [query, setQuery] = useState('')
  const [sortKey, setSortKey] = useState<keyof RouteRow>('avgFare')
  const [sortAsc, setSortAsc] = useState(false)
  const [page, setPage] = useState(0)

  const [rows, setRows] = useState<RouteRow[]>([])
  const [liveRows, setLiveRows] = useState<ByRouteRow[] | null>(null)
  const [liveError, setLiveError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    provider.getRouteTable(airlineCode).then((res) => {
      if (!cancelled) setRows(res.data as RouteRow[])
    }).catch(() => {})
    return () => { cancelled = true }
  }, [provider, airlineCode])

  useEffect(() => {
    let cancelled = false
    provider.getByRoute(latestDate, portal).then(
      (res) => { if (!cancelled) { setLiveRows(res.data); setLiveError(null) } },
      (err: unknown) => { if (!cancelled) { setLiveRows(null); setLiveError(err instanceof Error ? err.message : 'Failed to load route data') } }
    )
    return () => { cancelled = true }
  }, [provider, portal, latestDate])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const list = rows.filter((r) => r.route.toLowerCase().includes(q))
    return [...list].sort((a, b) => {
      const av = a[sortKey]
      const bv = b[sortKey]
      if (typeof av === 'string' || typeof bv === 'string') {
        return sortAsc ? String(av).localeCompare(String(bv)) : String(bv).localeCompare(String(av))
      }
      return sortAsc ? (av as number) - (bv as number) : (bv as number) - (av as number)
    })
  }, [rows, query, sortKey, sortAsc])

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const currentPage = Math.min(page, pageCount - 1)
  const pagedRows = filtered.slice(currentPage * PAGE_SIZE, currentPage * PAGE_SIZE + PAGE_SIZE)

  function toggleSort(key: string, direction: 'asc' | 'desc') {
    setSortKey(key as keyof RouteRow)
    setSortAsc(direction === 'asc')
    setPage(0)
  }

  const totalObservations = rows.reduce((s, r) => s + r.observations, 0)

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <main className="flex-1 pb-20">
        <section className="border-b border-border bg-muted/50">
          <div className="container-gov py-8">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Open Data</p>
            <h1 className="mt-2 text-3xl font-bold text-foreground md:text-4xl">Data Explorer</h1>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground md:text-base">
              Explore cleaned airfare observations and statistical records.
            </p>
            <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
              Summary observations are presented at route level, with the underlying record
              structure described in the API documentation.
            </p>
            <dl className="mt-6 grid gap-px overflow-hidden rounded-sm border border-border bg-border sm:grid-cols-2 lg:grid-cols-4">
              {[
                ['Routes tracked', String(routes.length - 1)],
                ['Latest observation date', formatDate(latestDate)],
                ['Total observations', totalObservations.toLocaleString('en-IN')],
                ['Carriers covered', String(airlines.length - 1)],
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
          <Card className="p-4 md:p-6">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground">
                  <Database className="h-5 w-5 text-primary" aria-hidden="true" />
                  Airfare Records
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">Route-level cleaned observations.</p>
              </div>
              <div className="flex flex-wrap items-end gap-3">
                <div className="relative">
                  <label htmlFor="exp-search" className="sr-only">Search routes</label>
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                  <input
                    id="exp-search"
                    type="search"
                    value={query}
                    onChange={(e) => { setQuery(e.target.value); setPage(0) }}
                    placeholder="Search route"
                    className="h-9 w-56 rounded-sm border border-border bg-background pl-8 pr-3 text-sm text-foreground"
                  />
                </div>
                <div>
                  <label htmlFor="exp-airline" className="mb-1 block text-[11px] uppercase tracking-[0.1em] text-muted-foreground">Airline</label>
                  <Select id="exp-airline" className="h-9 w-44 rounded-sm border border-border bg-background px-3 text-sm text-foreground" value={airlineCode} onChange={(e) => setAirlineCode(e.target.value)}>
                    {airlines.map((a) => <option key={a.code} value={a.code}>{a.label}</option>)}
                  </Select>
                </div>
                <Button variant="outline" size="sm"><Download className="mr-2 h-4 w-4" aria-hidden="true" /> CSV</Button>
              </div>
            </div>

            <div className="mt-5 overflow-x-auto rounded-sm border border-border">
              <Table
                columns={[
                  { key: 'route', header: 'Route', accessor: (row: RouteRow) => row.route, sortable: true },
                  { key: 'avgFare', header: 'Average Fare', accessor: (row: RouteRow) => formatINR(row.avgFare), align: 'right', sortable: true },
                  { key: 'index', header: 'Route Index', accessor: (row: RouteRow) => row.index.toFixed(1), align: 'right', sortable: true },
                  { key: 'change', header: 'Change %', accessor: (row: RouteRow) => pct(row.change), align: 'right', sortable: true },
                  { key: 'observations', header: 'Observations', accessor: (row: RouteRow) => row.observations.toLocaleString('en-IN'), align: 'right', sortable: true },
                ]}
                data={pagedRows}
                keyExtractor={(row: RouteRow) => row.route}
                sortKey={sortKey as string}
                sortDirection={sortAsc ? 'asc' : 'desc'}
                onSort={toggleSort}
                emptyMessage="No routes match your search."
              />
            </div>

            <div className="mt-3 flex items-center justify-between gap-3">
              <p className="text-xs text-muted-foreground">Showing {pagedRows.length} of {filtered.length} routes</p>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => setPage(Math.max(currentPage - 1, 0))} disabled={currentPage === 0}>Previous</Button>
                <span className="text-xs text-muted-foreground">Page {currentPage + 1} of {pageCount}</span>
                <Button variant="outline" size="sm" onClick={() => setPage(Math.min(currentPage + 1, pageCount - 1))} disabled={currentPage >= pageCount - 1}>Next</Button>
              </div>
            </div>
          </Card>
        </section>

        <section className="container-gov pb-10">
          <Card className="p-4 md:p-6">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-foreground">Latest Observed Quotes</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Fare-level observations for the latest observation date, by source portal.
                </p>
              </div>
              <div>
                <label htmlFor="exp-portal" className="mb-1 block text-[11px] uppercase tracking-[0.1em] text-muted-foreground">Source</label>
                <Select id="exp-portal" className="h-9 w-44 rounded-sm border border-border bg-background px-3 text-sm text-foreground" value={portal} onChange={(e) => setPortal(e.target.value)}>
                  <option value="Ixigo">Ixigo</option>
                  <option value="Google Flights">Google Flights</option>
                </Select>
              </div>
            </div>

            {liveError && <p className="mt-5 text-sm text-destructive">Unable to load quotes: {liveError}</p>}
            {!liveError && !liveRows && <p className="mt-5 text-sm text-muted-foreground">Loading quotes…</p>}

            {liveRows && (
              <div className="mt-5 overflow-x-auto rounded-sm border border-border">
                <Table
                  columns={[
                    { key: 'route', header: 'Route', accessor: (row: ByRouteRow) => `${row.origin}–${row.destination}` },
                    { key: 'fare', header: 'Average Fare', accessor: (row: ByRouteRow) => formatINR(row.fare), align: 'right' },
                    { key: 'base_period_fare', header: 'Base Fare', accessor: (row: ByRouteRow) => formatINR(row.base_period_fare), align: 'right' },
                    { key: 'index_value', header: 'Route Index', accessor: (row: ByRouteRow) => row.index_value.toFixed(1), align: 'right' },
                    { key: 'route_weight', header: 'Weight', accessor: (row: ByRouteRow) => `${(row.route_weight * 100).toFixed(1)}%`, align: 'right' },
                  ]}
                  data={liveRows}
                  keyExtractor={(row: ByRouteRow) => `${row.origin}-${row.destination}`}
                />
              </div>
            )}
          </Card>
        </section>
      </main>
    </div>
  )
}
